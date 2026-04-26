// Metrics API Route
// GET /api/health/metrics - System metrics for monitoring
// Based on task T024: Implement health check and monitoring endpoints

import { successResponse, handleApiError } from '@/lib/api';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const memoryUsage = process.memoryUsage();

    // Get database stats
    const dbStats = await Promise.all([
      prisma.user.count(),
      prisma.jobListing.count(),
      prisma.application.count(),
    ]).catch(() => [0, 0, 0]);

    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      },
      database: {
        users: dbStats[0],
        jobs: dbStats[1],
        applications: dbStats[2],
      },
      version: process.env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      platform: process.platform,
    };

    return successResponse(metrics);
  } catch (error) {
    return handleApiError(error);
  }
}
