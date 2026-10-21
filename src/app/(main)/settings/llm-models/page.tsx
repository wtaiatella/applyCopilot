import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import LLMModelsManagerClient from "@/components/settings/llm-models/LLMModelsManagerClient";

export const dynamic = "force-dynamic";

export default async function LLMModelsSettingsPage() {
  const session = await auth();

  // Guard: Not logged in or not ADMIN
  if (!session || !session.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-6xl py-6 space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Link href="/settings" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-3xl font-extrabold text-white">
            LLM Models & Provider Management
          </h1>
        </div>
        <p className="text-zinc-400 text-sm mt-2 ml-7">
          Free-tier provider rotation pool, rate limits, sliding window quotas, and per-route fallback preferences.
        </p>
      </div>

      <LLMModelsManagerClient />
    </div>
  );
}
