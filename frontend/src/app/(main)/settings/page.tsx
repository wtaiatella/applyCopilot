import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { LLMProvider, CredentialStatus } from "@/types/admin";
import LLMSettingsPanel from "@/components/settings/LLMSettingsPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();

  // Guard: Not logged in or not ADMIN
  if (!session || !session.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  // Load config directly from DB
  const configs = await prisma.systemConfig.findMany({
    where: {
      key: {
        in: ["AI_PROVIDER_DEFAULT", "AI_PROVIDER_PARSING", "AI_PROVIDER_SUMMARIES"],
      },
    },
  });

  const configMap = new Map(configs.map(c => [c.key, c.value]));

  const defaultProvider = (configMap.get("AI_PROVIDER_DEFAULT") || "ollama") as LLMProvider;
  const parsingProvider = (configMap.get("AI_PROVIDER_PARSING") || "ollama") as LLMProvider;
  const summariesProvider = (configMap.get("AI_PROVIDER_SUMMARIES") || "gemini") as LLMProvider;

  // Detect credential status
  const ollamaUrl = process.env.OLLAMA_BASE_URL;
  const geminiKey = process.env.GEMINI_API_KEY;
  const claudeKey = process.env.CLAUDE_API_KEY;

  const credentialStatus: CredentialStatus = {
    ollama: !!(ollamaUrl && ollamaUrl.length > 0),
    gemini: !!(
      geminiKey &&
      geminiKey.length > 0 &&
      geminiKey !== 'your-gemini-api-key-here'
    ),
    claude: !!(claudeKey && claudeKey.length > 0),
  };

  const config = {
    defaultProvider,
    parsingProvider,
    summariesProvider,
  };

  return (
    <div className="mx-auto max-w-4xl py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white">Administration Settings</h1>
        <p className="text-zinc-400 text-sm mt-2">
          Configure system-wide settings, model providers, and API connections.
        </p>
      </div>

      <LLMSettingsPanel config={config} credentialStatus={credentialStatus} />
    </div>
  );
}
