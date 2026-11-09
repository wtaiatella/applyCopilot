-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('HOURLY', 'MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "JobListing" ADD COLUMN     "salaryPeriod" "SalaryPeriod";

-- Backfill: legacy salaries were yearly. Only rows that state an amount; amounts/currency are never written.
UPDATE "JobListing" SET "salaryPeriod" = 'YEARLY'
  WHERE "salaryMin" IS NOT NULL OR "salaryMax" IS NOT NULL;

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "hourlyCurrency" TEXT,
ADD COLUMN     "hourlyMin" DOUBLE PRECISION,
ADD COLUMN     "salaryPeriod" "SalaryPeriod" NOT NULL DEFAULT 'YEARLY';
