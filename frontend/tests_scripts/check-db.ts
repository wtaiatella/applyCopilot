import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  const userIds = new Set(users.map(u => u.id));
  console.log('Valid User IDs:', Array.from(userIds));

  const profiles = await prisma.userProfile.findMany();
  console.log('Total Profiles:', profiles.length);

  for (const profile of profiles) {
    if (!userIds.has(profile.userId)) {
      console.log(`Deleting orphaned profile: ${profile.id} with userId: ${profile.userId}`);
      
      // Delete any dependent records first (though cascade is set in prisma, on mongodb it depends)
      await prisma.experience.deleteMany({ where: { profileId: profile.id } });
      await prisma.education.deleteMany({ where: { profileId: profile.id } });
      await prisma.project.deleteMany({ where: { profileId: profile.id } });
      await prisma.skill.deleteMany({ where: { profileId: profile.id } });
      await prisma.reference.deleteMany({ where: { profileId: profile.id } });
      await prisma.profileSummary.deleteMany({ where: { profileId: profile.id } });
      
      await prisma.userProfile.delete({
        where: { id: profile.id }
      });
      console.log(`Deleted orphaned profile ${profile.id}`);
    } else {
      console.log(`Profile ${profile.id} is valid (belongs to user ${profile.userId})`);
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
