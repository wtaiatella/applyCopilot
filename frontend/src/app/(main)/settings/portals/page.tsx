import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import PortalSettingsList from "@/components/settings/portals/PortalSettingsList";
import ManualScrapeTrigger from "@/components/settings/portals/ManualScrapeTrigger";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PortalsSettingsPage() {
  const session = await auth();

  // Guard: Not logged in or not ADMIN
  if (!session || !session.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-4xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/settings" className="text-zinc-400 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-3xl font-extrabold text-white">Job Scraper Portal Settings</h1>
          </div>
          <p className="text-zinc-400 text-sm mt-2 ml-7">
            Manage automated scraping URLs, global delay intervals, and manually test strategies.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <PortalSettingsList />
        <ManualScrapeTrigger />
      </div>
    </div>
  );
}
