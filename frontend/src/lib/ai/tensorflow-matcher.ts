import * as tf from '@tensorflow/tfjs'

export interface JobCompatibilityVector {
  skills: number[]
  experience: number[]
  education: number[]
  technologies: number[]
}

export interface CompatibilityScore {
  overall: number
  skills: number
  experience: number
  education: number
  technologies: number
}

export class JobMatcher {
  private model: tf.LayersModel | null = null
  private isInitialized = false

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // For now, we'll use a simple cosine similarity approach
      // In production, this could be replaced with a trained model
      this.isInitialized = true
      console.log('TensorFlow.js job matcher initialized')
    } catch (error) {
      console.error('Failed to initialize TensorFlow.js matcher:', error)
      throw error
    }
  }

  /**
   * Calculate cosine similarity between profile and job vectors
   */
  calculateSimilarity(
    profileVector: JobCompatibilityVector,
    jobVector: JobCompatibilityVector
  ): CompatibilityScore {
    if (!this.isInitialized) {
      throw new Error('JobMatcher not initialized')
    }

    // Convert vectors to tensors
    const profileTensor = this.vectorToTensor(profileVector)
    const jobTensor = this.vectorToTensor(jobVector)

    // Calculate cosine similarity for each category
    const skillsSimilarity = this.cosineSimilarity(
      tf.tensor1d(profileVector.skills),
      tf.tensor1d(jobVector.skills)
    )

    const experienceSimilarity = this.cosineSimilarity(
      tf.tensor1d(profileVector.experience),
      tf.tensor1d(jobVector.experience)
    )

    const educationSimilarity = this.cosineSimilarity(
      tf.tensor1d(profileVector.education),
      tf.tensor1d(jobVector.education)
    )

    const technologiesSimilarity = this.cosineSimilarity(
      tf.tensor1d(profileVector.technologies),
      tf.tensor1d(jobVector.technologies)
    )

    // Calculate weighted overall score
    const weights = {
      skills: 0.4,
      experience: 0.3,
      education: 0.2,
      technologies: 0.1
    }

    const overall = 
      skillsSimilarity * weights.skills +
      experienceSimilarity * weights.experience +
      educationSimilarity * weights.education +
      technologiesSimilarity * weights.technologies

    // Clean up tensors
    profileTensor.dispose()
    jobTensor.dispose()

    return {
      overall: overall * 100, // Convert to 0-100 scale
      skills: skillsSimilarity * 100,
      experience: experienceSimilarity * 100,
      education: educationSimilarity * 100,
      technologies: technologiesSimilarity * 100
    }
  }

  /**
   * Convert compatibility vector to flat tensor
   */
  private vectorToTensor(vector: JobCompatibilityVector): tf.Tensor1D {
    return tf.tensor1d([
      ...vector.skills,
      ...vector.experience,
      ...vector.education,
      ...vector.technologies
    ])
  }

  /**
   * Calculate cosine similarity between two tensors
   */
  private cosineSimilarity(tensorA: tf.Tensor1D, tensorB: tf.Tensor1D): number {
    const dotProduct = tf.sum(tf.mul(tensorA, tensorB))
    const normA = tf.sqrt(tf.sum(tf.square(tensorA)))
    const normB = tf.sqrt(tf.sum(tf.square(tensorB)))
    const similarity = tf.div(dotProduct, tf.mul(normA, normB))

    const result = similarity.dataSync()[0]
    
    // Clean up tensors
    dotProduct.dispose()
    normA.dispose()
    normB.dispose()
    similarity.dispose()

    // Clamp result between 0 and 1
    return Math.max(0, Math.min(1, result))
  }

  /**
   * Create TF-IDF vectors from text
   */
  createTFIDFVector(text: string, vocabulary: string[]): number[] {
    // Simple TF-IDF implementation
    const words = text.toLowerCase().split(/\s+/)
    const wordCount = new Map<string, number>()
    
    // Count word frequencies
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1)
    })

    // Create TF-IDF vector
    return vocabulary.map((term, index) => {
      const tf = wordCount.get(term) || 0
      // For simplicity, using term frequency only
      // In production, would calculate IDF across document corpus
      return tf / words.length
    })
  }

  /**
   * Extract skills vector from profile text
   */
  extractSkillsVector(skills: string[], allSkills: string[]): number[] {
    return allSkills.map(skill => 
      skills.some(userSkill => 
        userSkill.toLowerCase().includes(skill.toLowerCase())
      ) ? 1 : 0
    )
  }

  /**
   * Extract experience level from years of experience
   */
  extractExperienceVector(years: number): number[] {
    // Normalize years of experience to 0-1 range
    // Assuming 0-10 years as the range
    const normalized = Math.min(years / 10, 1)
    
    // Create experience level vector [entry, mid, senior, lead]
    if (years < 2) return [1, 0, 0, 0]
    if (years < 5) return [0, 1, 0, 0]
    if (years < 8) return [0, 0, 1, 0]
    return [0, 0, 0, 1]
  }

  /**
   * Extract education level from degree information
   */
  extractEducationVector(degree: string): number[] {
    const degreeLower = degree.toLowerCase()
    
    // Create education vector [highschool, bachelor, master, phd]
    if (degreeLower.includes('phd') || degreeLower.includes('doctor')) return [0, 0, 0, 1]
    if (degreeLower.includes('master') || degreeLower.includes('ms') || degreeLower.includes('m.a.')) return [0, 0, 1, 0]
    if (degreeLower.includes('bachelor') || degreeLower.includes('bs') || degreeLower.includes('b.a.')) return [0, 1, 0, 0]
    return [1, 0, 0, 0]
  }

  /**
   * Extract technologies vector from tech stack
   */
  extractTechnologiesVector(technologies: string[], allTechnologies: string[]): number[] {
    return allTechnologies.map(tech => 
      technologies.some(userTech => 
        userTech.toLowerCase().includes(tech.toLowerCase())
      ) ? 1 : 0
    )
  }
}

// Singleton instance
export const jobMatcher = new JobMatcher()
