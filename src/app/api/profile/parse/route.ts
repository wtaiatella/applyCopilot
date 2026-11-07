import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { DocumentExtractor } from "@/lib/parsing/documentExtract";
import { ProfileMergeService } from "@/lib/merge/profileMergeService";
import { generateJSON } from "@/lib/ai/aiClient";
import { normalizeProficiency } from "@/lib/normalization/proficiencyNormalizer";
import { logger } from "@/lib/logging/logger";
import { IngestionDebugSession } from "@/lib/parsing/debugIngestionStorage";
import {
  BasicDataDTO,
  ExperienceDTO,
  ProjectDTO,
  EducationDTO,
  SkillDTO,
  ParseProgressEvent,
} from "@/types/profile";

export const dynamic = "force-dynamic";

/**
 * Normalizes bullet items defensively:
 * - ensures valid type ("PARAGRAPH" or "BULLET")
 * - defaults to PARAGRAPH if type is explicitly PARAGRAPH or if text has narrative phrasing without bullet marker
 * - defaults to BULLET otherwise
 * - assigns 0-indexed sortOrder matching document sequence if not set
 */
export function normalizeParsedBullets(
  bullets: unknown,
): { text: string; type: "BULLET" | "PARAGRAPH"; sortOrder: number }[] {
  if (!Array.isArray(bullets)) return [];
  return bullets.map((item, idx) => {
    if (!item) {
      return { text: "", type: "BULLET", sortOrder: idx };
    }
    if (typeof item === "string") {
      const trimmed = item.trim();
      const hasBulletMarker = /^[•\-*·]\s*/.test(trimmed);
      return {
        text: trimmed,
        type: hasBulletMarker ? "BULLET" : "PARAGRAPH",
        sortOrder: idx,
      };
    }
    const b = item as Record<string, unknown>;
    const rawText = typeof b.text === "string" ? b.text : "";
    const rawType =
      typeof b.type === "string" ? b.type.trim().toUpperCase() : "";
    let finalType: "BULLET" | "PARAGRAPH";
    if (rawType === "PARAGRAPH") {
      finalType = "PARAGRAPH";
    } else if (rawType === "BULLET") {
      finalType = "BULLET";
    } else {
      // Defensive fallback: check if text has bullet marker or narrative character
      const trimmed = rawText.trim();
      const hasBulletMarker = /^[•\-*·]\s*/.test(trimmed);
      finalType = hasBulletMarker ? "BULLET" : "PARAGRAPH";
    }
    const sortOrder = Number.isInteger(b.sortOrder)
      ? (b.sortOrder as number)
      : idx;
    return {
      text: rawText,
      type: finalType,
      sortOrder,
    };
  });
}

/**
 * Defensive helper: ensures an LLM response is always an array.
 * Some models wrap the array in an object (e.g. { "experiences": [...] })
 * instead of returning a bare array. This extracts the first array value found.
 */
function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const firstArray = Object.values(value as Record<string, unknown>).find(
      Array.isArray,
    );
    if (firstArray) return firstArray as T[];
  }
  return [];
}

export async function POST(req: Request) {
  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Rate limiting check (50 parses per user per day).
    // REM-5 / spectech.md Decision 5: 50/day is the deliberate, decided value — not a drifted
    // default. The original FR2-032 spec value (5/day) was 10x tighter with no cost-abuse
    // evidence to justify it, and this limit already supports a legitimate use case (re-parsing
    // an updated resume, testing different resume versions). No behavior change here.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const parseCount = await prisma.aIUsageLog.count({
      where: {
        userId,
        action: "parse",
        createdAt: { gte: oneDayAgo },
      },
    });

    if (parseCount >= 50) {
      logger.warn(`User ${userId} hit parsing rate limit`, { parseCount });
      return NextResponse.json(
        { error: "Rate limit reached. You can only parse 50 resumes per day." },
        { status: 429 },
      );
    }

    // 3. Parse FormData
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const filename = file.name;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Initialize debug session and save original uploaded binary (only active when LOG_LEVEL=debug)
    const debugSession = new IngestionDebugSession(filename);
    await debugSession.saveOriginal(filename, buffer);

    // Get or create UserProfile
    let userProfile = await prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!userProfile) {
      userProfile = await prisma.userProfile.create({
        data: { userId },
      });
    }
    const profileId = userProfile.id;

    // Log this parsing action to database
    await prisma.aIUsageLog.create({
      data: {
        userId,
        action: "parse",
      },
    });

    // 4. Create SSE response stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: ParseProgressEvent) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        };

        try {
          // STEP 1: Upload & Extract text (20%)
          sendEvent({
            phase: "upload",
            progress: 20,
            status: "Extracting text from document...",
          });
          const extractedText = await DocumentExtractor.extractText(
            buffer,
            filename,
          );
          await debugSession.saveTranscription(extractedText);

          if (!extractedText.trim()) {
            throw new Error("Could not extract any text from the document.");
          }

          // STEP 2: General info / basic data (40%)
          sendEvent({
            phase: "basic",
            progress: 40,
            status: "Extracting contact and summary details...",
          });
          const basicPrompt = `You are an expert resume parser. Read the resume text below and extract personal contact info and a summary.
Return ONLY valid JSON matching this schema:
{
  "firstName": "string or null",
  "lastName": "string or null",
  "phone": "string or null",
  "location": "string or null",
  "linkedin": "string or null",
  "github": "string or null",
  "website": "string or null",
  "title": "string or null",
  "summary": "string or null"
}

Resume Text:
${extractedText}`;

          const parsedBasic = await generateJSON<BasicDataDTO>(
            basicPrompt,
            "cv.parse.basicData",
          );
          await ProfileMergeService.mergeBasicData(profileId, parsedBasic);
          await debugSession.saveStagePayload("01_basic", parsedBasic);
          sendEvent({
            phase: "basic",
            progress: 40,
            status: "General info saved.",
            data: parsedBasic,
          });

          // STEP 3: Experiences (60%)
          sendEvent({
            phase: "experiences",
            progress: 60,
            status: "Extracting work history...",
          });
          // NOTE: freeFormContext is intentionally omitted — it is a user-authored field
          // that should never be auto-populated from the CV.
          // Narrative introductory descriptions (company overview, role context) must be extracted as "PARAGRAPH".
          // Accomplishments, achievements, or responsibility list items (prefixed with bullet glyphs •, -, *, etc.)
          // must be extracted as "BULLET".
          const experiencesPrompt = `You are an expert resume parser. Read the resume text below and extract all professional work experiences.
Extract work experiences preserving the original reading sequence. For each role, examine all descriptions and accomplishments:
- If an item is an introductory overview, company/role narrative description, or context summary (without bullet markers like •, -, *), classify its type as "PARAGRAPH".
- If an item is an itemized accomplishment, achievement, responsibility, or metric (prefixed with bullet glyphs •, -, *, or indented list format), classify its type as "BULLET".
- Preserve all introductory paragraphs and do not omit company summaries.
- Maintain the exact top-to-bottom document reading sequence in the bullets array.

Return ONLY valid JSON as an array of objects matching this schema:
[
  {
    "company": "string (required)",
    "position": "string (required)",
    "startDate": "ISO 8601 date string (YYYY-MM-DD or YYYY-MM)",
    "endDate": "ISO 8601 date string or null if currently employed",
    "current": "boolean",
    "bullets": [
      {
        "text": "description string",
        "type": "BULLET or PARAGRAPH"
      }
    ]
  }
]

Resume Text:
${extractedText}`;

          const rawExperiences = await generateJSON<unknown>(
            experiencesPrompt,
            "cv.parse.experiences",
          );
          const parsedExperiences = toArray<ExperienceDTO>(rawExperiences).map(
            (exp) => ({
              ...exp,
              bullets: normalizeParsedBullets(exp.bullets) as any,
            }),
          );
          logger.info(`Parsed ${parsedExperiences.length} experiences from CV`);
          await ProfileMergeService.mergeExperiences(
            profileId,
            parsedExperiences,
          );
          await debugSession.saveStagePayload(
            "02_experiences",
            parsedExperiences,
          );
          sendEvent({
            phase: "experiences",
            progress: 60,
            status: "Work history saved.",
            data: parsedExperiences,
          });

          // STEP 4: Projects (80%) — only explicit projects listed in the CV are imported.
          // The AI fallback that inferred projects from work experiences has been removed;
          // users can generate project suggestions manually via the profile page.
          sendEvent({
            phase: "projects",
            progress: 80,
            status: "Extracting projects...",
          });
          const projectsPrompt = `You are an expert resume parser. Read the resume text below and extract side projects or major initiatives explicitly listed in a dedicated projects section.
Do NOT infer or derive projects from the work experience section.
For each project, examine all descriptions and highlights:
- If an item is a narrative summary, project overview, or problem description without bullet markers, classify its type as "PARAGRAPH".
- If an item is an itemized feature, achievement, responsibility, or metric with bullet glyphs (•, -, *, etc.), classify its type as "BULLET".
- Maintain the exact top-to-bottom document reading sequence in the bullets array.

Return ONLY valid JSON as an array of objects matching this schema:
[
  {
    "name": "string (required)",
    "startDate": "ISO 8601 date string or null",
    "endDate": "ISO 8601 date string or null",
    "current": "boolean",
    "technologies": ["array", "of", "skill", "tags"],
    "bullets": [
      {
        "text": "description string",
        "type": "BULLET or PARAGRAPH"
      }
    ]
  }
]
If no explicit projects section exists, return an empty array [].

Resume Text:
${extractedText}`;

          const parsedProjects = toArray<ProjectDTO>(
            await generateJSON<unknown>(projectsPrompt, "cv.parse.projects"),
          ).map((proj) => ({
            ...proj,
            bullets: normalizeParsedBullets(proj.bullets) as any,
          }));
          logger.info(
            `Parsed ${parsedProjects.length} explicit projects from CV`,
          );
          await ProfileMergeService.mergeProjects(profileId, parsedProjects);
          await debugSession.saveStagePayload("03_projects", parsedProjects);
          sendEvent({
            phase: "projects",
            progress: 80,
            status: "Projects saved.",
            data: parsedProjects,
          });

          // STEP 5: Education & Skills (100%)
          sendEvent({
            phase: "education",
            progress: 100,
            status: "Extracting education and skills...",
          });
          // NOTE: freeFormContext intentionally omitted from education bullets — user-authored field only.
          const edSkillsPrompt = `You are an expert resume parser. Read the resume text below and extract education credentials and key skills.
For education entries, examine all descriptions and highlights:
- If an item is a narrative summary or program overview without bullet markers, classify its type as "PARAGRAPH".
- If an item is an itemized accomplishment, award, course, or thesis highlight with bullet glyphs (•, -, *, etc.), classify its type as "BULLET".
- Maintain the exact top-to-bottom document reading sequence in the bullets array.

Return ONLY valid JSON matching this schema:
{
  "education": [
    {
      "institution": "string (required)",
      "degree": "string (required)",
      "fieldOfStudy": "string or null",
      "startDate": "ISO 8601 date string",
      "endDate": "ISO 8601 date string or null",
      "current": "boolean",
      "hideEndDate": "boolean",
      "bullets": [
        {
          "text": "description string",
          "type": "BULLET or PARAGRAPH"
        }
      ]
    }
  ],
  "skills": [
    {
      "name": "string (required)",
      "proficiency": "BEGINNER or INTERMEDIATE or ADVANCED or EXPERT",
      "yearsExperience": "number or null"
    }
  ]
}

Resume Text:
${extractedText}`;

          interface EdSkillsResponse {
            education: EducationDTO[];
            skills: SkillDTO[];
          }

          let parsedEdSkills = await generateJSON<EdSkillsResponse>(
            edSkillsPrompt,
            "cv.parse.education",
          );

          // Normalize: LLM may return education/skills wrapped or as bare arrays
          if (parsedEdSkills) {
            if (!Array.isArray(parsedEdSkills.education)) {
              parsedEdSkills.education = toArray<EducationDTO>(
                parsedEdSkills.education as unknown,
              );
            }
            if (!Array.isArray(parsedEdSkills.skills)) {
              parsedEdSkills.skills = toArray<SkillDTO>(
                parsedEdSkills.skills as unknown,
              );
            }
          }

          // AI Fallback for skills
          if (
            !parsedEdSkills ||
            !parsedEdSkills.skills ||
            parsedEdSkills.skills.length === 0
          ) {
            logger.info(
              "Main parsing returned empty skills. Triggering fallback skill extraction prompt.",
            );
            const skillFallbackPrompt = `Extract all technical and soft skills from the following CV as a flat list. For each skill, estimate proficiency level (BEGINNER/INTERMEDIATE/ADVANCED/EXPERT) based on context and years of use.
Return ONLY valid JSON matching this schema:
[
  {
    "name": "string",
    "proficiency": "BEGINNER or INTERMEDIATE or ADVANCED or EXPERT",
    "yearsExperience": "number or null"
  }
]

Resume Text:
${extractedText}`;
            const fallbackSkills = toArray<SkillDTO>(
              await generateJSON<unknown>(
                skillFallbackPrompt,
                "cv.parse.skills",
              ),
            );
            if (!parsedEdSkills) {
              parsedEdSkills = { education: [], skills: fallbackSkills };
            } else {
              parsedEdSkills.skills = fallbackSkills;
            }
          }

          // Pre-merge sanitization: normalize raw skill proficiencies defensively before
          // persisting and emitting to SSE client
          if (parsedEdSkills) {
            if (Array.isArray(parsedEdSkills.education)) {
              parsedEdSkills.education = parsedEdSkills.education.map((ed) => ({
                ...ed,
                bullets: normalizeParsedBullets(ed.bullets) as any,
              }));
            }
            if (Array.isArray(parsedEdSkills.skills)) {
              parsedEdSkills.skills = parsedEdSkills.skills.map((s) => ({
                ...s,
                proficiency: normalizeProficiency(s.proficiency, s.name),
              }));
            }
          }

          await ProfileMergeService.mergeEducation(
            profileId,
            parsedEdSkills.education,
          );
          await ProfileMergeService.mergeSkills(
            profileId,
            parsedEdSkills.skills,
          );

          await debugSession.saveStagePayload(
            "04_education_skills",
            parsedEdSkills,
          );

          const reconciledProfile =
            await ProfileMergeService.getReconciledProfile(profileId);
          await debugSession.saveStagePayload(
            "05_merged",
            reconciledProfile ?? {
              basic: parsedBasic,
              experiences: parsedExperiences,
              projects: parsedProjects,
              education: parsedEdSkills.education,
              skills: parsedEdSkills.skills,
            },
          );

          sendEvent({
            phase: "education",
            progress: 100,
            status: "Resume parsing and import completed successfully!",
            data: parsedEdSkills,
          });

          controller.close();
        } catch (error) {
          const err = error as Error;
          logger.error("SSE Parsing failed", { error: err.message });
          sendEvent({
            phase: "error",
            progress: 0,
            error: err.message || "CV parsing failed.",
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable buffering in Nginx
      },
    });
  } catch (error) {
    const err = error as Error;
    logger.error("Failed to start CV parsing SSE handler", {
      error: err.message,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
