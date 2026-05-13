import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧼 Starting database cleanup...');
  
  // The order matters for relational databases, but since this is MongoDB, 
  // we just need to clear all collections.
  
  const deleteResults = await Promise.all([
    prisma.user.deleteMany(),
    prisma.userProfile.deleteMany(),
    prisma.experience.deleteMany(),
    prisma.education.deleteMany(),
    prisma.project.deleteMany(),
    prisma.skill.deleteMany(),
    prisma.jobListing.deleteMany(),
    prisma.jobMatch.deleteMany(),
    prisma.application.deleteMany(),
    prisma.searchQuery.deleteMany(),
    prisma.portalConfig.deleteMany(),
    prisma.portalMonitor.deleteMany(),
  ]);

  console.log('✅ Cleanup finished successfully!');
  console.log(`Deleted ${deleteResults.length} collections.`);
}

main()
  .catch((e) => {
    console.error('❌ Error during cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
