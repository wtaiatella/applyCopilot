const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log("Users:", users.map(u => u.email));
}
main().catch(console.error).finally(() => prisma.$disconnect());
