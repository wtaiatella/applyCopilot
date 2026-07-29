import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { ProfileDTO, BasicDataDTO, ExperienceDTO, EducationDTO, ProjectDTO } from "@/types/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    let profile = await prisma.userProfile.findUnique({
      where: { userId },
      include: {
        experiences: {
          include: {
            bullets: {
              where: {
                isArchived: false,
              },
              include: {
                usedInCVs: {
                  include: {
                    cv: true,
                  },
                },
              },
              orderBy: {
                sortOrder: "asc",
              },
            },
          },
          orderBy: {
            startDate: "desc",
          },
        },
        education: {
          include: {
            bullets: {
              where: {
                isArchived: false,
              },
              include: {
                usedInCVs: {
                  include: {
                    cv: true,
                  },
                },
              },
              orderBy: {
                sortOrder: "asc",
              },
            },
          },
          orderBy: {
            startDate: "desc",
          },
        },
        projects: {
          include: {
            bullets: {
              where: {
                isArchived: false,
              },
              include: {
                usedInCVs: {
                  include: {
                    cv: true,
                  },
                },
              },
              orderBy: {
                sortOrder: "asc",
              },
            },
          },
          orderBy: {
            startDate: "desc",
          },
        },
        skills: true,
        references: true,
        summaries: {
          orderBy: {
            sortOrder: "asc",
          },
        },
        cvs: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!profile) {
      // Verify user existence in DB to prevent foreign key errors with orphaned session cookies
      const userExists = await prisma.user.findUnique({ where: { id: userId } });
      if (!userExists) {
        return NextResponse.json({ error: "Unauthorized: User session invalid or deleted" }, { status: 401 });
      }

      // Fallback in case profile is not initialized
      profile = await prisma.userProfile.create({
        data: { userId },
        include: {
          experiences: {
            include: {
              bullets: {
                where: {
                  isArchived: false,
                },
                include: {
                  usedInCVs: {
                    include: {
                      cv: true,
                    },
                  },
                },
                orderBy: {
                  sortOrder: "asc",
                },
              },
            },
            orderBy: {
              startDate: "desc",
            },
          },
          education: {
            include: {
              bullets: {
                where: {
                  isArchived: false,
                },
                include: {
                  usedInCVs: {
                    include: {
                      cv: true,
                    },
                  },
                },
                orderBy: {
                  sortOrder: "asc",
                },
              },
            },
            orderBy: {
              startDate: "desc",
            },
          },
          projects: {
            include: {
              bullets: {
                where: {
                  isArchived: false,
                },
                include: {
                  usedInCVs: {
                    include: {
                      cv: true,
                    },
                  },
                },
                orderBy: {
                  sortOrder: "asc",
                },
              },
            },
            orderBy: {
              startDate: "desc",
            },
          },
          skills: true,
          references: true,
          summaries: {
            orderBy: {
              sortOrder: "asc",
            },
          },
          cvs: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      });
    }

    const basicData: BasicDataDTO = {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: session.user.email || "",
      phone: profile.phone,
      location: profile.location,
      linkedin: profile.linkedin,
      github: profile.github,
      website: profile.website,
      title: profile.title,
      summary: profile.summary,
    };

    const experiences: ExperienceDTO[] = profile.experiences.map((exp) => ({
      id: exp.id,
      company: exp.company,
      position: exp.position,
      startDate: exp.startDate.toISOString(),
      endDate: exp.endDate ? exp.endDate.toISOString() : null,
      current: exp.current,
      bullets: exp.bullets.map((b) => ({
        id: b.id,
        text: b.text,
        isActive: b.isActive,
        isArchived: b.isArchived,
        type: b.type,
        sortOrder: b.sortOrder,
        usedInCVs: b.usedInCVs.map((uc) => ({
          id: uc.cv.id,
          name: uc.cv.name,
        })),
      })),
      freeFormContext: exp.freeFormContext,
      tabLabel: exp.tabLabel ?? null,
    }));

    const education: EducationDTO[] = profile.education.map((edu) => ({
      id: edu.id,
      institution: edu.institution,
      degree: edu.degree,
      fieldOfStudy: edu.fieldOfStudy,
      startDate: edu.startDate.toISOString(),
      endDate: edu.endDate ? edu.endDate.toISOString() : null,
      current: edu.current,
      hideEndDate: edu.hideEndDate,
      bullets: edu.bullets.map((b) => ({
        id: b.id,
        text: b.text,
        isActive: b.isActive,
        isArchived: b.isArchived,
        type: b.type,
        sortOrder: b.sortOrder,
        usedInCVs: b.usedInCVs.map((uc) => ({
          id: uc.cv.id,
          name: uc.cv.name,
        })),
      })),
      freeFormContext: edu.freeFormContext,
      tabLabel: edu.tabLabel ?? null,
    }));

    const projects: ProjectDTO[] = profile.projects.map((proj) => ({
      id: proj.id,
      name: proj.name,
      startDate: proj.startDate ? proj.startDate.toISOString() : null,
      endDate: proj.endDate ? proj.endDate.toISOString() : null,
      current: proj.current,
      technologies: proj.technologies,
      bullets: proj.bullets.map((b) => ({
        id: b.id,
        text: b.text,
        isActive: b.isActive,
        isArchived: b.isArchived,
        type: b.type,
        sortOrder: b.sortOrder,
        usedInCVs: b.usedInCVs.map((uc) => ({
          id: uc.cv.id,
          name: uc.cv.name,
        })),
      })),
      freeFormContext: proj.freeFormContext,
      tabLabel: proj.tabLabel ?? null,
    }));

    const responseData: ProfileDTO = {
      id: profile.id,
      basicData,
      experiences,
      education,
      projects,
      skills: profile.skills.map((s) => ({
        id: s.id,
        name: s.name,
        proficiency: s.proficiency,
        yearsExperience: s.yearsExperience,
      })),
      references: profile.references.map((r) => ({
        id: r.id,
        name: r.name,
        company: r.company,
        relationship: r.relationship,
        email: r.email,
        phone: r.phone,
        canContact: r.canContact,
      })),
      summaries: profile.summaries.map((sum) => ({
        id: sum.id,
        title: sum.title,
        content: sum.content,
        isActive: sum.isActive,
        isAIGenerated: sum.isAIGenerated,
        sortOrder: sum.sortOrder,
      })),
      cvs: profile.cvs.map((cv) => ({
        id: cv.id,
        name: cv.name,
        s3Key: cv.s3Key,
        createdAt: cv.createdAt.toISOString(),
      })),
      embeddingSyncedAt: profile.embeddingSyncedAt ? profile.embeddingSyncedAt.toISOString() : null,
      aiCleanedText: profile.aiCleanedText,
    };

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Failed to fetch profile", { error });
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
