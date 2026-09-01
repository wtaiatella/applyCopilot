import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { UpdateAIModelSchema } from "@/lib/validation/aiManagerSchemas";

export const dynamic = "force-dynamic";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session || !session.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateAIModelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const existing = await prisma.aIModel.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const updated = await prisma.aIModel.update({
      where: { id },
      data: parsed.data,
      include: { provider: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || "Failed to update AI model" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session || !session.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.aIModel.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    await prisma.aIModel.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || "Failed to delete AI model" },
      { status: 500 },
    );
  }
}
