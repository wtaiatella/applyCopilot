import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding AI Providers, Models, and Route Preferences...");

  // 1. Providers
  const googleProvider = await prisma.aIProvider.upsert({
    where: { name: "Google AI" },
    update: {},
    create: {
      name: "Google AI",
      sdkType: "GOOGLE_GENAI",
      apiKeyEnvVar: "GEMINI_API_KEY",
    },
  });

  await prisma.aIProvider.upsert({
    where: { name: "OpenRouter" },
    update: {},
    create: {
      name: "OpenRouter",
      sdkType: "OPENAI_COMPATIBLE",
      apiKeyEnvVar: "OPENROUTER_API_KEY",
      baseUrl: "https://openrouter.ai/api/v1",
    },
  });

  await prisma.aIProvider.upsert({
    where: { name: "Groq" },
    update: {},
    create: {
      name: "Groq",
      sdkType: "OPENAI_COMPATIBLE",
      apiKeyEnvVar: "GROQ_API_KEY",
      baseUrl: "https://api.groq.com/openai/v1",
    },
  });

  await prisma.aIProvider.upsert({
    where: { name: "Ollama" },
    update: {},
    create: {
      name: "Ollama",
      sdkType: "OLLAMA",
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    },
  });

  // 2. Models for Google AI
  const googleModels = [
    {
      displayName: "Gemini 3.1 Flash Lite",
      modelId: "gemini-3.1-flash-lite",
      rpm: 15,
      rpd: 500,
      tpm: 250000,
      tpd: 1000000,
      safetyMargin: 0.9,
    },
    {
      displayName: "Gemma 4 26B",
      modelId: "gemma-4-26b-a4b-it",
      rpm: 30,
      rpd: 14400,
      tpm: 16000,
      tpd: 1000000,
      safetyMargin: 0.9,
    },
    {
      displayName: "Gemma 4 31B",
      modelId: "gemma-4-31b-it",
      rpm: 30,
      rpd: 14400,
      tpm: 16000,
      tpd: 1000000,
      safetyMargin: 0.9,
    },
    {
      displayName: "Antigravity",
      modelId: "antigravity",
      rpm: 60,
      rpd: 100,
      tpm: 100000,
      tpd: 1000000,
      safetyMargin: 0.9,
    },
  ];

  for (const m of googleModels) {
    const modelRecord = await prisma.aIModel.upsert({
      where: {
        providerId_modelId: {
          providerId: googleProvider.id,
          modelId: m.modelId,
        },
      },
      update: {},
      create: {
        providerId: googleProvider.id,
        displayName: m.displayName,
        modelId: m.modelId,
        tier: "FREE",
        rpm: m.rpm,
        rpd: m.rpd,
        tpm: m.tpm,
        tpd: m.tpd,
        safetyMargin: m.safetyMargin,
        isEnabled: true,
      },
    });

    // Ensure usage counter row exists
    await prisma.aIUsageCounter.upsert({
      where: { modelId: modelRecord.id },
      update: {},
      create: {
        modelId: modelRecord.id,
      },
    });
  }

  // 3. Rotation Cursor singleton
  await prisma.aIRotationCursor.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  // 4. Initial 16 Route Preferences
  const routePreferences = [
    // CV Parser
    {
      routeId: "cv.parse.basicData",
      groupName: "CV Parser",
      displayName: "Contact & Summary Parsing",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
    {
      routeId: "cv.parse.experiences",
      groupName: "CV Parser",
      displayName: "Work Experiences Parsing",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
    {
      routeId: "cv.parse.projects",
      groupName: "CV Parser",
      displayName: "Projects Parsing",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
    {
      routeId: "cv.parse.education",
      groupName: "CV Parser",
      displayName: "Education Parsing",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
    {
      routeId: "cv.parse.skills",
      groupName: "CV Parser",
      displayName: "Skills Fallback Extraction",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
    // Jobs
    {
      routeId: "jobs.classification",
      groupName: "Jobs",
      displayName: "Job Facts Classification",
      preferredTier: "FREE" as const,
      isWorker: true,
    },
    {
      routeId: "jobs.deepAnalysis",
      groupName: "Jobs",
      displayName: "Deep Comparative Analysis",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
    // Profile
    {
      routeId: "profile.summaryGenerate",
      groupName: "Profile",
      displayName: "Profile Summary Generator",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
    {
      routeId: "profile.bulletReviewAll",
      groupName: "Profile",
      displayName: "Review All CV Bullets",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
    {
      routeId: "profile.bulletImprove",
      groupName: "Profile",
      displayName: "Single Bullet Improvement",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
    {
      routeId: "profile.bulletGenerate",
      groupName: "Profile",
      displayName: "Generate New Bullet",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
    {
      routeId: "profile.summaryAI",
      groupName: "Profile",
      displayName: "CV Composer Summary AI",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
    {
      routeId: "profile.syncFacts",
      groupName: "Profile",
      displayName: "Profile Facts Extraction",
      preferredTier: "FREE" as const,
      isWorker: true,
    },
    {
      routeId: "profile.skillAlias",
      groupName: "Profile",
      displayName: "Skill Canonicalization Confirmation",
      preferredTier: "FREE" as const,
      isWorker: true,
    },
    // Suggestions
    {
      routeId: "profile.projectSuggest",
      groupName: "Suggestions",
      displayName: "Project Suggestion AI",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
    {
      routeId: "profile.skillsSuggest",
      groupName: "Suggestions",
      displayName: "Skills Suggestion AI",
      preferredTier: "FREE" as const,
      isWorker: false,
    },
  ];

  for (const r of routePreferences) {
    await prisma.aIRoutePreference.upsert({
      where: { routeId: r.routeId },
      update: {},
      create: r,
    });
  }

  // 5. Retain generic non-AI SystemConfigs (classifier config, etc.)
  const configs = [
    { key: "CLASSIFIER_INTERVAL_MINUTES", value: "5" },
    { key: "CLASSIFIER_BATCH_SIZE", value: "20" },
    { key: "CLASSIFIER_MAX_ATTEMPTS", value: "3" },
    { key: "CLASSIFIER_COOLDOWN_MINUTES", value: "60" },
    { key: "SKILL_ALIAS_SIMILARITY_THRESHOLD", value: "60" },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: { key: config.key, value: config.value },
    });
  }

  // 6. Default Admin User & Profile
  const defaultEmail = "wtaiatella@gmail.com";
  const defaultPassword = "admin";
  const hashedPassword = await bcrypt.hash(defaultPassword, 12);

  const user = await prisma.user.upsert({
    where: { email: defaultEmail },
    update: {
      role: "ADMIN",
    },
    create: {
      email: defaultEmail,
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      firstName: "Wagner",
      lastName: "Taiatella",
    },
  });

  console.log(`Default user configured: ${defaultEmail} (password: ${defaultPassword})`);
  console.log("Seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
