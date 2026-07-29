/**
 * @jest-environment node
 */
import { generateEmbedding } from "@/lib/ai/vector-service";
import { getTensorFlowModel, warmUpModel } from "@/lib/ai/tensorflow-model";

// Mock the tensorflow model loader
jest.mock("@/lib/ai/tensorflow-model", () => {
  const mockEmbed = jest.fn().mockImplementation(async (texts: string[]) => {
    return {
      array: async () => [new Array(512).fill(0.1)],
      dispose: jest.fn(),
    };
  });

  const mockModel = {
    embed: mockEmbed,
  };

  return {
    getTensorFlowModel: jest.fn().mockResolvedValue(mockModel),
    warmUpModel: jest.fn().mockResolvedValue(undefined),
  };
});

describe("Local Vector Generation Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return a 512-dimension vector of decimals for a non-empty string", async () => {
    const vector = await generateEmbedding("Senior React Developer with 5 years experience");
    
    expect(vector).toBeInstanceOf(Array);
    expect(vector.length).toBe(512);
    expect(vector[0]).toBe(0.1);
    expect(getTensorFlowModel).toHaveBeenCalledTimes(1);
  });

  it("should return a zero-filled 512-dimension vector when input text is empty or whitespace", async () => {
    const vectorFromEmpty = await generateEmbedding("");
    expect(vectorFromEmpty).toBeInstanceOf(Array);
    expect(vectorFromEmpty.length).toBe(512);
    expect(vectorFromEmpty.every(val => val === 0)).toBe(true);

    const vectorFromWhitespace = await generateEmbedding("    ");
    expect(vectorFromWhitespace.length).toBe(512);
    expect(vectorFromWhitespace.every(val => val === 0)).toBe(true);

    // Should not trigger model loader for empty inputs
    expect(getTensorFlowModel).not.toHaveBeenCalled();
  });

  it("should throw an error and log if embedding generation fails", async () => {
    const mockGetModel = getTensorFlowModel as jest.Mock;
    mockGetModel.mockRejectedValueOnce(new Error("TensorFlow CPU out of memory"));

    await expect(generateEmbedding("React Native")).rejects.toThrow("TensorFlow CPU out of memory");
  });

  it("should throw an error if the model returns a vector with length other than 512", async () => {
    const mockGetModel = getTensorFlowModel as jest.Mock;
    mockGetModel.mockResolvedValueOnce({
      embed: async () => ({
        array: async () => [new Array(256).fill(0.5)],
        dispose: jest.fn(),
      }),
    });

    await expect(generateEmbedding("Tailwind CSS")).rejects.toThrow(
      "Expected USE embedding vector of size 512, received 256"
    );
  });
});
