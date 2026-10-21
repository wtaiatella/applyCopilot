import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { evaluateAndLazyReset } from "@/lib/ai/quota-manager";
import { AIDashboardResponseDTO } from "@/types/ai-manager";

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
        usageCounter: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const now = new Date();
    let totalCallsToday = 0;
    let blockedModelsCount = 0;
    let nearQuotaModelsCount = 0;

    const modelDTOs = models.map((m) => {
      const evalResult = evaluateAndLazyReset(m, m.usageCounter, now);
      const isBlocked = Boolean(m.blockedUntil && m.blockedUntil > now);

      totalCallsToday += evalResult.countRequestsDay;
      if (isBlocked) {
        blockedModelsCount++;
      }

      const dayUsageRatio = evalResult.countRequestsDay / evalResult.effectiveRpd;
      const minUsageRatio = evalResult.countRequestsMin / evalResult.effectiveRpm;
      if (dayUsageRatio >= 0.8 || minUsageRatio >= 0.8) {
        nearQuotaModelsCount++;
      }

      return {
        id: m.id,
        displayName: m.displayName,
        providerName: m.provider.name,
        tier: m.tier,
        isEnabled: m.isEnabled,
        isBlocked,
        blockedUntil: m.blockedUntil ? m.blockedUntil.toISOString() : null,
        rpm: m.rpm,
        rpd: m.rpd,
        effectiveRpm: evalResult.effectiveRpm,
        effectiveRpd: evalResult.effectiveRpd,
        usageMin: evalResult.countRequestsMin,
        usageDay: evalResult.countRequestsDay,
        resetsMinInSeconds: evalResult.resetsMinInSeconds,
        resetsDayInSeconds: evalResult.resetsDayInSeconds,
      };
    });

    const response: AIDashboardResponseDTO = {
      summary: {
        totalCallsToday,
        blockedModelsCount,
        nearQuotaModelsCount,
      },
      models: modelDTOs,
    };

    return NextResponse.json(response);
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || "Failed to load LLM dashboard" },
      { status: 500 },
    );
  }
}
