import {
  normalizeProficiency,
  DEFAULT_FALLBACK_PROFICIENCY,
  CANONICAL_PROFICIENCY_LEVELS,
  PROFICIENCY_DICTIONARY,
} from "@/lib/normalization/proficiencyNormalizer";
import { logger } from "@/lib/logging/logger";

describe("proficiencyNormalizer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Constants & Exports", () => {
    it("should export DEFAULT_FALLBACK_PROFICIENCY as INTERMEDIATE", () => {
      expect(DEFAULT_FALLBACK_PROFICIENCY).toBe("INTERMEDIATE");
    });

    it("should export CANONICAL_PROFICIENCY_LEVELS containing all 4 enum values", () => {
      expect(CANONICAL_PROFICIENCY_LEVELS.has("BEGINNER")).toBe(true);
      expect(CANONICAL_PROFICIENCY_LEVELS.has("INTERMEDIATE")).toBe(true);
      expect(CANONICAL_PROFICIENCY_LEVELS.has("ADVANCED")).toBe(true);
      expect(CANONICAL_PROFICIENCY_LEVELS.has("EXPERT")).toBe(true);
      expect(CANONICAL_PROFICIENCY_LEVELS.size).toBe(4);
    });

    it("should export an immutable PROFICIENCY_DICTIONARY with expected mappings", () => {
      expect(Object.isFrozen(PROFICIENCY_DICTIONARY)).toBe(true);
      expect(PROFICIENCY_DICTIONARY["conversational"]).toBe("INTERMEDIATE");
      expect(PROFICIENCY_DICTIONARY["fluent"]).toBe("ADVANCED");
      expect(PROFICIENCY_DICTIONARY["basic"]).toBe("BEGINNER");
      expect(PROFICIENCY_DICTIONARY["native"]).toBe("EXPERT");
      expect(PROFICIENCY_DICTIONARY["iniciante"]).toBe("BEGINNER");
      expect(PROFICIENCY_DICTIONARY["avançado"]).toBe("ADVANCED");
    });
  });

  describe("Canonical Enum Preservation (Fast-Path)", () => {
    const canonicalLevels = [
      "BEGINNER",
      "INTERMEDIATE",
      "ADVANCED",
      "EXPERT",
    ] as const;

    canonicalLevels.forEach((level) => {
      it(`should preserve exact canonical uppercase enum "${level}" without logging`, () => {
        const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
        const result = normalizeProficiency(level, "TypeScript");

        expect(result).toBe(level);
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it(`should handle trimmed uppercase canonical enum "  ${level}  "`, () => {
        const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
        const result = normalizeProficiency(`  ${level}  `, "TypeScript");

        expect(result).toBe(level);
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it(`should handle lowercase or mixed-case canonical enum "${level.toLowerCase()}" without error`, () => {
        const result = normalizeProficiency(level.toLowerCase(), "TypeScript");

        expect(result).toBe(level);
      });
    });
  });

  describe("Synonym Dictionary Mapping (Multilingual & Informal)", () => {
    const testCases: Array<{ raw: string; expected: string; label: string }> = [
      // Beginner
      { raw: "basic", expected: "BEGINNER", label: "English basic" },
      { raw: "novice", expected: "BEGINNER", label: "English novice" },
      { raw: "elementary", expected: "BEGINNER", label: "English elementary" },
      { raw: "iniciante", expected: "BEGINNER", label: "Portuguese iniciante" },
      {
        raw: "básico",
        expected: "BEGINNER",
        label: "Portuguese básico with accent",
      },
      {
        raw: "basico",
        expected: "BEGINNER",
        label: "Portuguese basico without accent",
      },

      // Intermediate
      {
        raw: "conversational",
        expected: "INTERMEDIATE",
        label: "English conversational",
      },
      {
        raw: "intermediated",
        expected: "INTERMEDIATE",
        label: "English intermediated",
      },
      {
        raw: "intermédio",
        expected: "INTERMEDIATE",
        label: "Portuguese intermédio with accent",
      },
      {
        raw: "intermedio",
        expected: "INTERMEDIATE",
        label: "Portuguese intermedio without accent",
      },
      { raw: "médio", expected: "INTERMEDIATE", label: "Portuguese médio" },
      { raw: "medio", expected: "INTERMEDIATE", label: "Portuguese medio" },

      // Advanced
      { raw: "fluent", expected: "ADVANCED", label: "English fluent" },
      { raw: "proficient", expected: "ADVANCED", label: "English proficient" },
      { raw: "avançado", expected: "ADVANCED", label: "Portuguese avançado" },
      { raw: "avancado", expected: "ADVANCED", label: "Portuguese avancado" },
      { raw: "fluente", expected: "ADVANCED", label: "Portuguese fluente" },

      // Expert
      { raw: "native", expected: "EXPERT", label: "English native" },
      { raw: "master", expected: "EXPERT", label: "English master" },
      { raw: "nativo", expected: "EXPERT", label: "Portuguese nativo" },
      {
        raw: "bilingual",
        expected: "EXPERT",
        label: "English/Portuguese bilingual",
      },
    ];

    testCases.forEach(({ raw, expected, label }) => {
      it(`should map ${label} ("${raw}") to canonical "${expected}" and log mapped reason`, () => {
        const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
        const result = normalizeProficiency(raw, "English");

        expect(result).toBe(expected);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Normalized non-standard proficiency"),
          expect.objectContaining({
            action: "normalize_proficiency",
            skillName: "English",
            rawProficiency: raw,
            normalizedProficiency: expected,
            reason: "mapped",
          }),
        );
      });
    });
  });

  describe("Whitespace & Case Handling", () => {
    it("should trim leading and trailing whitespace including newlines and tabs", () => {
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
      const result = normalizeProficiency(
        " \t\n Conversational \n\t ",
        "Spanish",
      );

      expect(result).toBe("INTERMEDIATE");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reason: "mapped",
          normalizedProficiency: "INTERMEDIATE",
        }),
      );
    });

    it("should handle mixed case for dictionary words (e.g., 'fLuEnT')", () => {
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
      const result = normalizeProficiency("fLuEnT", "French");

      expect(result).toBe("ADVANCED");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reason: "mapped",
          normalizedProficiency: "ADVANCED",
        }),
      );
    });
  });

  describe("Safe Fallback Defaults", () => {
    it("should fallback to INTERMEDIATE for undefined", () => {
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
      const result = normalizeProficiency(undefined, "Go");

      expect(result).toBe("INTERMEDIATE");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing or empty proficiency"),
        expect.objectContaining({
          action: "normalize_proficiency",
          skillName: "Go",
          rawProficiency: undefined,
          normalizedProficiency: "INTERMEDIATE",
          reason: "fallback_empty",
        }),
      );
    });

    it("should fallback to INTERMEDIATE for null", () => {
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
      const result = normalizeProficiency(null, "Rust");

      expect(result).toBe("INTERMEDIATE");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing or empty proficiency"),
        expect.objectContaining({
          action: "normalize_proficiency",
          skillName: "Rust",
          rawProficiency: null,
          normalizedProficiency: "INTERMEDIATE",
          reason: "fallback_empty",
        }),
      );
    });

    it("should fallback to INTERMEDIATE for empty string", () => {
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
      const result = normalizeProficiency("", "Python");

      expect(result).toBe("INTERMEDIATE");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing or empty proficiency"),
        expect.objectContaining({
          action: "normalize_proficiency",
          skillName: "Python",
          rawProficiency: "",
          normalizedProficiency: "INTERMEDIATE",
          reason: "fallback_empty",
        }),
      );
    });

    it("should fallback to INTERMEDIATE for whitespace-only string", () => {
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
      const result = normalizeProficiency("    \n\t  ", "Docker");

      expect(result).toBe("INTERMEDIATE");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing or empty proficiency"),
        expect.objectContaining({
          action: "normalize_proficiency",
          skillName: "Docker",
          rawProficiency: "    \n\t  ",
          normalizedProficiency: "INTERMEDIATE",
          reason: "fallback_empty",
        }),
      );
    });

    it("should fallback to INTERMEDIATE for unknown terms (e.g. 'rockstar', 'guru')", () => {
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
      const result = normalizeProficiency("rockstar", "Kubernetes");

      expect(result).toBe("INTERMEDIATE");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unrecognized proficiency level"),
        expect.objectContaining({
          action: "normalize_proficiency",
          skillName: "Kubernetes",
          rawProficiency: "rockstar",
          normalizedProficiency: "INTERMEDIATE",
          reason: "fallback_unrecognized",
        }),
      );
    });

    it("should handle non-string types safely", () => {
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
      // @ts-expect-error test invalid runtime type
      const result = normalizeProficiency(12345, "AWS");

      expect(result).toBe("INTERMEDIATE");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing or empty proficiency"),
        expect.objectContaining({
          action: "normalize_proficiency",
          skillName: "AWS",
          rawProficiency: 12345,
          normalizedProficiency: "INTERMEDIATE",
          reason: "fallback_empty",
        }),
      );
    });
  });

  describe("Security & Prototype Pollution Hardening", () => {
    it.each([
      "constructor",
      "__proto__",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "isPrototypeOf",
    ])(
      "should safely fallback to INTERMEDIATE for prototype property '%s'",
      (prop) => {
        const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
        const result = normalizeProficiency(prop, "SecurityTest");

        expect(result).toBe("INTERMEDIATE");
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Unrecognized proficiency level"),
          expect.objectContaining({
            action: "normalize_proficiency",
            skillName: "SecurityTest",
            rawProficiency: prop,
            normalizedProficiency: "INTERMEDIATE",
            reason: "fallback_unrecognized",
          }),
        );
      },
    );

    it("should truncate rawProficiency exceeding 100 characters in warning logs to prevent log bloating", () => {
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
      const hugeInput = "a".repeat(150);
      const result = normalizeProficiency(hugeInput, "SecurityTest");

      expect(result).toBe("INTERMEDIATE");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          rawProficiency: "a".repeat(100) + "...",
        }),
      );
    });
  });

  describe("PII-Safe Observability Guard", () => {
    it("should never include user IDs, emails, document IDs or candidate PII in log payload", () => {
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation();
      normalizeProficiency("rockstar", "Secret Skill");

      expect(warnSpy).toHaveBeenCalled();
      const call = warnSpy.mock.calls[0] as unknown[];
      const payload = call[1] as Record<string, unknown>;

      expect(payload).toHaveProperty("action", "normalize_proficiency");
      expect(payload).toHaveProperty("skillName", "Secret Skill");
      expect(payload).toHaveProperty("rawProficiency", "rockstar");
      expect(payload).toHaveProperty("normalizedProficiency", "INTERMEDIATE");
      expect(payload).toHaveProperty("reason", "fallback_unrecognized");

      // Verify no PII fields exist
      const piiKeys = [
        "userId",
        "profileId",
        "email",
        "candidateName",
        "documentId",
        "cvId",
      ];
      piiKeys.forEach((key) => {
        expect(payload).not.toHaveProperty(key);
      });
    });
  });
});
