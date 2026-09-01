"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Spin, Button, message } from "antd";
import { RefreshCw } from "lucide-react";
import LLMDashboardSection from "./LLMDashboardSection";
import LLMModelRegistrySection from "./LLMModelRegistrySection";
import LLMRoutePreferencesSection from "./LLMRoutePreferencesSection";
import {
  AIDashboardResponseDTO,
  AIModelDTO,
  AIProviderDTO,
  AIRoutePreferenceDTO,
} from "@/types/ai-manager";

export default function LLMModelsManagerClient() {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<AIDashboardResponseDTO | null>(null);
  const [models, setModels] = useState<AIModelDTO[]>([]);
  const [providers, setProviders] = useState<AIProviderDTO[]>([]);
  const [routes, setRoutes] = useState<AIRoutePreferenceDTO[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashRes, modelsRes, providersRes, routesRes] = await Promise.all([
        fetch("/api/admin/llm-dashboard"),
        fetch("/api/admin/llm-models"),
        fetch("/api/admin/llm-providers"),
        fetch("/api/admin/llm-routes"),
      ]);

      if (dashRes.ok) setDashboardData(await dashRes.json());
      if (modelsRes.ok) setModels(await modelsRes.json());
      if (providersRes.ok) setProviders(await providersRes.json());
      if (routesRes.ok) setRoutes(await routesRes.json());
    } catch (error) {
      console.error("Failed to fetch LLM models data", error);
      message.error("Failed to load LLM configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !dashboardData) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end">
        <Button
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={fetchData}
          loading={loading}
          className="bg-zinc-800 border-zinc-700 text-zinc-200 hover:text-white hover:border-zinc-500"
        >
          Refresh Data
        </Button>
      </div>

      {/* 1. Dashboard Section */}
      <LLMDashboardSection data={dashboardData} loading={loading} />

      {/* 2. Model Registry Section */}
      <LLMModelRegistrySection
        models={models}
        providers={providers}
        loading={loading}
        onRefresh={fetchData}
      />

      {/* 3. Route Preferences Section */}
      <LLMRoutePreferencesSection
        routes={routes}
        loading={loading}
        onRefresh={fetchData}
      />
    </div>
  );
}
