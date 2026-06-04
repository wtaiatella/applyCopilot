// Detailed Health Check API Route
// GET /api/health/detailed - Detailed health check with component status
// Based on task T024: Implement health check and monitoring endpoints

import { successResponse, handleApiError } from '@/lib/api';
import prisma from '@/lib/prisma';
import { ollamaClient } from '@/lib/ai/ollama';
import { geminiClient } from '@/lib/ai/gemini';

interface HealthComponent {
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  message?: string;
}

interface DetailedHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  responseTime: number;
  components: {
    database: HealthComponent;
    ai: {
      ollama: HealthComponent;
      gemini: HealthComponent;
    };
  };
  memory: {
    used: number;
    total: number;
    free: number;
  };
}

export async function GET() {
  const startTime = Date.now();
  try {

    // Database health check
    let databaseStatus: HealthComponent = { status: 'healthy', responseTime: 0 };
    try {
      const dbStart = Date.now();
      await prisma.$runCommandRaw({ ping: 1 });
      databaseStatus.responseTime = Date.now() - dbStart;
    } catch {
      databaseStatus = { status: 'unhealthy', responseTime: 0, message: 'Database connection failed' };
    }

    // AI services health checks
    const ollamaAvailable = await ollamaClient.isAvailable();
    const geminiAvailable = await geminiClient.isAvailable();

    const ollamaStatus: HealthComponent = {
      status: ollamaAvailable ? 'healthy' : 'degraded',
      responseTime: 0,
      message: ollamaAvailable ? undefined : 'Ollama not configured',
    };

    const geminiStatus: HealthComponent = {
      status: geminiAvailable ? 'healthy' : 'healthy', // Gemini is optional
      responseTime: 0,
      message: geminiAvailable ? undefined : 'Gemini not configured (optional)',
    };

    // Memory usage
    const memoryUsage = process.memoryUsage();
    const memory = {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      free: Math.round((memoryUsage.heapTotal - memoryUsage.heapUsed) / 1024 / 1024),
    };

    // Determine overall status
    const allStatuses = [databaseStatus.status, ollamaStatus.status, geminiStatus.status];
    const overallStatus = allStatuses.includes('unhealthy')
      ? 'unhealthy'
      : allStatuses.includes('degraded')
        ? 'degraded'
        : 'healthy';

    const health: DetailedHealth = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      responseTime: Date.now() - startTime,
      components: {
        database: databaseStatus,
        ai: {
          ollama: ollamaStatus,
          gemini: geminiStatus,
        },
      },
      memory,
    };

    return successResponse(health);
  } catch (error) {
    return handleApiError(error);
  }
}
