import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { ReferenceInputSchema } from "@/lib/validation/profileSchemas";
import { z } from "zod";

const ReferencesPayloadSchema = z.array(ReferenceInputSchema);

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Find profile
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = ReferencesPayloadSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return NextResponse.json({ error: "Validation failed", details }, { status: 400 });
    }

    const referencesData = parsed.data;

    // Perform replacement in a transaction
    const updatedRefs = await prisma.$transaction(async (tx) => {
      // 1. Delete existing references
      await tx.reference.deleteMany({
        where: { profileId: profile.id },
      });

      // 2. Create new references
      if (referencesData.length > 0) {
        await tx.reference.createMany({
          data: referencesData.map((r) => ({
            profileId: profile.id,
            name: r.name,
            company: r.company ?? null,
            relationship: r.relationship ?? null,
            email: r.email || null, // Convert empty string to null
            phone: r.phone ?? null,
            canContact: r.canContact,
          })),
        });
      }

      return tx.reference.findMany({
        where: { profileId: profile.id },
      });
    });

    const responseData = updatedRefs.map((r) => ({
      id: r.id,
      name: r.name,
      company: r.company,
      relationship: r.relationship,
      email: r.email,
      phone: r.phone,
      canContact: r.canContact,
    }));

    logger.info("References updated successfully", { profileId: profile.id, count: responseData.length });

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Failed to update references", { error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
