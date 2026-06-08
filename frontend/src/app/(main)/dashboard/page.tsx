import Link from "next/link";
import { ArrowRight, User } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-4xl py-12">
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-8 shadow-xl">
        <h1 className="text-3xl font-extrabold text-white mb-4">Welcome to ApplyCopilot!</h1>
        <p className="text-slate-400 mb-8 leading-relaxed text-sm">
          Your environment and database connections are fully configured. To start optimizing your job applications, configure your personal details, work history, projects, and skills in your professional profile.
        </p>

        <div className="flex">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/20 active:scale-[0.98] font-semibold"
          >
            <User className="h-4 w-4" />
            Set Up Your Profile
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
