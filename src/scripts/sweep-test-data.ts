import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { sweepTestData } from "../lib/testing/test-data-marker";

async function main() {
  const execute = process.argv.includes("--execute");

  try {
    const result = await sweepTestData(prisma, { execute });
    if (execute) {
      console.log(
        `matched: ${result.matchedUserCount}, deleted: ${result.deletedUserCount}`,
      );
    } else {
      console.log(
        `matched: ${result.matchedUserCount} (dry run — pass --execute to delete)`,
      );
    }
  } catch (error) {
    console.error("sweep-test-data failed:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
