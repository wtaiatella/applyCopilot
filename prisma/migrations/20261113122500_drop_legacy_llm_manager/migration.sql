-- Drop legacy AI Provider Manager & Rotation Pool tables and enums (APC-41)
-- Rollback: restore 20260831230000_ai_provider_manager schema and re-run seed.ts

-- DropForeignKey
ALTER TABLE "AIModel" DROP CONSTRAINT "AIModel_providerId_fkey";

-- DropForeignKey
ALTER TABLE "AIUsageCounter" DROP CONSTRAINT "AIUsageCounter_modelId_fkey";

-- DropTable
DROP TABLE "AIModel";

-- DropTable
DROP TABLE "AIProvider";

-- DropTable
DROP TABLE "AIRotationCursor";

-- DropTable
DROP TABLE "AIRoutePreference";

-- DropTable
DROP TABLE "AIUsageCounter";

-- DropEnum
DROP TYPE "AISdkType";

-- DropEnum
DROP TYPE "AITier";
