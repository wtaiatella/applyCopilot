import {
  BasicDataInputSchema,
  ExperienceInputSchema,
  SkillInputSchema,
  ReferenceInputSchema,
  BulletInputSchema,
} from "@/lib/validation/profileSchemas";

describe("Profile Validation Schemas (Zod)", () => {
  describe("BasicDataInputSchema", () => {
    it("should pass for valid basic data payload", () => {
      const validPayload = {
        firstName: "John",
        lastName: "Doe",
        phone: "+1234567890",
        location: "New York, NY",
        linkedin: "https://linkedin.com/in/johndoe",
        github: "https://github.com/johndoe",
        website: "https://johndoe.com",
        title: "Software Engineer",
        summary: "Passionate developer.",
      };

      const result = BasicDataInputSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should accept null or empty values for optional fields", () => {
      const emptyPayload = {
        firstName: null,
        lastName: null,
        phone: null,
        location: null,
        linkedin: "",
        github: null,
        website: null,
        title: null,
        summary: null,
      };

      const result = BasicDataInputSchema.safeParse(emptyPayload);
      expect(result.success).toBe(true);
    });

    it("should reject invalid social media URLs", () => {
      const invalidPayload = {
        linkedin: "not-a-url",
      };

      const result = BasicDataInputSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid LinkedIn URL");
      }
    });
  });

  describe("BulletInputSchema", () => {
    it("should validate correctly configured bullets", () => {
      const bullet = {
        text: "Led a team of 3 developers to build Next.js app.",
        isActive: true,
        isArchived: false,
        type: "BULLET",
        sortOrder: 1,
      };

      const result = BulletInputSchema.safeParse(bullet);
      expect(result.success).toBe(true);
    });

    it("should reject empty bullet text", () => {
      const result = BulletInputSchema.safeParse({ text: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("ExperienceInputSchema", () => {
    it("should validate correct experience data", () => {
      const validExperience = {
        company: "Google",
        position: "Software Engineer",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-06-01T00:00:00.000Z",
        current: false,
        bullets: [
          {
            text: "Worked on Search.",
            isActive: true,
            isArchived: false,
            type: "BULLET",
            sortOrder: 0,
          },
        ],
        freeFormContext: "Great environment",
      };

      const result = ExperienceInputSchema.safeParse(validExperience);
      expect(result.success).toBe(true);
    });

    it("should reject missing required fields like company", () => {
      const invalidExperience = {
        position: "Software Engineer",
        startDate: "2026-01-01T00:00:00.000Z",
      };

      const result = ExperienceInputSchema.safeParse(invalidExperience);
      expect(result.success).toBe(false);
    });

    it("should reject invalid ISO date formats", () => {
      const invalidExperience = {
        company: "Google",
        position: "Software Engineer",
        startDate: "2026/01/01", // not ISO datetime
      };

      const result = ExperienceInputSchema.safeParse(invalidExperience);
      expect(result.success).toBe(false);
    });
  });

  describe("SkillInputSchema", () => {
    it("should accept valid proficiency levels", () => {
      const validSkill = {
        name: "TypeScript",
        proficiency: "EXPERT",
        yearsExperience: 5,
      };

      const result = SkillInputSchema.safeParse(validSkill);
      expect(result.success).toBe(true);
    });

    it("should reject invalid proficiency levels", () => {
      const invalidSkill = {
        name: "TypeScript",
        proficiency: "LEGENDARY", // not in enum
      };

      const result = SkillInputSchema.safeParse(invalidSkill);
      expect(result.success).toBe(false);
    });
  });

  describe("ReferenceInputSchema", () => {
    it("should accept valid references", () => {
      const validRef = {
        name: "Jane Smith",
        company: "Tech Corp",
        relationship: "Manager",
        email: "jane@tech.com",
        canContact: true,
      };

      const result = ReferenceInputSchema.safeParse(validRef);
      expect(result.success).toBe(true);
    });

    it("should reject invalid email formats", () => {
      const invalidRef = {
        name: "Jane Smith",
        email: "not-an-email",
      };

      const result = ReferenceInputSchema.safeParse(invalidRef);
      expect(result.success).toBe(false);
    });
  });
});
