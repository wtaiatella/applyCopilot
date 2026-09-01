-- AI Provider Manager & Rotation Pool (018)

-- CreateEnum
CREATE TYPE "AISdkType" AS ENUM ('GOOGLE_GENAI', 'OPENAI_COMPATIBLE', 'OLLAMA');

-- CreateEnum
CREATE TYPE "AITier" AS ENUM ('FREE', 'LOCAL');

-- CreateTable
CREATE TABLE "AIProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sdkType" "AISdkType" NOT NULL,
    "apiKeyEnvVar" TEXT,
    "baseUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModel" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "tier" "AITier" NOT NULL DEFAULT 'FREE',
    "rpm" INTEGER NOT NULL DEFAULT 15,
    "rpd" INTEGER NOT NULL DEFAULT 500,
    "tpm" INTEGER NOT NULL DEFAULT 250000,
    "tpd" INTEGER NOT NULL DEFAULT 1000000,
    "safetyMargin" DOUBLE PRECISION NOT NULL DEFAULT 0.90,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "blockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageCounter" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "windowStartMin" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countRequestsMin" INTEGER NOT NULL DEFAULT 0,
    "countTokensMin" INTEGER NOT NULL DEFAULT 0,
    "windowStartDay" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countRequestsDay" INTEGER NOT NULL DEFAULT 0,
    "countTokensDay" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIUsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRotationCursor" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastModelId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIRotationCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRoutePreference" (
    "routeId" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "preferredTier" "AITier" NOT NULL DEFAULT 'FREE',
    "isWorker" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIRoutePreference_pkey" PRIMARY KEY ("routeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIProvider_name_key" ON "AIProvider"("name");

-- CreateIndex
CREATE INDEX "AIModel_tier_isEnabled_idx" ON "AIModel"("tier", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "AIModel_providerId_modelId_key" ON "AIModel"("providerId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "AIUsageCounter_modelId_key" ON "AIUsageCounter"("modelId");

-- AddForeignKey
ALTER TABLE "AIModel" ADD CONSTRAINT "AIModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AIProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageCounter" ADD CONSTRAINT "AIUsageCounter_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AIModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cleanup legacy SystemConfig keys for AI providers
DELETE FROM "SystemConfig" WHERE key LIKE 'AI_PROVIDER_%';
