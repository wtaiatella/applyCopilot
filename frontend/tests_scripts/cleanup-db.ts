import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Fetching user profiles and inspecting duplicates...');

  const profiles = await prisma.userProfile.findMany({
    include: {
      experiences: {
        orderBy: { startDate: 'desc' },
      },
      education: {
        orderBy: { startDate: 'desc' },
      },
    },
  });

  if (profiles.length === 0) {
    console.log('⚠️ No profiles found in the database.');
    return;
  }

  for (const profile of profiles) {
    console.log(`\n👤 Profile ID: ${profile.id} (User ID: ${profile.userId})`);
    
    // --- Clean Experiences ---
    console.log('\n💼 Checking experiences...');
    const experiences = profile.experiences;
    console.log(`Total experiences found: ${experiences.length}`);
    
    const uniqueExperiences: any[] = [];
    const expIdsToDelete: string[] = [];
    
    for (const exp of experiences) {
      // Check if we already have an experience with the same company, position and dates
      const isDuplicate = uniqueExperiences.some(
        (uExp) =>
          uExp.company === exp.company &&
          uExp.position === exp.position &&
          new Date(uExp.startDate).getTime() === new Date(exp.startDate).getTime()
      );
      
      if (isDuplicate) {
        expIdsToDelete.push(exp.id);
        console.log(`   ❌ Duplicate found: "${exp.position}" at "${exp.company}" (ID: ${exp.id})`);
      } else {
        uniqueExperiences.push(exp);
      }
    }
    
    if (expIdsToDelete.length > 0) {
      console.log(`🗑️ Deleting ${expIdsToDelete.length} duplicate experience(s)...`);
      const deleteResult = await prisma.experience.deleteMany({
        where: {
          id: { in: expIdsToDelete },
        },
      });
      console.log(`   ✅ Deleted ${deleteResult.count} record(s).`);
    } else {
      console.log('   ✅ No duplicate experiences found.');
    }

    // --- Clean Education ---
    console.log('\n🎓 Checking education...');
    const educationList = profile.education;
    console.log(`Total education entries found: ${educationList.length}`);
    
    const uniqueEducation: any[] = [];
    const eduIdsToDelete: string[] = [];
    
    for (const edu of educationList) {
      // Check if we already have an education with the same institution and degree
      const isDuplicate = uniqueEducation.some(
        (uEdu) =>
          uEdu.institution === edu.institution &&
          uEdu.degree === edu.degree &&
          new Date(uEdu.startDate).getTime() === new Date(edu.startDate).getTime()
      );
      
      if (isDuplicate) {
        eduIdsToDelete.push(edu.id);
        console.log(`   ❌ Duplicate found: "${edu.degree}" at "${edu.institution}" (ID: ${edu.id})`);
      } else {
        uniqueEducation.push(edu);
      }
    }
    
    if (eduIdsToDelete.length > 0) {
      console.log(`🗑️ Deleting ${eduIdsToDelete.length} duplicate education(s)...`);
      const deleteResult = await prisma.education.deleteMany({
        where: {
          id: { in: eduIdsToDelete },
        },
      });
      console.log(`   ✅ Deleted ${deleteResult.count} record(s).`);
    } else {
      console.log('   ✅ No duplicate education records found.');
    }
  }
}

main()
  .catch((e) => {
    console.error('💥 Error running cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
