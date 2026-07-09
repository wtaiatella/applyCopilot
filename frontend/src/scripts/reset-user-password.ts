import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import bcrypt from "bcryptjs";

async function main() {
  const email = "wtaiatella@gmail.com";
  const password = "admin"; // super simple temporary password
  
  console.log(`Resetting password for user ${email}...`);
  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword }
    });
    console.log("Password updated successfully!");
    console.log(`You can now log in with email: ${email} and password: ${password}`);
  } catch (error) {
    console.error("Failed to update password:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
