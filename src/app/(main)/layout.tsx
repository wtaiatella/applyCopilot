import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import MainLayoutClient from "@/components/layout/MainLayoutClient";
import React from "react";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default async function MainLayout({ children }: MainLayoutProps) {
  const session = await auth();

  // REM-10 / spectech.md Decision 7: middleware.ts's PUBLIC_ROUTES allowlist
  // (src/lib/auth/authConfig.ts) is the primary, single source of truth for route
  // protection under (main). This server-side auth() + redirect check is intentional
  // defense-in-depth only - redundant-but-harmless, not the primary enforcement point.
  // Kept as-is rather than removed (no behavior change).
  if (!session || !session.user) {
    redirect("/login");
  }

  // Ensure role is mapped safely
  const safeUser = {
    id: session.user.id || "",
    email: session.user.email,
    role: session.user.role || "USER",
  };

  return <MainLayoutClient user={safeUser}>{children}</MainLayoutClient>;
}
