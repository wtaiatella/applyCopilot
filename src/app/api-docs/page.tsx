import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import ApiDocsViewer from "@/components/api-docs/ApiDocsViewer";

export const dynamic = "force-dynamic";

export default async function ApiDocsPage() {
  const session = await auth();

  // Guard: Not logged in or not ADMIN
  if (!session || !session.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <ApiDocsViewer />;
}
