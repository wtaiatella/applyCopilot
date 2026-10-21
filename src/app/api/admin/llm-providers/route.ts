import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { CreateAIProviderSchema } from "@/lib/validation/aiManagerSchemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providers = await prisma.aIProvider.findMany({
      include: {
        models: {
          orderBy: { displayName: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(providers);
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || "Failed to fetch AI providers" },
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
    const parsed = CreateAIProviderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { name, sdkType, apiKeyEnvVar, baseUrl } = parsed.data;

    const existing = await prisma.aIProvider.findUnique({
      where: { name },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Provider with name "${name}" already exists` },
        { status: 409 },
      );
    }

    const provider = await prisma.aIProvider.create({
      data: {
        name,
        sdkType,
        apiKeyEnvVar: apiKeyEnvVar || null,
        baseUrl: baseUrl || null,
      },
    });

    return NextResponse.json(provider, { status: 201 });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || "Failed to create AI provider" },
      { status: 500 },
    );
  }
}
