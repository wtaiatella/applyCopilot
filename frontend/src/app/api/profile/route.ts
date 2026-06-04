// Profile API Route
// GET /api/profile - Get complete user profile
// POST /api/profile - Create or update complete profile

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import prisma from '@/lib/prisma';
import {
  successResponse,
  createdResponse,
  handleApiError,
  NotFoundError,
  ValidationError,
} from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new ValidationError('Unauthorized');
    }

    // Check rate limit
    const { allowed, response } = await checkRateLimit('PROFILE', request);
    if (!allowed) {
      return response!;
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
          },
        },
        experiences: {
          orderBy: { startDate: 'desc' },
          include: {
            description: {
              where: { isArchived: false }
            }
          }
        },
        education: {
          orderBy: { startDate: 'desc' },
        },
        projects: {
          orderBy: { startDate: 'desc' },
          include: {
            bulletPoints: {
              where: { isArchived: false }
            }
          }
        },
        skills: {
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        },
        references: {
          orderBy: { name: 'asc' },
        },
        summaries: {
          orderBy: { createdAt: 'desc' },
        },
        cvs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!profile) {
      return successResponse(null);
    }

    // Dynamic CV Mapping - compute badges dynamically in-memory to prevent DB sync drift
    const plainProfile = JSON.parse(JSON.stringify(profile));
    const allCVs = plainProfile.cvs || [];

    if (plainProfile.experiences) {
      for (const exp of plainProfile.experiences) {
        if (exp.description) {
          for (const bullet of exp.description) {
            const matchingCVs = allCVs
              .filter((cv: any) => cv.activeBulletIds && cv.activeBulletIds.includes(bullet.id))
              .map((cv: any) => ({ id: cv.id, name: cv.name }));
            bullet.cvs = matchingCVs;
          }
        }
      }
    }

    if (plainProfile.projects) {
      for (const proj of plainProfile.projects) {
        if (proj.bulletPoints) {
          for (const bullet of proj.bulletPoints) {
            const matchingCVs = allCVs
              .filter((cv: any) => cv.activeBulletIds && cv.activeBulletIds.includes(bullet.id))
              .map((cv: any) => ({ id: cv.id, name: cv.name }));
            bullet.cvs = matchingCVs;
          }
        }
      }
    }

    return successResponse(plainProfile);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new ValidationError('Unauthorized');
    }

    // Check rate limit
    const { allowed, response } = await checkRateLimit('PROFILE', request);
    if (!allowed) {
      return response!;
    }

    const body = await request.json();

    // Upsert profile with basic fields first
    const profile = await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      update: {
        ...(body.basicData?.title !== undefined && { title: body.basicData.title }),
        ...(body.basicData?.location !== undefined && { location: body.basicData.location }),
        ...(body.basicData?.phone !== undefined && { phone: body.basicData.phone }),
        ...(body.basicData?.website !== undefined && { website: body.basicData.website }),
        ...(body.basicData?.github !== undefined && { github: body.basicData.github }),
        ...(body.basicData?.firstName !== undefined && { firstName: body.basicData.firstName }),
        ...(body.basicData?.lastName !== undefined && { lastName: body.basicData.lastName }),
        processingStatus: 'COMPLETED',
      },
      create: {
        userId: session.user.id,
        firstName: body.basicData?.firstName || session.user.name?.split(' ')[0] || 'User',
        lastName: body.basicData?.lastName || session.user.name?.split(' ').slice(1).join(' ') || '',
        title: body.basicData?.title || null,
        location: body.basicData?.location || null,
        phone: body.basicData?.phone || null,
        website: body.basicData?.website || null,
        github: body.basicData?.github || null,
        processingStatus: 'COMPLETED',
      },
    });

    // Sync and save summaries if provided
    const summariesList = body.summaries || body.basicData?.summaries;
    if (summariesList) {
      await prisma.profileSummary.deleteMany({ where: { profileId: profile.id } });
      if (summariesList.length > 0) {
        await prisma.profileSummary.createMany({
          data: summariesList.map((sum: any) => ({
            profileId: profile.id,
            title: sum.title || 'Summary',
            content: sum.content || '',
            isAIGenerated: sum.isAIGenerated || false,
            isActive: sum.isActive || false,
          })),
        });
      }

      // Sync active summary content and title to UserProfile
      const activeSummary = summariesList.find((s: any) => s.isActive);
      await prisma.userProfile.update({
        where: { id: profile.id },
        data: {
          summary: activeSummary ? activeSummary.content : null,
          title: activeSummary ? activeSummary.title : (body.basicData?.title || profile.title),
        },
      });
    }

    // Update related collections if provided in the body
    if (body.experiences) {
      const existingExperiences = await prisma.experience.findMany({
        where: { profileId: profile.id },
        include: { description: true }
      });
      const incomingExpIds = new Set<string>();

      for (const exp of body.experiences) {
        let dbExp;

        // Exact Matching Deduplication (if newly imported or lacks standard ID)
        if (!exp.id || !exp.id.match(/^[0-9a-fA-F]{24}$/)) {
          const match = existingExperiences.find(e => 
            e.company.trim().toLowerCase() === (exp.company || '').trim().toLowerCase() &&
            e.position.trim().toLowerCase() === (exp.position || '').trim().toLowerCase()
          );
          if (match) {
            exp.id = match.id;
          }
        }

        if (exp.id && exp.id.match(/^[0-9a-fA-F]{24}$/)) {
          incomingExpIds.add(exp.id);
          try {
            dbExp = await prisma.experience.update({
              where: { id: exp.id },
              data: {
                company: exp.company || 'Unknown Company',
                position: exp.position || 'Unknown Position',
                startDate: exp.startDate ? new Date(exp.startDate) : new Date(),
                endDate: exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate) : null,
                current: exp.current || exp.endDate === 'Present' || false,
                freeFormContext: exp.freeFormContext || '',
              },
              include: { description: true }
            });
          } catch (updateError) {
            dbExp = await prisma.experience.create({
              data: {
                id: exp.id,
                profileId: profile.id,
                company: exp.company || 'Unknown Company',
                position: exp.position || 'Unknown Position',
                startDate: exp.startDate ? new Date(exp.startDate) : new Date(),
                endDate: exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate) : null,
                current: exp.current || exp.endDate === 'Present' || false,
                freeFormContext: exp.freeFormContext || '',
              },
              include: { description: true }
            });
          }
        } else {
          dbExp = await prisma.experience.create({
            data: {
              profileId: profile.id,
              company: exp.company || 'Unknown Company',
              position: exp.position || 'Unknown Position',
              startDate: exp.startDate ? new Date(exp.startDate) : new Date(),
              endDate: exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate) : null,
              current: exp.current || exp.endDate === 'Present' || false,
              freeFormContext: exp.freeFormContext || '',
            },
            include: { description: true }
          });
          incomingExpIds.add(dbExp.id);
        }

        // Handle Bullet Points
        const existingBullets = dbExp.description || [];

        const incomingBullets = (exp.bulletPoints || exp.description || []).map((bp: any) => {
          if (typeof bp === 'string') {
            return {
              text: bp,
              isActive: true,
              type: 'bullet',
            };
          }
          return bp;
        });

        const incomingBulletIds = new Set<string>();
        for (const bp of incomingBullets) {
          // Exact Match Deduplication
          if (!bp.id || !bp.id.match(/^[0-9a-fA-F]{24}$/)) {
            const match = existingBullets.find(eb => 
              eb.text.trim().toLowerCase() === (bp.text || '').trim().toLowerCase()
            );
            if (match) {
              bp.id = match.id;
            }
          }

          if (bp.id && bp.id.match(/^[0-9a-fA-F]{24}$/)) {
            incomingBulletIds.add(bp.id);
            try {
              await prisma.experienceBullet.update({
                where: { id: bp.id },
                data: {
                  text: bp.text || '',
                  isActive: bp.isActive !== undefined ? bp.isActive : true,
                  type: bp.type || 'bullet',
                }
              });
            } catch (bulletError) {
              const created = await prisma.experienceBullet.create({
                data: {
                  id: bp.id,
                  experienceId: dbExp.id,
                  text: bp.text || '',
                  isActive: bp.isActive !== undefined ? bp.isActive : true,
                  type: bp.type || 'bullet',
                  isArchived: false,
                  cvIds: [],
                }
              });
              incomingBulletIds.add(created.id);
            }
          } else {
            const created = await prisma.experienceBullet.create({
              data: {
                experienceId: dbExp.id,
                text: bp.text || '',
                isActive: bp.isActive !== undefined ? bp.isActive : true,
                type: bp.type || 'bullet',
                isArchived: false,
                cvIds: [],
              }
            });
            incomingBulletIds.add(created.id);
          }
        }

        // Deletions / Archiving with Dynamic CV checking
        if (!body.isImport) {
          const deletedBullets = existingBullets.filter(eb => !eb.isArchived && !incomingBulletIds.has(eb.id));
          for (const dbBullet of deletedBullets) {
            const cvCount = await prisma.cV.count({
              where: {
                activeBulletIds: { has: dbBullet.id }
              }
            });
            if (cvCount > 0) {
              await prisma.experienceBullet.update({
                where: { id: dbBullet.id },
                data: { isArchived: true }
              });
            } else {
              await prisma.experienceBullet.delete({
                where: { id: dbBullet.id }
              });
            }
          }
        }
      }

      if (!body.isImport) {
        const experiencesToDelete = existingExperiences.filter(e => !incomingExpIds.has(e.id));
        for (const e of experiencesToDelete) {
          await prisma.experience.delete({ where: { id: e.id } });
        }
      }
    }

    if (body.education) {
      const existingEdu = await prisma.education.findMany({
        where: { profileId: profile.id }
      });

      const incomingEduMapped = body.education.map((edu: any) => ({
        institution: edu.institution || 'Unknown Institution',
        degree: edu.degree || '',
        field: edu.field || '',
        startDate: edu.startDate ? new Date(edu.startDate) : new Date(),
        endDate: edu.endDate && edu.endDate !== 'Present' ? new Date(edu.endDate) : null,
        current: edu.current || edu.endDate === 'Present' || false,
        description: edu.bulletPoints || edu.description || [],
        freeFormContext: edu.freeFormContext || '',
      }));

      if (body.isImport) {
        // Merge without deleting pre-existing education
        for (const edu of incomingEduMapped) {
          const match = existingEdu.find(e => 
            e.institution.trim().toLowerCase() === edu.institution.trim().toLowerCase() &&
            (e.degree || '').trim().toLowerCase() === edu.degree.trim().toLowerCase()
          );
          if (match) {
            await prisma.education.update({
              where: { id: match.id },
              data: {
                field: edu.field,
                startDate: edu.startDate,
                endDate: edu.endDate,
                current: edu.current,
                description: edu.description,
                freeFormContext: edu.freeFormContext,
              }
            });
          } else {
            await prisma.education.create({
              data: {
                profileId: profile.id,
                ...edu
              }
            });
          }
        }
      } else {
        // Normal overwrite behavior
        await prisma.education.deleteMany({ where: { profileId: profile.id } });
        if (incomingEduMapped.length > 0) {
          await prisma.education.createMany({
            data: incomingEduMapped.map((edu: any) => ({
              profileId: profile.id,
              ...edu
            })),
          });
        }
      }
    }

    if (body.projects) {
      const existingProjects = await prisma.project.findMany({
        where: { profileId: profile.id },
        include: { bulletPoints: true }
      });
      const incomingProjIds = new Set<string>();

      for (const proj of body.projects) {
        let dbProj;

        // Exact Matching Deduplication
        if (!proj.id || !proj.id.match(/^[0-9a-fA-F]{24}$/)) {
          const match = existingProjects.find(p => 
            p.name.trim().toLowerCase() === (proj.name || '').trim().toLowerCase()
          );
          if (match) {
            proj.id = match.id;
          }
        }

        if (proj.id && proj.id.match(/^[0-9a-fA-F]{24}$/)) {
          incomingProjIds.add(proj.id);
          try {
            dbProj = await prisma.project.update({
              where: { id: proj.id },
              data: {
                name: proj.name || 'Unknown Project',
                startDate: proj.startDate ? new Date(proj.startDate) : new Date(),
                endDate: proj.endDate && proj.endDate !== 'Present' ? new Date(proj.endDate) : null,
                technologies: proj.technologies || [],
                freeFormContext: proj.freeFormContext || '',
              },
              include: { bulletPoints: true }
            });
          } catch (updateError) {
            dbProj = await prisma.project.create({
              data: {
                id: proj.id,
                profileId: profile.id,
                name: proj.name || 'Unknown Project',
                startDate: proj.startDate ? new Date(proj.startDate) : new Date(),
                endDate: proj.endDate && proj.endDate !== 'Present' ? new Date(proj.endDate) : null,
                technologies: proj.technologies || [],
                freeFormContext: proj.freeFormContext || '',
              },
              include: { bulletPoints: true }
            });
          }
        } else {
          dbProj = await prisma.project.create({
            data: {
              profileId: profile.id,
              name: proj.name || 'Unknown Project',
              startDate: proj.startDate ? new Date(proj.startDate) : new Date(),
              endDate: proj.endDate && proj.endDate !== 'Present' ? new Date(proj.endDate) : null,
              technologies: proj.technologies || [],
              freeFormContext: proj.freeFormContext || '',
            },
            include: { bulletPoints: true }
          });
          incomingProjIds.add(dbProj.id);
        }

        // Handle Bullet Points
        const existingBullets = dbProj.bulletPoints || [];

        const incomingBullets = (proj.bulletPoints || proj.description || []).map((bp: any) => {
          if (typeof bp === 'string') {
            return {
              text: bp,
              isActive: true,
              type: 'bullet',
            };
          }
          return bp;
        });

        const incomingBulletIds = new Set<string>();
        for (const bp of incomingBullets) {
          // Exact Match Deduplication
          if (!bp.id || !bp.id.match(/^[0-9a-fA-F]{24}$/)) {
            const match = existingBullets.find(pb => 
              pb.text.trim().toLowerCase() === (bp.text || '').trim().toLowerCase()
            );
            if (match) {
              bp.id = match.id;
            }
          }

          if (bp.id && bp.id.match(/^[0-9a-fA-F]{24}$/)) {
            incomingBulletIds.add(bp.id);
            try {
              await prisma.projectBullet.update({
                where: { id: bp.id },
                data: {
                  text: bp.text || '',
                  isActive: bp.isActive !== undefined ? bp.isActive : true,
                  type: bp.type || 'bullet',
                }
              });
            } catch (bulletError) {
              const created = await prisma.projectBullet.create({
                data: {
                  id: bp.id,
                  projectId: dbProj.id,
                  text: bp.text || '',
                  isActive: bp.isActive !== undefined ? bp.isActive : true,
                  type: bp.type || 'bullet',
                  isArchived: false,
                  cvIds: [],
                }
              });
              incomingBulletIds.add(created.id);
            }
          } else {
            const created = await prisma.projectBullet.create({
              data: {
                projectId: dbProj.id,
                text: bp.text || '',
                isActive: bp.isActive !== undefined ? bp.isActive : true,
                type: bp.type || 'bullet',
                isArchived: false,
                cvIds: [],
              }
            });
            incomingBulletIds.add(created.id);
          }
        }

        // Deletions / Archiving with Dynamic CV checking
        if (!body.isImport) {
          const deletedBullets = existingBullets.filter(pb => !pb.isArchived && !incomingBulletIds.has(pb.id));
          for (const dbBullet of deletedBullets) {
            const cvCount = await prisma.cV.count({
              where: {
                activeBulletIds: { has: dbBullet.id }
              }
            });
            if (cvCount > 0) {
              await prisma.projectBullet.update({
                where: { id: dbBullet.id },
                data: { isArchived: true }
              });
            } else {
              await prisma.projectBullet.delete({
                where: { id: dbBullet.id }
              });
            }
          }
        }
      }

      if (!body.isImport) {
        const projectsToDelete = existingProjects.filter(p => !incomingProjIds.has(p.id));
        for (const p of projectsToDelete) {
          await prisma.project.delete({ where: { id: p.id } });
        }
      }
    }

    if (body.skills) {
      console.log(`Saving ${body.skills.length} skills for profile ${profile.id}`);
      
      const existingSkills = await prisma.skill.findMany({
        where: { profileId: profile.id }
      });

      const incomingSkillsMapped = body.skills.map((skill: any) => ({
        name: skill.name || 'Unknown Skill',
        category: (() => {
          const cat = (skill.category || 'TECHNICAL').toUpperCase();
          if (['TECHNICAL', 'SOFT_SKILL', 'LANGUAGE', 'FRAMEWORK', 'TOOL', 'DOMAIN'].includes(cat)) {
            return cat;
          }
          const lower = cat.toLowerCase();
          if (lower.includes('soft') || lower.includes('people') || lower.includes('communication') || lower.includes('personal')) return 'SOFT_SKILL';
          if (lower.includes('lang')) return 'LANGUAGE';
          if (lower.includes('framework') || lower.includes('library')) return 'FRAMEWORK';
          if (lower.includes('tool') || lower.includes('software') || lower.includes('devops') || lower.includes('cloud') || lower.includes('infrastructure')) return 'TOOL';
          if (lower.includes('domain') || lower.includes('business') || lower.includes('industry')) return 'DOMAIN';
          return 'TECHNICAL';
        })(),
        proficiency: (() => {
          const prof = (skill.level || skill.proficiency || 'INTERMEDIATE').toUpperCase();
          if (['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'].includes(prof)) {
            return prof;
          }
          const lower = prof.toLowerCase();
          if (lower.includes('expert') || lower.includes('master')) return 'EXPERT';
          if (lower.includes('senior') || lower.includes('adv')) return 'ADVANCED';
          if (lower.includes('junior') || lower.includes('begin')) return 'BEGINNER';
          return 'INTERMEDIATE';
        })(),
        yearsExperience: typeof skill.yearsOfExperience === 'number' ? skill.yearsOfExperience : 
                        (typeof skill.yearsExperience === 'number' ? skill.yearsExperience : null),
      }));

      if (body.isImport) {
        // Merge without deleting pre-existing skills
        for (const skill of incomingSkillsMapped) {
          const match = existingSkills.find(s => s.name.trim().toLowerCase() === skill.name.trim().toLowerCase());
          if (match) {
            await prisma.skill.update({
              where: { id: match.id },
              data: {
                category: skill.category as any,
                proficiency: skill.proficiency as any,
                yearsExperience: skill.yearsExperience
              }
            });
          } else {
            await prisma.skill.create({
              data: {
                profileId: profile.id,
                name: skill.name,
                category: skill.category as any,
                proficiency: skill.proficiency as any,
                yearsExperience: skill.yearsExperience
              }
            });
          }
        }
      } else {
        // Normal overwrite behavior
        await prisma.skill.deleteMany({ where: { profileId: profile.id } });
        if (incomingSkillsMapped.length > 0) {
          await prisma.skill.createMany({
            data: incomingSkillsMapped.map((skill: any) => ({
              profileId: profile.id,
              name: skill.name,
              category: skill.category as any,
              proficiency: skill.proficiency as any,
              yearsExperience: skill.yearsExperience
            })),
          });
        }
      }
    }

    if (body.references) {
      await prisma.reference.deleteMany({ where: { profileId: profile.id } });
      if (body.references.length > 0) {
        await prisma.reference.createMany({
          data: body.references.map((ref: any) => ({
            profileId: profile.id,
            name: ref.name,
            relationship: ref.relationship,
            email: ref.email || null,
            phone: ref.phone || null,
            company: ref.company || null,
            notes: ref.notes || null,
            canContact: ref.canContact || false,
          })),
        });
      }
    }

    loggers.app.info('Profile created/updated', {
      userId: session.user.id,
      profileId: profile.id,
    });

    return createdResponse(profile);
  } catch (error) {
    return handleApiError(error);
  }
}
