import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-radial from-slate-900 to-black px-4 py-12 sm:px-6 lg:px-8">
      {/* Decorative Blur Backdrops */}
      <div className="absolute top-1/4 left-1/4 h-[300px] w-[300px] rounded-full bg-blue-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-[300px] w-[300px] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
      
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/85 p-8 shadow-2xl backdrop-blur-md">
        {children}
      </div>
    </div>
  );
}
