import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cvPath = '/Users/wagnertaiatella/repos/applyCopilot/cv/2025-10-05 - Wagner Taiatella - Resume.pdf';
  console.log(`📂 Loading CV file from: ${cvPath}`);
  
  const fileBuffer = readFileSync(cvPath);
  console.log(`📄 File loaded, size: ${fileBuffer.length} bytes`);
  
  // Create Form Data containing the file
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  formData.append('file', blob, '2025-10-05 - Wagner Taiatella - Resume.pdf');
  
  console.log('🚀 Sending POST request to http://localhost:3000/api/profile/upload-cv ...');
  const startTime = Date.now();
  
  const response = await fetch('http://localhost:3000/api/profile/upload-cv', {
    method: 'POST',
    body: formData,
  });
  
  const duration = Date.now() - startTime;
  console.log(`⏱️ Request completed in ${duration}ms with status: ${response.status}`);
  
  const result = await response.json();
  console.log('📦 API Response JSON:', JSON.stringify(result, null, 2));
  
  if (response.ok) {
    console.log('✅ Upload successful! Let\'s verify the database records...');
    
    const profiles = await prisma.userProfile.findMany({
      include: {
        experiences: true,
        education: true,
        skills: true,
        projects: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 1,
    });
    
    if (profiles.length > 0) {
      console.log('👑 Most Recent Profile in Database:');
      console.log(JSON.stringify(profiles[0], null, 2));
    } else {
      console.log('⚠️ No profiles found in the database.');
    }
  } else {
    console.error('❌ Upload failed.');
  }
}

main()
  .catch((e) => {
    console.error('💥 Error in test execution:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
