import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import DatabasePanel from "@/components/settings/DatabasePanel";
import Link from "next/link";
import { Cpu, Globe } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();

  // Guard: Not logged in or not ADMIN
  if (!session || !session.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-4xl py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white">
          Administration Settings
        </h1>
        <p className="text-zinc-400 text-sm mt-2">
          Configure system-wide settings, model providers, and API connections.
        </p>
      </div>

      <div className="space-y-4">
        {/* LLM Models Link Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-blue-500 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  LLM Models & Provider Rotation
                </h2>
                <p className="text-zinc-400 text-sm mt-1">
                  Configure free-tier provider pool, rate limits, sliding window quotas, and per-route fallback preferences.
                </p>
              </div>
            </div>
            <Link
              href="/settings/llm-models"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors text-sm shrink-0"
            >
              Configure Models
            </Link>
          </div>
        </div>

        {/* Scraper Settings Link Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-blue-500 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  Job Scraper Portal Settings
                </h2>
                <p className="text-zinc-400 text-sm mt-1">
                  Configure automated background scraping tasks, portal URLs,
                  rate-limit delays, and test scraping strategies.
                </p>
              </div>
            </div>
            <Link
              href="/settings/portals"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors text-sm shrink-0"
            >
              Configure Portals
            </Link>
          </div>
        </div>

        <DatabasePanel />
      </div>
    </div>
  );
}
