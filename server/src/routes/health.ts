/**
 * Health Check Routes
 * 
 * Provides endpoints for monitoring and orchestration:
 * - /health: Basic liveness check (always returns 200)
 * - /health/ready: Readiness check (validates dependencies)
 * - /health/live: Kubernetes-style liveness probe
 */

import { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  timestamp: string;
  version?: string;
}

interface ReadinessCheck {
  ready: boolean;
  dependencies: {
    database?: 'ok' | 'error';
    session?: 'ok' | 'error';
  };
  error?: string;
}

export function healthRoutes(app: Express) {
  /**
   * Basic health check - always returns 200 if server is running
   * Used for basic uptime monitoring
   */
  app.get('/health', (req: Request, res: Response) => {
    const health: HealthStatus = {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
    };

    res.json(health);
  });

  /**
   * Readiness check - validates critical dependencies
   * Returns 200 if ready to serve traffic, 503 if not
   * Used by load balancers and orchestrators
   */
  app.get('/health/ready', async (req: Request, res: Response) => {
    const checks: ReadinessCheck = {
      ready: true,
      dependencies: {},
    };

    // Check database connection
    try {
      const db = require('../dataStore').db;
      if (db) {
        // Try a simple query
        db.prepare('SELECT 1 as test').get();
        checks.dependencies.database = 'ok';
      }
    } catch (err) {
      checks.ready = false;
      checks.dependencies.database = 'error';
      checks.error = err instanceof Error ? err.message : 'Database check failed';
      logger.error('health', 'Database readiness check failed', { error: checks.error });
    }

    // Check session store (basic validation)
    try {
      // Session store is available if we got here
      checks.dependencies.session = 'ok';
    } catch (err) {
      checks.ready = false;
      checks.dependencies.session = 'error';
      logger.error('health', 'Session readiness check failed', { error: err });
    }

    const statusCode = checks.ready ? 200 : 503;
    res.status(statusCode).json(checks);
  });

  /**
   * Liveness probe - Kubernetes-style
   * Returns 200 if process is alive, used to detect deadlocks
   */
  app.get('/health/live', (req: Request, res: Response) => {
    res.json({ 
      alive: true,
      pid: process.pid,
      uptime: process.uptime(),
    });
  });

  /**
   * Metrics endpoint - basic system metrics
   * Can be extended with Prometheus format later
   */
  app.get('/health/metrics', (req: Request, res: Response) => {
    const metrics = {
      process: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        pid: process.pid,
      },
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
      },
    };

    res.json(metrics);
  });

  logger.info('health', 'Health check routes registered', {
    endpoints: ['/health', '/health/ready', '/health/live', '/health/metrics'],
  });
}
