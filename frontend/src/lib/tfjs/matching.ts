import * as tf from '@tensorflow/tfjs-node'
import * as use from '@tensorflow-models/universal-sentence-encoder'

let useModel: use.UniversalSentenceEncoder | null = null

/**
 * Loads the Universal Sentence Encoder model into memory.
 */
export async function getUSEModel() {
  if (useModel) return useModel
  
  try {
    // Initializing TFJS in node can be CPU intensive first time
    console.log('Loading Universal Sentence Encoder...')
    useModel = await use.load()
    console.log('USE Model loaded successfully.')
    return useModel
  } catch (error: any) {
    console.error('Failed to load TFJS USE model:', error.message)
    throw new Error('Local AI pre-filter error: ' + error.message)
  }
}

/**
 * Calculates Cosine Similarity between two numeric vectors.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0
  
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  
  if (normA === 0 || normB === 0) return 0
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Fast local matching score using sentence embeddings.
 * Compares two text strings and returns a similarity score from 0 to 100.
 */
export async function calculateFastMatchScore(textA: string, textB: string): Promise<number> {
  try {
    const encoder = await getUSEModel()
    
    // Convert texts to embeddings (vectors)
    const embeddings = await encoder.embed([textA, textB])
    const vectors = await embeddings.array() as number[][]
    
    const [vecA, vecB] = vectors
    const similarity = cosineSimilarity(vecA, vecB)
    
    // Scale for percentage (0 to 100)
    return Math.round(similarity * 100)
  } catch (error: any) {
    console.error('Fast match calculation failed:', error.message)
    // Fallback if TFJS fails
    return 0
  }
}

/**
 * Helper to prepare profile text for matching (combining skills, experiences, etc).
 */
export function prepareProfileForMatching(profile: any): string {
  const experiences = (profile.experiences as any[])?.map(e => `${e.position} at ${e.company}: ${e.description}`).join('; ') || ''
  const skills = (profile.skills as string[])?.join(', ') || ''
  const summary = profile.summary || ''
  
  return `Summary: ${summary}. Skills: ${skills}. Experience: ${experiences}`
}

/**
 * Helper to prepare job text for matching.
 */
export function prepareJobForMatching(job: any): string {
  const reqs = (job.requirements as string[])?.join(', ') || ''
  const responsibilities = (job.responsibilities as string[])?.join('; ') || ''
  const description = job.description || ''
  
  return `Title: ${job.title}. Description: ${description}. Requirements: ${reqs}. Responsibilities: ${responsibilities}`
}
