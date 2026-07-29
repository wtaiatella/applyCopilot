import { auth } from "@/lib/auth/auth";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import CTA from "@/components/landing/CTA";
import Link from "next/link";

export default async function Home() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-blue-500/30 selection:text-blue-200">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 border-b border-slate-900 bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl h-16 items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white">A</div>
            <span className="text-xl font-bold tracking-tight text-white">ApplyCopilot</span>
          </div>

          <nav className="flex items-center gap-4">
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="rounded-lg bg-slate-900 border border-slate-800 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-slate-800 hover:border-slate-700"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-semibold text-slate-300 transition-all hover:text-white"
                >
                  Log In
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-500"
                >
                  Get Started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main>
        <Hero isLoggedIn={isLoggedIn} />
        <Features />
        <HowItWorks />
        <CTA isLoggedIn={isLoggedIn} />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-black py-8 text-center text-sm text-slate-600">
        <p>© 2026 ApplyCopilot. All rights reserved. English Only.</p>
      </footer>
    </div>
  );
}
