import { Ollama } from "ollama";
import { logger } from "../../logging/logger";

export class OllamaAdapter {
  private static getClient(): Ollama {
    return new Ollama({
      host: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    });
  }

  private static getModel(): string {
    return process.env.OLLAMA_MODEL || "granite4.1:8b";
  }

  public static async executeText(
    prompt: string,
    systemPrompt?: string,
  ): Promise<string> {
    const client = this.getClient();
    const model = this.getModel();

    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    logger.debug(`[OllamaAdapter] Calling Ollama with model ${model}`);

    const response = await client.chat({
      model,
      messages,
    });

    return response.message.content || "";
  }

  public static async executeJSON<T>(
    prompt: string,
    systemPrompt?: string,
  ): Promise<T> {
    const client = this.getClient();
    const model = this.getModel();

    const jsonSystemPrompt = systemPrompt
      ? `${systemPrompt}\nReturn ONLY valid JSON. Do not include markdown wraps or extra commentary.`
      : "Return ONLY valid JSON. Do not include markdown wraps or extra commentary.";

    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (jsonSystemPrompt) {
      messages.push({ role: "system", content: jsonSystemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    logger.debug(`[OllamaAdapter] Calling Ollama (format: json) with model ${model}`);

    const response = await client.chat({
      model,
      messages,
      format: "json",
    });

    const responseText = response.message.content || "";

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
      logger.error("[OllamaAdapter] Failed to parse JSON response", {
        error,
        rawResponse: responseText,
        cleanedText,
      });
      throw new Error(
        `AI generated invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
