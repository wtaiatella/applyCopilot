import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Wiping user profiles and all related entities from the database...');

  try {
    // Delete in order of dependency
    const appDel = await prisma.application.deleteMany({});
    console.log(`- Deleted ${appDel.count} applications`);

    const cvDel = await prisma.cV.deleteMany({});
    console.log(`- Deleted ${cvDel.count} CV records`);

    const expBulletDel = await prisma.experienceBullet.deleteMany({});
    console.log(`- Deleted ${expBulletDel.count} experience bullets`);

    const projBulletDel = await prisma.projectBullet.deleteMany({});
    console.log(`- Deleted ${projBulletDel.count} project bullets`);

    const expDel = await prisma.experience.deleteMany({});
    console.log(`- Deleted ${expDel.count} experiences`);

    const projDel = await prisma.project.deleteMany({});
    console.log(`- Deleted ${projDel.count} projects`);

    const eduDel = await prisma.education.deleteMany({});
    console.log(`- Deleted ${eduDel.count} education records`);

    const skillDel = await prisma.skill.deleteMany({});
    console.log(`- Deleted ${skillDel.count} skills`);

    const refDel = await prisma.reference.deleteMany({});
    console.log(`- Deleted ${refDel.count} references`);

    const sumDel = await prisma.profileSummary.deleteMany({});
    console.log(`- Deleted ${sumDel.count} profile summaries`);

    const profileDel = await prisma.userProfile.deleteMany({});
    console.log(`- Deleted ${profileDel.count} user profiles`);

    console.log('✅ Database successfully cleared for all profiles (Users preserved)!');
  } catch (error) {
    console.error('Failed to wipe database:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('💥 Error running database wipe:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
