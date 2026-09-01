/**
 * @jest-environment node
 */
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: jest.fn() },
  })),
}));

jest.mock("ollama", () => ({
  Ollama: jest.fn().mockImplementation(() => ({
    chat: jest.fn(),
  })),
}));

// Mock auth session
jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn().mockResolvedValue({
    user: { id: "admin-user-id", role: "ADMIN", email: "admin@example.com" },
  }),
}));

import { GET as getDashboard } from "../../src/app/api/admin/llm-dashboard/route";
import { GET as getProviders, POST as createProvider } from "../../src/app/api/admin/llm-providers/route";
import { GET as getModels, POST as createModel } from "../../src/app/api/admin/llm-models/route";
import { PUT as updateModel, DELETE as deleteModel } from "../../src/app/api/admin/llm-models/[id]/route";
import { POST as resetBlock } from "../../src/app/api/admin/llm-models/[id]/reset-block/route";
import { GET as getRoutes, PUT as updateRoutes } from "../../src/app/api/admin/llm-routes/route";

describe("Admin LLM Routes Integration Tests", () => {
  it("GET /api/admin/llm-dashboard returns dashboard summary and model usage stats", async () => {
    const res = await getDashboard();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toBeDefined();
    expect(Array.isArray(data.models)).toBe(true);
  });

  it("GET /api/admin/llm-providers returns list of providers", async () => {
    const res = await getProviders();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("CRUD cycle on AI Models via Admin API", async () => {
    // 1. Get providers to find Google AI
    const provRes = await getProviders();
    const providers = await provRes.json();
    const googleProv = providers.find((p: { name: string }) => p.name === "Google AI");

    // 2. Create Model
    const createReq = new Request("http://localhost/api/admin/llm-models", {
      method: "POST",
      body: JSON.stringify({
        providerId: googleProv.id,
        displayName: "Integration Test Model",
        modelId: "test-integration-model",
        tier: "FREE",
        rpm: 25,
        rpd: 250,
      }),
    });

    const createRes = await createModel(createReq);
    expect(createRes.status).toBe(201);
    const createdModel = await createRes.json();
    expect(createdModel.displayName).toBe("Integration Test Model");

    // 3. Update Model
    const updateReq = new Request(`http://localhost/api/admin/llm-models/${createdModel.id}`, {
      method: "PUT",
      body: JSON.stringify({
        displayName: "Updated Test Model",
        rpm: 30,
      }),
    });
    const updateRes = await updateModel(updateReq, { params: Promise.resolve({ id: createdModel.id }) });
    expect(updateRes.status).toBe(200);
    const updatedModel = await updateRes.json();
    expect(updatedModel.displayName).toBe("Updated Test Model");

    // 4. Reset Block
    const resetRes = await resetBlock(new Request(`http://localhost/api/admin/llm-models/${createdModel.id}/reset-block`, { method: "POST" }), {
      params: Promise.resolve({ id: createdModel.id }),
    });
    expect(resetRes.status).toBe(200);
    const resetData = await resetRes.json();
    expect(resetData.status).toBe("ACTIVE");

    // 5. Delete Model
    const deleteReq = new Request(`http://localhost/api/admin/llm-models/${createdModel.id}`, {
      method: "DELETE",
    });
    const deleteRes = await deleteModel(deleteReq, { params: Promise.resolve({ id: createdModel.id }) });
    expect(deleteRes.status).toBe(200);
  });

  it("GET & PUT /api/admin/llm-routes updates route preferences", async () => {
    const getRes = await getRoutes();
    expect(getRes.status).toBe(200);
    const routes = await getRes.json();
    expect(routes.length).toBe(16);

    const putReq = new Request("http://localhost/api/admin/llm-routes", {
      method: "PUT",
      body: JSON.stringify({
        routes: [{ routeId: "cv.parse.basicData", preferredTier: "LOCAL" }],
      }),
    });

    const putRes = await updateRoutes(putReq);
    expect(putRes.status).toBe(200);
    const updatedRoutes = await putRes.json();
    const updatedRoute = updatedRoutes.find((r: { routeId: string }) => r.routeId === "cv.parse.basicData");
    expect(updatedRoute.preferredTier).toBe("LOCAL");

    // Reset back to FREE
    await updateRoutes(
      new Request("http://localhost/api/admin/llm-routes", {
        method: "PUT",
        body: JSON.stringify({
          routes: [{ routeId: "cv.parse.basicData", preferredTier: "FREE" }],
        }),
      }),
    );
  });
});
