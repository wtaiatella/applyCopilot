import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import MainLayoutClient from "@/components/layout/MainLayoutClient";
import React from "react";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default async function MainLayout({ children }: MainLayoutProps) {
  const session = await auth();

  // If user is not logged in, redirect them to the sign-in page on the server
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
