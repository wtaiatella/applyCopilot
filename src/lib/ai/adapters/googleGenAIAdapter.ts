import { GoogleGenAI } from "@google/genai";
import { AIModel, AIProvider } from "@prisma/client";
import { logger } from "../../logging/logger";

export class GoogleGenAIAdapter {
  private static getClient(provider: AIProvider): GoogleGenAI {
    const apiKeyVar = provider.apiKeyEnvVar || "GEMINI_API_KEY";
    const apiKey = process.env[apiKeyVar] || "";
    return new GoogleGenAI({ apiKey });
  }

  public static async executeText(
    prompt: string,
    model: AIModel,
    provider: AIProvider,
    systemPrompt?: string,
  ): Promise<string> {
    const client = this.getClient(provider);
    const contentPrompt = systemPrompt
      ? `${systemPrompt}\n\n${prompt}`
      : prompt;

    logger.debug(
      `[GoogleGenAIAdapter] Generating text with model ${model.modelId}`,
    );

    const response = await client.models.generateContent({
      model: model.modelId,
      contents: [
        {
          role: "user",
          parts: [{ text: contentPrompt }],
        },
      ],
    });

    return response.text || "";
  }

  public static async executeJSON<T>(
    prompt: string,
    model: AIModel,
    provider: AIProvider,
    systemPrompt?: string,
  ): Promise<T> {
    const client = this.getClient(provider);
    const jsonSystemPrompt = systemPrompt
      ? `${systemPrompt}\nReturn ONLY valid JSON. Do not include markdown wraps or extra commentary.`
      : "Return ONLY valid JSON. Do not include markdown wraps or extra commentary.";

    logger.debug(
      `[GoogleGenAIAdapter] Generating JSON with model ${model.modelId}`,
    );

    const response = await client.models.generateContent({
      model: model.modelId,
      contents: `${jsonSystemPrompt}\n\nInput:\n${prompt}`,
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text || "";
    return this.parseJSONResponse<T>(responseText);
  }

  private static parseJSONResponse<T>(responseText: string): T {
    let cleanedText = responseText.trim();
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.substring(7);
    }
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.substring(3);
    }
    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.substring(0, cleanedText.length - 3);
    }
    cleanedText = cleanedText.trim();

    try {
      return JSON.parse(cleanedText) as T;
    } catch (error) {
      logger.error("[GoogleGenAIAdapter] Failed to parse JSON response", {
        error,
        rawResponse: responseText,
      });
      throw new Error(
        `AI generated invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
