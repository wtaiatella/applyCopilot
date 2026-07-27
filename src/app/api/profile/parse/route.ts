import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { DocumentExtractor } from "@/lib/parsing/documentExtract";
import { ProfileMergeService } from "@/lib/merge/profileMergeService";
import { generateJSON } from "@/lib/ai/aiClient";
import { logger } from "@/lib/logging/logger";
import { 
  BasicDataDTO, 
  ExperienceDTO, 
  ProjectDTO,
  EducationDTO, 
  SkillDTO,
  ParseProgressEvent 
} from "@/types/profile";



export const dynamic = "force-dynamic";

/**
 * Defensive helper: ensures an LLM response is always an array.
 * Some models wrap the array in an object (e.g. { "experiences": [...] })
 * instead of returning a bare array. This extracts the first array value found.
 */
function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const firstArray = Object.values(value as Record<string, unknown>).find(Array.isArray);
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

    // 2. Rate limiting check (50 parses per user per day)
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
        { status: 429 }
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
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          // STEP 1: Upload & Extract text (20%)
          sendEvent({ phase: "upload", progress: 20, status: "Extracting text from document..." });
          const extractedText = await DocumentExtractor.extractText(buffer, filename);
          
          if (!extractedText.trim()) {
            throw new Error("Could not extract any text from the document.");
          }

          // STEP 2: General info / basic data (40%)
          sendEvent({ phase: "basic", progress: 40, status: "Extracting contact and summary details..." });
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

          const parsedBasic = await generateJSON<BasicDataDTO>(basicPrompt, "parsing");
          await ProfileMergeService.mergeBasicData(profileId, parsedBasic);
          sendEvent({ phase: "basic", progress: 40, status: "General info saved.", data: parsedBasic });

          // STEP 3: Experiences (60%)
          sendEvent({ phase: "experiences", progress: 60, status: "Extracting work history..." });
          // NOTE: freeFormContext is intentionally omitted — it is a user-authored field
          // that should never be auto-populated from the CV. Bullets from the CV are imported
          // as PARAGRAPH type since they represent narrative text from the source document.
          const experiencesPrompt = `You are an expert resume parser. Read the resume text below and extract all professional work experiences.
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
        "text": "bullet description string",
        "type": "PARAGRAPH"
      }
    ]
  }
]

Resume Text:
${extractedText}`;

          const rawExperiences = await generateJSON<unknown>(experiencesPrompt, "parsing");
          const parsedExperiences = toArray<ExperienceDTO>(rawExperiences);
          logger.info(`Parsed ${parsedExperiences.length} experiences from CV`);
          await ProfileMergeService.mergeExperiences(profileId, parsedExperiences);
          sendEvent({ phase: "experiences", progress: 60, status: "Work history saved.", data: parsedExperiences });

          // STEP 4: Projects (80%) — only explicit projects listed in the CV are imported.
          // The AI fallback that inferred projects from work experiences has been removed;
          // users can generate project suggestions manually via the profile page.
          sendEvent({ phase: "projects", progress: 80, status: "Extracting projects..." });
          const projectsPrompt = `You are an expert resume parser. Read the resume text below and extract side projects or major initiatives explicitly listed in a dedicated projects section.
Do NOT infer or derive projects from the work experience section.
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
        "text": "bullet description string",
        "type": "PARAGRAPH"
      }
    ]
  }
]
If no explicit projects section exists, return an empty array [].

Resume Text:
${extractedText}`;

          const parsedProjects = toArray<ProjectDTO>(await generateJSON<unknown>(projectsPrompt, "parsing"));
          logger.info(`Parsed ${parsedProjects.length} explicit projects from CV`);
          await ProfileMergeService.mergeProjects(profileId, parsedProjects);
          sendEvent({ phase: "projects", progress: 80, status: "Projects saved.", data: parsedProjects });

          // STEP 5: Education & Skills (100%)
          sendEvent({ phase: "education", progress: 100, status: "Extracting education and skills..." });
          // NOTE: freeFormContext intentionally omitted from education bullets — user-authored field only.
          const edSkillsPrompt = `You are an expert resume parser. Read the resume text below and extract education credentials and key skills.
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
          "text": "string",
          "type": "PARAGRAPH"
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

          let parsedEdSkills = await generateJSON<EdSkillsResponse>(edSkillsPrompt, "parsing");

          // Normalize: LLM may return education/skills wrapped or as bare arrays
          if (parsedEdSkills) {
            if (!Array.isArray(parsedEdSkills.education)) {
              parsedEdSkills.education = toArray<EducationDTO>(parsedEdSkills.education as unknown);
            }
            if (!Array.isArray(parsedEdSkills.skills)) {
              parsedEdSkills.skills = toArray<SkillDTO>(parsedEdSkills.skills as unknown);
            }
          }

          // AI Fallback for skills
          if (!parsedEdSkills || !parsedEdSkills.skills || parsedEdSkills.skills.length === 0) {
            logger.info("Main parsing returned empty skills. Triggering fallback skill extraction prompt.");
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
            const fallbackSkills = toArray<SkillDTO>(await generateJSON<unknown>(skillFallbackPrompt, "parsing"));
            if (!parsedEdSkills) {
              parsedEdSkills = { education: [], skills: fallbackSkills };
            } else {
              parsedEdSkills.skills = fallbackSkills;
            }
          }

          await ProfileMergeService.mergeEducation(profileId, parsedEdSkills.education);
          await ProfileMergeService.mergeSkills(profileId, parsedEdSkills.skills);

          // Save the CV version record
          await prisma.cV.create({
            data: {
              profileId,
              name: `Imported from ${filename}`,
            },
          });

          sendEvent({ 
            phase: "education", 
            progress: 100, 
            status: "Resume parsing and import completed successfully!", 
            data: parsedEdSkills 
          });
          
          controller.close();
        } catch (error) {
          const err = error as Error;
          logger.error("SSE Parsing failed", { error: err.message });
          sendEvent({ phase: "error", progress: 0, error: err.message || "CV parsing failed." });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Disable buffering in Nginx
      },
    });
  } catch (error) {
    const err = error as Error;
    logger.error("Failed to start CV parsing SSE handler", { error: err.message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
