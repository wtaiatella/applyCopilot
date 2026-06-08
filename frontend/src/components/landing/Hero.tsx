"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

interface HeroProps {
  isLoggedIn: boolean;
}

export default function Hero({ isLoggedIn }: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-radial from-slate-900 to-black py-20 lg:py-32">
      {/* Dynamic Background Glows */}
      <div className="absolute top-1/4 left-1/4 h-[350px] w-[350px] rounded-full bg-blue-600/10 blur-[120px]" />
      <div className="absolute top-1/3 right-1/4 h-[350px] w-[350px] rounded-full bg-violet-600/10 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-6 text-center lg:px-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/5 px-4 py-1.5 text-sm font-medium text-blue-400 backdrop-blur-md">
          <Sparkles className="h-4 w-4" />
          <span>Powered by Advanced AI Routing</span>
        </div>

        {/* Title */}
        <h1 className="mt-8 text-5xl font-extrabold tracking-tight text-white sm:text-7xl">
          Supercharge Your Job Applications with{" "}
          <span className="block bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
            ApplyCopilot
          </span>
        </h1>

        {/* Description */}
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400 leading-relaxed">
          Upload your CV once. Let our routing AI parse, optimize, and customize your professional highlights for every job application instantly.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/20 active:scale-95"
            >
              Go to Dashboard
              <ArrowRight className="h-5 w-5" />
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/20 active:scale-95"
              >
                Get Started
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/50 px-6 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-all hover:border-slate-500 hover:bg-slate-800 active:scale-95"
              >
                Log In
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
