import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { CreateAIModelSchema } from "@/lib/validation/aiManagerSchemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const models = await prisma.aIModel.findMany({
      include: {
        provider: true,
      },
      orderBy: [{ provider: { name: "asc" } }, { displayName: "asc" }],
    });

    const now = new Date();
    const result = models.map((m) => ({
      id: m.id,
      providerId: m.providerId,
      providerName: m.provider.name,
      displayName: m.displayName,
      modelId: m.modelId,
      tier: m.tier,
      rpm: m.rpm,
      rpd: m.rpd,
      tpm: m.tpm,
      tpd: m.tpd,
      safetyMargin: m.safetyMargin,
      isEnabled: m.isEnabled,
      blockedUntil: m.blockedUntil ? m.blockedUntil.toISOString() : null,
      isBlocked: Boolean(m.blockedUntil && m.blockedUntil > now),
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));

    return NextResponse.json(result);
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || "Failed to fetch AI models" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = CreateAIModelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const {
      providerId,
      displayName,
      modelId,
      tier,
      rpm,
      rpd,
      tpm,
      tpd,
      safetyMargin,
      isEnabled,
    } = parsed.data;

    const provider = await prisma.aIProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      return NextResponse.json(
        { error: `Provider ${providerId} not found` },
        { status: 404 },
      );
    }

    const existing = await prisma.aIModel.findUnique({
      where: {
        providerId_modelId: {
          providerId,
          modelId,
        },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Model "${modelId}" already exists for this provider` },
        { status: 409 },
      );
    }

    const newModel = await prisma.aIModel.create({
      data: {
        providerId,
        displayName,
        modelId,
        tier,
        rpm,
        rpd,
        tpm,
        tpd,
        safetyMargin,
        isEnabled,
      },
      include: {
        provider: true,
      },
    });

    // Create empty usage counter
    await prisma.aIUsageCounter.create({
      data: {
        modelId: newModel.id,
      },
    });

    return NextResponse.json(newModel, { status: 201 });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || "Failed to create AI model" },
      { status: 500 },
    );
  }
}
