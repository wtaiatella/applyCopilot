// Job Compatibility Matching API Route
// POST /api/jobs/match - Calculate compatibility between user profile and job
// Based on API contract: specs/001-apply-copilot-system/contracts/api.md

import { NextRequest } from 'next/server';
import {
  createdResponse,
  handleApiError,
  ValidationError,
} from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import { jobMatcher } from '@/lib/ai/tensorflow-matcher';
import prisma from '@/lib/prisma';

// Define common skills vocabulary for matching
const COMMON_SKILLS = [
  'javascript', 'typescript', 'python', 'java', 'c#', 'go', 'rust', 'ruby',
  'react', 'vue', 'angular', 'next.js', 'node.js', 'express', 'django', 'flask',
  'sql', 'postgresql', 'mongodb', 'redis', 'prisma', 'graphql', 'rest',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'ci/cd', 'git',
  'html', 'css', 'tailwind', 'sass', 'bootstrap',
  'machine learning', 'ai', 'data science', 'tensorflow', 'pytorch',
];

// Define common technologies vocabulary
const COMMON_TECHNOLOGIES = [
  'react', 'next.js', 'vue.js', 'angular', 'svelte',
  'node.js', 'express', 'fastify', 'nest.js',
  'python', 'django', 'flask', 'fastapi',
  'docker', 'kubernetes', 'terraform', 'ansible',
  'aws', 'gcp', 'azure', 'vercel', 'netlify',
  'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
  'graphql', 'rest', 'grpc', 'websocket',
  'jest', 'cypress', 'playwright', 'mocha',
  'webpack', 'vite', 'rollup', 'esbuild',
];

interface MatchRequest {
  jobId: string;
  userId?: string;
  usePremiumAI?: boolean;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check rate limit (20 requests per minute for AI processing)
    const { allowed, response } = await checkRateLimit('AI_PROCESSING', request);
    if (!allowed) {
      return response!;
    }

    // Parse request body
    const body = await request.json();
    const { jobId, userId, usePremiumAI = false }: MatchRequest = body;

    if (!jobId) {
      throw new ValidationError('Job ID is required');
    }

    // Get user profile (authenticated or from request)
    const targetUserId = userId || 'anonymous';

    // Fetch job details from database
    const job = await prisma.jobListing.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new ValidationError('Job not found');
    }

    // Fetch user profile if available
    const profile = await prisma.userProfile.findFirst({
      where: { userId: targetUserId },
      include: {
        skills: true,
        experiences: true,
        education: true,
        projects: true,
      },
    });

    if (!profile) {
      throw new ValidationError('User profile not found. Please upload your CV first.');
    }

    // Initialize TensorFlow.js matcher
    await jobMatcher.initialize();

    // Extract vectors from profile and job
    const profileVector = extractProfileVector(profile);
    const jobVector = extractJobVector(job);

    // Calculate compatibility scores using TensorFlow.js
    const scores = jobMatcher.calculateSimilarity(profileVector, jobVector);

    // Determine matched and missing skills
    const matchedSkills = profile.skills
      .filter((s: Skill) => job.technologies.some((js: string) =>
        js.toLowerCase().includes(s.name.toLowerCase()) ||
        s.name.toLowerCase().includes(js.toLowerCase())
      ))
      .map((s: Skill) => s.name);

    const missingSkills = job.technologies.filter((js: string) =>
      !profile.skills.some((s: Skill) =>
        js.toLowerCase().includes(s.name.toLowerCase()) ||
        s.name.toLowerCase().includes(js.toLowerCase())
      )
    );

    // Calculate years of experience
    const totalYears = profile.experiences.reduce((years, exp) => {
      const start = new Date(exp.startDate).getFullYear();
      const end = exp.endDate ? new Date(exp.endDate).getFullYear() : new Date().getFullYear();
      return years + (end - start);
    }, 0);

    const duration = Date.now() - startTime;
    loggers.tensorflow.info('Job compatibility calculated', {
      jobId,
      userId: targetUserId,
      overallScore: scores.overall,
      duration: `${duration}ms`,
    });

    // Return compatibility result
    return createdResponse({
      jobId,
      userId: targetUserId,
      compatibilityScore: Math.round(scores.overall),
      skillMatchScore: Math.round(scores.skills),
      experienceMatchScore: Math.round(scores.experience),
      locationMatch: (profile.location && job.location) ? profile.location.toLowerCase().includes(job.location.toLowerCase()) : false,
      salaryMatch: false, // Would need salary info from profile
      matchedSkills,
      missingSkills,
      totalYears,
      analysis: {
        skills: scores.skills,
        experience: scores.experience,
        education: scores.education,
        technologies: scores.technologies,
      },
      // If premium AI is requested, this would trigger Gemini analysis
      usePremiumAI,
    });
  } catch (error) {
    loggers.tensorflow.error('Job matching failed', {
      error: (error as Error).message,
    });
    return handleApiError(error);
  }
}

// Profile types
interface Profile {
  location?: string | null;
  skills: Skill[];
  experiences: Experience[];
  education: Education[];
  projects: Project[];
}

interface Skill {
  name: string;
}

interface Experience {
  startDate: Date | string;
  endDate?: Date | string | null;
}

interface Education {
  degree: string;
}

interface Project {
  technologies: string[];
}


// Helper to extract profile vector for TensorFlow
function extractProfileVector(profile: Profile): {
  skills: number[];
  experience: number[];
  education: number[];
  technologies: number[];
} {
  // Extract skills vector
  const profileSkills = profile.skills.map((s) => s.name.toLowerCase());
  const skillsVector = jobMatcher.extractSkillsVector(profileSkills, COMMON_SKILLS);

  // Calculate years of experience
  const totalYears = profile.experiences.reduce((years, exp) => {
    const start = new Date(exp.startDate).getFullYear();
    const end = exp.endDate ? new Date(exp.endDate).getFullYear() : new Date().getFullYear();
    return years + (end - start);
  }, 0);
  const experienceVector = jobMatcher.extractExperienceVector(totalYears);

  // Extract education vector (use highest degree)
  const highestEducation = profile.education[0]?.degree || '';
  const educationVector = jobMatcher.extractEducationVector(highestEducation);

  // Extract technologies vector from skills and projects
  const technologies: string[] = [
    ...profileSkills,
    ...profile.projects.flatMap((p) => p.technologies || []),
  ];
  const technologiesVector = jobMatcher.extractTechnologiesVector(
    technologies,
    COMMON_TECHNOLOGIES
  );

  return {
    skills: skillsVector,
    experience: experienceVector,
    education: educationVector,
    technologies: technologiesVector,
  };
}

// Job types
interface Job {
  title: string;
  technologies: string[];
  location: string | null;
  requirements: string[];
}

// Helper to extract job vector for TensorFlow
function extractJobVector(job: Job): {
  skills: number[];
  experience: number[];
  education: number[];
  technologies: number[];
} {
  // Extract skills from job technologies
  const jobSkills = job.technologies.map((s: string) => s.toLowerCase());
  const skillsVector = jobMatcher.extractSkillsVector(jobSkills, COMMON_SKILLS);

  // Infer experience level from job title and requirements
  const jobTitleLower = job.title.toLowerCase();
  let minYears = 0;
  if (jobTitleLower.includes('senior') || jobTitleLower.includes('staff')) minYears = 5;
  else if (jobTitleLower.includes('lead') || jobTitleLower.includes('principal')) minYears = 8;
  else if (jobTitleLower.includes('junior') || jobTitleLower.includes('entry')) minYears = 0;
  else minYears = 2; // Assume mid-level

  const experienceVector = jobMatcher.extractExperienceVector(minYears);

  // Infer education from job requirements
  const requirements = job.requirements.join(' ').toLowerCase();
  let degree = '';
  if (requirements.includes('phd') || requirements.includes('doctorate')) degree = 'phd';
  else if (requirements.includes('master') || requirements.includes('ms ') || requirements.includes('m.a.')) degree = 'master';
  else if (requirements.includes('bachelor') || requirements.includes('bs ') || requirements.includes('b.a.')) degree = 'bachelor';
  else degree = 'bachelor'; // Assume bachelor as default

  const educationVector = jobMatcher.extractEducationVector(degree);

  // Extract technologies
  const technologiesVector = jobMatcher.extractTechnologiesVector(jobSkills, COMMON_TECHNOLOGIES);

  return {
    skills: skillsVector,
    experience: experienceVector,
    education: educationVector,
    technologies: technologiesVector,
  };
}
