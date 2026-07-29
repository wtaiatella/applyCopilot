import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const configs = [
    { key: "AI_PROVIDER_DEFAULT", value: "gemini" },
    { key: "AI_PROVIDER_PARSING", value: "gemini" },
    { key: "AI_PROVIDER_SUMMARIES", value: "gemini" },
    { key: "OLLAMA_MODEL", value: "granite4.1:8b" },
    { key: "GEMINI_MODEL", value: "gemini-3.1-flash-lite" },
    { key: "CLAUDE_MODEL", value: "claude-haiku-3-5" },
    // Classification worker tuning parameters
    { key: "CLASSIFIER_INTERVAL_MINUTES", value: "5" },
    { key: "CLASSIFIER_BATCH_SIZE", value: "20" },
    { key: "CLASSIFIER_MAX_ATTEMPTS", value: "3" },
    { key: "CLASSIFIER_COOLDOWN_MINUTES", value: "60" },
  ];

  // Check if "--overwrite" or "-all" was passed to the seed command
  const shouldOverwrite = process.argv.includes("--overwrite") || process.argv.includes("-all");

  console.log(
    `Seeding SystemConfig (${shouldOverwrite ? "OVERWRITE ALL" : "INSERT MISSING ONLY"})...`
  );

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: shouldOverwrite ? { value: config.value } : {}, // empty update leaves existing values untouched
      create: { key: config.key, value: config.value },
    });
  }
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
