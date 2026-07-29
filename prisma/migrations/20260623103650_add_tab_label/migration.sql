/*
  Warnings:

  - The `freeFormContext` column on the `Education` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `freeFormContext` column on the `Experience` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `freeFormContext` column on the `Project` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Education" ADD COLUMN     "tabLabel" TEXT,
DROP COLUMN "freeFormContext",
ADD COLUMN     "freeFormContext" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Experience" ADD COLUMN     "tabLabel" TEXT,
DROP COLUMN "freeFormContext",
ADD COLUMN     "freeFormContext" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "tabLabel" TEXT,
DROP COLUMN "freeFormContext",
ADD COLUMN     "freeFormContext" TEXT[] DEFAULT ARRAY[]::TEXT[];
