import "dotenv/config";
import { prisma } from "../lib/db/prisma";

async function main() {
  try {
    const configs = await prisma.systemConfig.findMany();
    console.log("=== SYSTEM CONFIG IN DATABASE ===");
    console.log(configs.map(c => ({ key: c.key, value: c.value })));
  } catch (error) {
    console.error("Database query failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
