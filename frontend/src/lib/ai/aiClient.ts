import { prisma } from "../db/prisma";
import { GoogleGenAI } from "@google/genai";
import { Ollama } from "ollama";
import { logger } from "../logging/logger";

const googleGenAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

const ollamaClient = new Ollama({
  host: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
});

interface AIResolution {
  provider: "ollama" | "gemini" | "claude";
  model: string;
}

export async function resolveAIConfig(
  capability: "parsing" | "summaries" | "default"
): Promise<AIResolution> {
  let providerStr = "";
  let modelStr = "";

  try {
    const configKey =
      capability === "parsing"
        ? "AI_PROVIDER_PARSING"
        : capability === "summaries"
        ? "AI_PROVIDER_SUMMARIES"
        : "AI_PROVIDER_DEFAULT";

    // Try fetching from database SystemConfig
    const dbProvider = await prisma.systemConfig.findUnique({
      where: { key: configKey },
    });
    providerStr = dbProvider?.value || "";

    if (!providerStr) {
      // Fetch fallback default provider if specific capability provider not found in DB
      const dbDefault = await prisma.systemConfig.findUnique({
        where: { key: "AI_PROVIDER_DEFAULT" },
      });
      providerStr = dbDefault?.value || "";
    }
  } catch (error) {
    logger.warn("Database config resolution failed, falling back to env variables", { error });
  }

  // Fallback to environment variables
  if (!providerStr) {
    providerStr =
      (capability === "parsing"
        ? process.env.AI_PROVIDER_PARSING
        : capability === "summaries"
        ? process.env.AI_PROVIDER_SUMMARIES
        : process.env.AI_PROVIDER_DEFAULT) || "ollama";
  }

  const provider = (providerStr.toLowerCase() as "ollama" | "gemini" | "claude") || "ollama";

  // Resolve model based on resolved provider
  try {
    const modelKey =
      provider === "gemini"
        ? "GEMINI_MODEL"
        : provider === "claude"
        ? "CLAUDE_MODEL"
        : "OLLAMA_MODEL";

    const dbModel = await prisma.systemConfig.findUnique({
      where: { key: modelKey },
    });
    modelStr = dbModel?.value || "";
  } catch {
    // Ignore db read error for model key
  }

  if (!modelStr) {
    modelStr =
      (provider === "gemini"
        ? process.env.GEMINI_MODEL || "gemini-2.5-flash"
        : provider === "claude"
        ? process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest"
        : process.env.OLLAMA_MODEL || "granite4.1:8b") || "";
  }

  return { provider, model: modelStr };
}

export async function generateText(
  prompt: string,
  capability: "parsing" | "summaries" | "default",
  systemPrompt?: string
): Promise<string> {
  const { provider, model } = await resolveAIConfig(capability);
  logger.info(`Routing AI request: ${capability} -> ${provider} using ${model}`);

  if (provider === "gemini") {
    const contentPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    const response = await googleGenAI.models.generateContent({
      model,
      contents: contentPrompt,
    });
    return response.text || "";
  }

  if (provider === "claude") {
    const messages = [{ role: "user" as const, content: prompt }];
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CLAUDE_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API request failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return (data as { content?: { text?: string }[] }).content?.[0]?.text || "";
  }

  // Fallback/Default: Ollama
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await ollamaClient.chat({
    model,
    messages,
  });

  return response.message.content || "";
}

export async function generateJSON<T>(
  prompt: string,
  capability: "parsing" | "summaries" | "default",
  systemPrompt?: string
): Promise<T> {
  const { provider, model } = await resolveAIConfig(capability);
  logger.info(`Routing AI JSON request: ${capability} -> ${provider} using ${model}`);

  const jsonSystemPrompt = systemPrompt
    ? `${systemPrompt}\nReturn ONLY valid JSON. Do not include markdown wraps or extra commentary.`
    : "Return ONLY valid JSON. Do not include markdown wraps or extra commentary.";

  let responseText = "";

  if (provider === "gemini") {
    const response = await googleGenAI.models.generateContent({
      model,
      contents: `${jsonSystemPrompt}\n\nInput:\n${prompt}`,
      config: {
        responseMimeType: "application/json",
      },
    });
    responseText = response.text || "";
  } else if (provider === "claude") {
    responseText = await generateText(prompt, capability, `${jsonSystemPrompt}\nRespond ONLY in raw JSON format.`);
  } else {
    // Ollama
    const messages = [];
    if (jsonSystemPrompt) {
      messages.push({ role: "system", content: jsonSystemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const response = await ollamaClient.chat({
      model,
      messages,
      format: "json",
    });
    responseText = response.message.content || "";
  }

  // Clean JSON response from potential markdown wrapping if returned by LLM
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
    logger.error("Failed to parse AI JSON response", { error, rawResponse: responseText, cleanedText });
    throw new Error(`AI generated invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
