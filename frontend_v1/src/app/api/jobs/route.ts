import { NextRequest } from 'next/server';
import { successResponse, handleApiError, UnauthorizedError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth/session';
import prisma from '@/lib/prisma';

// GET - List jobs from the global bank with filtering and optional scoring
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      throw new UnauthorizedError('You must be logged in to view jobs');
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const remoteOnly = searchParams.get('remote') === 'true';
    const suggested = searchParams.get('suggested') === 'true';

    // 1. Build Base Query
    const where: any = {};
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (remoteOnly) {
      where.remote = true;
    }

    // 2. Fetch Jobs
    // In a real scenario with thousands of jobs, we'd use pagination here
    let jobs = await prisma.jobListing.findMany({
      where,
      orderBy: { postedAt: 'desc' },
      take: 50, // Limit for now
    });

    // 3. Apply Scoring if suggested mode is ON
    if (suggested) {
      // Find user's active search profile
      const profile = await prisma.searchQuery.findFirst({
        where: { userId: user.id, isActive: true },
        orderBy: { updatedAt: 'desc' },
      });

      if (profile) {
        // Calculate scores (Level 1 Funnel)
        const scoredJobs = jobs.map(job => {
          const score = calculateLevel1Score(job, profile);
          return { ...job, score };
        });

        // Sort by score
        jobs = scoredJobs.sort((a, b) => (b.score || 0) - (a.score || 0));
      }
    }

    return successResponse(jobs);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Level 1 Scoring Logic (Simulated TensorFlow match)
 * Matches Job Title and Technologies against Search Profile weights
 */
function calculateLevel1Score(job: any, profile: any) {
  let score = 0;
  let maxPossible = 0;

  const targetTitles = (profile.targetTitles as any[]) || [];
  const hardSkills = (profile.hardSkills as any[]) || [];

  // 1. Match Titles (Higher importance)
  targetTitles.forEach(target => {
    maxPossible += target.weight * 2;
    if (job.title.toLowerCase().includes(target.name.toLowerCase())) {
      score += target.weight * 2;
    }
  });

  // 2. Match Technologies/Skills
  hardSkills.forEach(skill => {
    maxPossible += skill.weight;
    const hasSkill = job.technologies.some((t: string) => 
      t.toLowerCase().includes(skill.name.toLowerCase())
    ) || job.description.toLowerCase().includes(skill.name.toLowerCase());

    if (hasSkill) {
      score += skill.weight;
    }
  });

  // Normalize to 0-100
  if (maxPossible === 0) return 50; // Neutral score
  return Math.min(100, Math.round((score / maxPossible) * 100));
}
