const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const email = 'wtaiatella@gmail.com';
  const passwordHash = await bcrypt.hash('Senha123!', 10);
  
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name: 'Wagner Taiatella',
    }
  });
  console.log("User created:", user);
}
main().catch(console.error).finally(() => prisma.$disconnect());
