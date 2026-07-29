-- CreateEnum
CREATE TYPE "ScrapeTaskType" AS ENUM ('LIST', 'DEEP');

-- CreateEnum
CREATE TYPE "ScrapeTaskStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PortalStatus" AS ENUM ('ACTIVE', 'BROKEN', 'DISABLED');

-- CreateTable
CREATE TABLE "ScrapeTask" (
    "id" TEXT NOT NULL,
    "type" "ScrapeTaskType" NOT NULL,
    "portalId" TEXT NOT NULL,
    "status" "ScrapeTaskStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "resultsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "searchUrl" TEXT,
    "keywords" TEXT,
    "location" TEXT,
    "triggeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapeTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalSearchUrl" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "PortalStatus" NOT NULL DEFAULT 'ACTIVE',
    "isRobotsBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalSearchUrl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobListing" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "externalJobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "url" TEXT NOT NULL,
    "isFullDescriptionFetched" BOOLEAN NOT NULL DEFAULT false,
    "fullDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScraperConfig" (
    "id" TEXT NOT NULL,
    "globalScrapeInterval" INTEGER NOT NULL DEFAULT 5,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 3,
    "rateLimitDelay" INTEGER NOT NULL DEFAULT 500,
    "fallbackAiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxExtractionRetries" INTEGER NOT NULL DEFAULT 3,
    "userAgent" TEXT NOT NULL DEFAULT 'ApplyCopilot/1.0',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScraperConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobListing_portalId_externalJobId_key" ON "JobListing"("portalId", "externalJobId");
