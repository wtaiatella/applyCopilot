// Health Check API Route
// GET /api/health - Basic health check
// Based on task T024: Implement health check and monitoring endpoints

import { successResponse, handleApiError } from '@/lib/api';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const startTime = Date.now();

    // Check database connectivity
    let dbStatus = 'healthy';
    let dbResponseTime = 0;

    try {
      const dbStart = Date.now();
      // MongoDB health check - ping command
      await prisma.$runCommandRaw({ ping: 1 });
      dbResponseTime = Date.now() - dbStart;
    } catch {
      dbStatus = 'unhealthy';
    }

    const totalResponseTime = Date.now() - startTime;

    const health = {
      status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: {
          status: dbStatus,
          responseTime: `${dbResponseTime}ms`,
        },
        api: {
          status: 'healthy',
          responseTime: `${totalResponseTime}ms`,
        },
      },
    };

    return successResponse(health);
  } catch (error) {
    return handleApiError(error);
  }
}
