import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface CTAProps {
  isLoggedIn: boolean;
}

export default function CTA({ isLoggedIn }: CTAProps) {
  return (
    <section className="relative overflow-hidden bg-black py-20 lg:py-28 border-t border-slate-900">
      <div className="absolute top-1/2 left-1/4 h-[300px] w-[300px] rounded-full bg-blue-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-[300px] w-[300px] rounded-full bg-purple-600/5 blur-[120px] pointer-events-none" />

      <div className="relative mx-auto max-w-5xl px-6 text-center lg:px-8">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
          Ready to scale your applications?
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-400">
          Join ApplyCopilot today and transform your job hunt with smart, automated, and secure resume optimizations.
        </p>

        <div className="mt-10 flex justify-center">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/20 active:scale-95"
            >
              Go to Dashboard
              <ArrowRight className="h-5 w-5" />
            </Link>
          ) : (
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/20 active:scale-95"
            >
              Create Free Account
              <ArrowRight className="h-5 w-5" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
