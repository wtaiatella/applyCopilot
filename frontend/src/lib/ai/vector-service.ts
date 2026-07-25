import { getTensorFlowModel } from "./tensorflow-model";
import { logger } from "../logging/logger";

/**
 * Generates a 512-dimension vector embedding for a given text using the local USE model.
 * 
 * @param text The input string to vectorize.
 * @returns Promise<number[]> Resolves to an array of 512 decimal numbers.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    logger.warn("Attempted to generate embedding for empty string. Returning zero-filled vector.");
    return new Array(512).fill(0);
  }

  try {
    const model = await getTensorFlowModel();
    
    // Embed the text into a tensor
    const embeddingsTensor = await model.embed([trimmedText]);
    
    // Retrieve the numbers array from tensor
    const array2D = await embeddingsTensor.array();
    
    // Free the tensor's memory (CRITICAL to avoid memory leaks)
    embeddingsTensor.dispose();
    
    const vector = array2D[0];
    
    if (vector.length !== 512) {
      throw new Error(`Expected USE embedding vector of size 512, received ${vector.length}`);
    }
    
    return vector;
  } catch (error) {
    logger.error("Failed to generate vector embedding via local TensorFlow engine", { error });
    throw error;
  }
}
