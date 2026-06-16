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
    { key: "AI_PROVIDER_DEFAULT", value: "ollama" },
    { key: "AI_PROVIDER_PARSING", value: "ollama" },
    { key: "AI_PROVIDER_SUMMARIES", value: "gemini" },
    { key: "OLLAMA_MODEL", value: "granite4.1:8b" },
    { key: "GEMINI_MODEL", value: "gemini-2.5-flash" },
    { key: "CLAUDE_MODEL", value: "claude-3-5-sonnet-latest" },
  ];

  console.log("Seeding SystemConfig...");
  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
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
