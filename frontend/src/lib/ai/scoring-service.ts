import { JobListing, SearchQuery } from '@prisma/client';
import { jobMatcher, JobCompatibilityVector, CompatibilityScore } from './tensorflow-matcher';

/**
 * Basic hardcoded vocabulary for Level 1 scoring
 * In a real application, this would be generated from the corpus of all jobs and profiles
 */
const GLOBAL_SKILLS_VOCABULARY = [
  'javascript', 'typescript', 'react', 'node', 'python', 'java', 'c#', 'go', 'ruby',
  'aws', 'docker', 'kubernetes', 'sql', 'nosql', 'mongodb', 'postgresql', 'mysql',
  'git', 'ci/cd', 'agile', 'scrum', 'leadership', 'communication'
];

/**
 * Generates a compatibility vector for a job listing
 */
function getJobVector(job: JobListing): JobCompatibilityVector {
  // Extract text from job to form skills/technologies
  const text = `${job.title} ${job.description} ${(job.requirements || []).join(' ')}`.toLowerCase();
  
  // Use TF-IDF for technologies based on global vocabulary
  const technologies = jobMatcher.createTFIDFVector(text, GLOBAL_SKILLS_VOCABULARY);
  
  // For Level 1 fast scoring, we approximate skills and experience based on keywords
  // In a real scenario, this would be pre-calculated by the deep scraper
  return {
    skills: technologies, // Simplified
    experience: jobMatcher.extractExperienceVector(text.includes('senior') ? 6 : text.includes('lead') ? 8 : 3),
    education: jobMatcher.extractEducationVector(text),
    technologies: technologies
  };
}

/**
 * Generates a compatibility vector for a search query
 */
function getQueryVector(query: SearchQuery): JobCompatibilityVector {
  const queryTechnologies = query.technologies || [];
  const technologies = jobMatcher.extractTechnologiesVector(queryTechnologies, GLOBAL_SKILLS_VOCABULARY);
  
  // Convert enum to years
  let years = 3; // MID
  if (query.experienceLevel === 'ENTRY') years = 1;
  else if (query.experienceLevel === 'SENIOR') years = 6;
  else if (query.experienceLevel === 'LEAD') years = 8;

  return {
    skills: technologies, // Simplified
    experience: jobMatcher.extractExperienceVector(years),
    education: jobMatcher.extractEducationVector('bachelor'), // Default for query
    technologies: technologies
  };
}

/**
 * Calculates the Level 1 compatibility score between a search query and a job listing
 */
export async function calculateLevel1Score(query: SearchQuery, job: JobListing): Promise<CompatibilityScore> {
  await jobMatcher.initialize();
  
  const queryVector = getQueryVector(query);
  const jobVector = getJobVector(job);
  
  return jobMatcher.calculateSimilarity(queryVector, jobVector);
}
