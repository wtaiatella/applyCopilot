/**
 * @jest-environment node
 */
import "dotenv/config";
import { prisma, pool } from "@/lib/db/prisma";

describe("Database Integration Tests (Prisma + pgvector)", () => {
  // Clean up connection pools after tests complete
  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  it("should successfully query seeded SystemConfig variables", async () => {
    const configCount = await prisma.systemConfig.count();
    expect(configCount).toBeGreaterThanOrEqual(6);

    const defaultProvider = await prisma.systemConfig.findUnique({
      where: { key: "AI_PROVIDER_DEFAULT" },
    });
    expect(defaultProvider).toBeDefined();
    expect(defaultProvider?.value).toBe("gemini");

    const parsingProvider = await prisma.systemConfig.findUnique({
      where: { key: "AI_PROVIDER_PARSING" },
    });
    expect(parsingProvider?.value).toBe("gemini");
  });

  it("should perform basic User/UserProfile CRUD with cascade deletion", async () => {
    const testEmail = `test-integration-${Date.now()}@example.com`;

    // 1. Create User and UserProfile
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "securepassword123",
        profile: {
          create: {
            firstName: "Integration",
            lastName: "Tester",
            title: "QA Engineer",
            location: "San Francisco, CA",
          },
        },
      },
      include: {
        profile: true,
      },
    });

    expect(user.id).toBeDefined();
    expect(user.profile).toBeDefined();
    expect(user.profile?.firstName).toBe("Integration");

    const profileId = user.profile!.id;

    // 2. Update UserProfile
    const updatedProfile = await prisma.userProfile.update({
      where: { id: profileId },
      data: {
        title: "Senior QA Engineer",
      },
    });
    expect(updatedProfile.title).toBe("Senior QA Engineer");

    // 3. Delete User and verify cascade deletion on UserProfile
    await prisma.user.delete({
      where: { id: user.id },
    });

    const deletedProfile = await prisma.userProfile.findUnique({
      where: { id: profileId },
    });
    expect(deletedProfile).toBeNull();
  });

  it("should successfully write and query pgvector embeddings with cosine distance", async () => {
    const testEmail = `vector-test-${Date.now()}@example.com`;

    // Create User and UserProfile
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "vectorpassword123",
        profile: {
          create: {
            firstName: "Vector",
            lastName: "User",
            title: "AI Engineer",
          },
        },
      },
      include: {
        profile: true,
      },
    });

    const profileId = user.profile!.id;

    // Generate a valid 512-dimension float array representation
    const mockVector = Array.from({ length: 512 }, (_, i) => i / 512);
    const vectorString = `[${mockVector.join(",")}]`;

    // 1. Update embedding using Raw SQL
    await prisma.$executeRawUnsafe(
      `UPDATE "UserProfile" SET embedding = $1::vector WHERE id = $2`,
      vectorString,
      profileId
    );

    // 2. Query embedding distance using Raw SQL with Cosine Distance operator <=>
    const queryVector = Array.from({ length: 512 }, (_, i) => (i + 0.1) / 512);
    const queryVectorString = `[${queryVector.join(",")}]`;

    const results = await prisma.$queryRawUnsafe<
      { id: string; distance: number }[]
    >(
      `SELECT id, (embedding <=> $1::vector) as distance 
       FROM "UserProfile" 
       WHERE id = $2`,
      queryVectorString,
      profileId
    );

    expect(results).toHaveLength(1);
    expect(results[0].distance).toBeDefined();
    expect(typeof results[0].distance).toBe("number");
    expect(results[0].distance).toBeLessThan(0.01); // vectors are very close

    // Clean up
    await prisma.user.delete({
      where: { id: user.id },
    });
  });
});
