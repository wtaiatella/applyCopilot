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
  console.log("Seeding SystemConfig and default admin user...");

  // 1. Generic non-AI SystemConfigs (classifier config, etc.)
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

  // 2. Default Admin User & Profile
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
