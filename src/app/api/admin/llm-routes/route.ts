import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { UpdateAIRoutePreferenceSchema } from "@/lib/validation/aiManagerSchemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const routes = await prisma.aIRoutePreference.findMany({
      orderBy: [{ groupName: "asc" }, { routeId: "asc" }],
    });

    return NextResponse.json(routes);
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || "Failed to fetch route preferences" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = UpdateAIRoutePreferenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { routes } = parsed.data;

    await prisma.$transaction(
      routes.map((r) =>
        prisma.aIRoutePreference.update({
          where: { routeId: r.routeId },
          data: { preferredTier: r.preferredTier },
        }),
      ),
    );

    const updatedRoutes = await prisma.aIRoutePreference.findMany({
      orderBy: [{ groupName: "asc" }, { routeId: "asc" }],
    });

    return NextResponse.json(updatedRoutes);
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || "Failed to update route preferences" },
      { status: 500 },
    );
  }
}
