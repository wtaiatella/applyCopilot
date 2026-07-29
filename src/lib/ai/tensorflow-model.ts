import "@tensorflow/tfjs-backend-cpu";
import * as tf from "@tensorflow/tfjs-core";
import * as use from "@tensorflow-models/universal-sentence-encoder";
import { logger } from "../logging/logger";

let modelInstance: use.UniversalSentenceEncoder | null = null;
let isLoading = false;
let loadPromise: Promise<use.UniversalSentenceEncoder> | null = null;

/**
 * Initializes and retrieves the Universal Sentence Encoder singleton instance.
 */
export async function getTensorFlowModel(): Promise<use.UniversalSentenceEncoder> {
  if (modelInstance) {
    return modelInstance;
  }

  if (loadPromise) {
    return loadPromise;
  }

  logger.info("Initializing TensorFlow.js CPU Backend & loading Universal Sentence Encoder model...");
  isLoading = true;

  loadPromise = (async () => {
    try {
      // Ensure the CPU backend is set and ready
      await tf.setBackend("cpu");
      await tf.ready();
      
      const loadedModel = await use.load();
      modelInstance = loadedModel;
      logger.info("Universal Sentence Encoder model loaded successfully.");
      return loadedModel;
    } catch (error) {
      logger.error("Failed to load TensorFlow Universal Sentence Encoder model", { error });
      loadPromise = null;
      throw error;
    } finally {
      isLoading = false;
    }
  })();

  return loadPromise;
}

/**
 * Performs a dry-run inference to warm up the model.
 * Helps prevent late-request overhead on the CPU during the first user actions.
 */
export async function warmUpModel(): Promise<void> {
  try {
    const model = await getTensorFlowModel();
    const warmUpText = "";
    logger.info("Warming up TensorFlow.js model with dry-run inference...");
    const embeddings = await model.embed([warmUpText]);
    embeddings.dispose(); // Free tensor memory
    logger.info("TensorFlow.js model warm-up completed.");
  } catch (error) {
    logger.warn("TensorFlow.js model warm-up failed", { error });
  }
}
