import { AIModel, AIProvider } from "@prisma/client";
import { logger } from "../../logging/logger";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
  };
}

export class OpenAICompatAdapter {
  private static getHeaders(provider: AIProvider): Record<string, string> {
    const apiKeyVar = provider.apiKeyEnvVar || "OPENAI_API_KEY";
    const apiKey = process.env[apiKeyVar] || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    if (provider.name.toLowerCase().includes("openrouter")) {
      headers["HTTP-Referer"] = "https://applycopilot.local";
      headers["X-Title"] = "ApplyCopilot";
    }

    return headers;
  }

  private static getBaseUrl(provider: AIProvider): string {
    if (provider.baseUrl) return provider.baseUrl.replace(/\/+$/, "");
    if (provider.name.toLowerCase().includes("openrouter")) {
      return "https://openrouter.ai/api/v1";
    }
    if (provider.name.toLowerCase().includes("groq")) {
      return "https://api.groq.com/openai/v1";
    }
    return "https://api.openai.com/v1";
  }

  public static async executeText(
    prompt: string,
    model: AIModel,
    provider: AIProvider,
    systemPrompt?: string,
  ): Promise<string> {
    const baseUrl = this.getBaseUrl(provider);
    const headers = this.getHeaders(provider);

    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    logger.debug(
      `[OpenAICompatAdapter] Calling ${provider.name} with model ${model.modelId} at ${baseUrl}`,
    );

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model.modelId,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[OpenAICompatAdapter] HTTP error ${response.status}`, {
        status: response.status,
        errorText,
      });
      const error = new Error(
        `${provider.name} API error (${response.status}): ${errorText}`,
      );
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    const data = (await response.json()) as ChatCompletionResponse;
    if (data.error) {
      throw new Error(
        `${provider.name} API returned error: ${data.error.message || "Unknown error"}`,
      );
    }

    return data.choices?.[0]?.message?.content || "";
  }

  public static async executeJSON<T>(
    prompt: string,
    model: AIModel,
    provider: AIProvider,
    systemPrompt?: string,
  ): Promise<T> {
    const jsonSystemPrompt = systemPrompt
      ? `${systemPrompt}\nReturn ONLY valid JSON. Do not include markdown wraps or extra commentary.`
      : "Return ONLY valid JSON. Do not include markdown wraps or extra commentary.";

    const responseText = await this.executeText(
      prompt,
      model,
      provider,
      jsonSystemPrompt,
    );

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
      logger.error("[OpenAICompatAdapter] Failed to parse JSON response", {
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
