import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { resetModelBlock } from "@/lib/ai/circuit-breaker";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session || !session.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await resetModelBlock(id);

    return NextResponse.json({ success: true, modelId: id, status: "ACTIVE" });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || "Failed to reset model block" },
      { status: 500 },
    );
  }
}
