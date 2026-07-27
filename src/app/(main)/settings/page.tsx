import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { LLMProvider, CredentialStatus } from "@/types/admin";
import LLMSettingsPanel from "@/components/settings/LLMSettingsPanel";
import DatabasePanel from "@/components/settings/DatabasePanel";
import Link from "next/link";

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

  const defaultBlockedUntil = configMap.get("AI_PROVIDER_DEFAULT_BLOCKED_UNTIL");
  const parsingBlockedUntil = configMap.get("AI_PROVIDER_PARSING_BLOCKED_UNTIL");
  const summariesBlockedUntil = configMap.get("AI_PROVIDER_SUMMARIES_BLOCKED_UNTIL");

  const now = new Date();
  const defaultBlocked = defaultBlockedUntil ? new Date(defaultBlockedUntil) > now : false;
  const parsingBlocked = parsingBlockedUntil ? new Date(parsingBlockedUntil) > now : false;
  const summariesBlocked = summariesBlockedUntil ? new Date(summariesBlockedUntil) > now : false;

  const config = {
    defaultProvider,
    parsingProvider,
    summariesProvider,
  };

  const blockedStatus = {
    defaultProvider: defaultBlocked ? defaultBlockedUntil || null : null,
    parsingProvider: parsingBlocked ? parsingBlockedUntil || null : null,
    summariesProvider: summariesBlocked ? summariesBlockedUntil || null : null,
  };

  return (
    <div className="mx-auto max-w-4xl py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white">Administration Settings</h1>
        <p className="text-zinc-400 text-sm mt-2">
          Configure system-wide settings, model providers, and API connections.
        </p>
      </div>

      <div className="space-y-4">
        {/* Scraper Settings Link Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-blue-500 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Job Scraper Portal Settings</h2>
              <p className="text-zinc-400 text-sm mt-1">
                Configure automated background scraping tasks, portal URLs, rate-limit delays, and test scraping strategies.
              </p>
            </div>
            <Link
              href="/settings/portals"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors text-sm"
            >
              Configure Portals
            </Link>
          </div>
        </div>

        <LLMSettingsPanel
          config={config}
          credentialStatus={credentialStatus}
          blockedStatus={blockedStatus}
        />
        <DatabasePanel />
      </div>
    </div>
  );
}
