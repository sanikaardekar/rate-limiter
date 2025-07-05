import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { RateLimiterMiddleware } from '../middleware/rate-limiter';
import { CacheService } from '../services/cache-service';
import { QueueService } from '../services/queue-service';
import { RateLimitRule } from '../types';

export class ApiServer {
  private app: express.Application;
  private port: number;
  private rateLimiter!: RateLimiterMiddleware; 
  private cacheService: CacheService;
  private queueService: QueueService;

  constructor(port: number = 3000) {
    this.app = express();
    this.port = port;
    this.cacheService = new CacheService();
    this.queueService = new QueueService();
    
    this.setupMiddleware();
    this.setupRateLimiting();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  private setupRateLimiting(): void {
    const rules: RateLimitRule[] = [
      {
        id: 'global',
        windowMs: 15 * 60 * 1000, 
        maxRequests: 1000, 
        message: 'Too many requests from this IP, please try again later',
      },
      {
        id: 'api',
        windowMs: 60 * 1000, 
        maxRequests: 100, 
        
        keyGenerator: (req) => `${req.ip}--${req.path}`,
        skipIf: (req) => req.path.startsWith('/health'),
      },
      {
        id: 'auth',
        windowMs: 5 * 60 * 1000, 
        maxRequests: 5,
        message: 'Too many authentication attempts, please try again later',
        statusCode: 423,
        skipIf: (req) => !req.path.startsWith('/auth'),
      },
      {
        id: 'burst',
        windowMs: 1000, 
        maxRequests: 10, 
        message: 'Request rate too high, please slow down',
        skipIf: (req) => req.path.startsWith('/health'),
      },
    ];

    this.rateLimiter = new RateLimiterMiddleware({
      rules,
      standardHeaders: true,
      legacyHeaders: true,
      onLimitReached: (req, res, result) => {
        res.status(result.rule.statusCode || 429).json({
          error: 'Rate limit exceeded',
          message: result.rule.message || 'Too many requests',
          ruleId: result.rule.id,
          limit: result.rule.maxRequests,
          remaining: result.info.remainingRequests,
          resetTime: result.info.resetTime,
          retryAfter: result.info.retryAfter,
          timestamp: new Date().toISOString(),
        });
      },
    });

    this.app.use(this.rateLimiter.middleware());
  }

  private setupRoutes(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    });

  
    this.app.get('/api/data', this.createApiRoute());
    this.app.post('/api/data', this.createApiRoute());
    this.app.put('/api/data/:id', this.createApiRoute());
    this.app.delete('/api/data/:id', this.createApiRoute());

    this.app.post('/auth/login', this.createAuthRoute());
    this.app.post('/auth/register', this.createAuthRoute());
    this.app.post('/auth/forgot-password', this.createAuthRoute());

    this.app.get('/admin/stats', this.getStatsRoute());
    this.app.post('/admin/reset-rate-limit', this.resetRateLimitRoute());
    this.app.get('/admin/queue-stats', this.getQueueStatsRoute());

    this.app.get('/test/unlimited', (req: Request, res: Response) => {
      res.json({
        message: 'This endpoint has no rate limiting',
        timestamp: new Date().toISOString(),
      });
    });

    this.app.get('/test/limited', (req: Request, res: Response) => {
      res.json({
        message: 'This endpoint is rate limited',
        timestamp: new Date().toISOString(),
      });
    });


    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private createApiRoute() {
    return async (req: Request, res: Response): Promise<void> => {
      try {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        
        res.json({
          message: 'API endpoint response',
          method: req.method,
          path: req.path,
          timestamp: new Date().toISOString(),
          data: req.method === 'GET' ? { items: ['item1', 'item2', 'item3'] } : req.body,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };
  }

  private createAuthRoute() {
    return async (req: Request, res: Response): Promise<void> => {
      try {
        await new Promise(resolve => setTimeout(resolve, 200));
        
        res.json({
          message: 'Authentication endpoint response',
          endpoint: req.path,
          timestamp: new Date().toISOString(),
          success: true,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Authentication Error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };
  }

  private getStatsRoute() {
    return async (req: Request, res: Response): Promise<void> => {
      try {
        const stats = await this.rateLimiter.getStats();
        const rateLimitStats = await this.cacheService.getRateLimitStats('rate_limit:*');
        
        res.json({
          timestamp: new Date().toISOString(),
          rateLimiter: stats,
          activeRateLimits: rateLimitStats.size,
          server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
          },
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to get stats',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };
  }

  private resetRateLimitRoute() {
    return async (req: Request, res: Response): Promise<void> => {
      try {
        const { identifier, ruleId } = req.body;
        
        if (!identifier) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'identifier is required',
          });
          return;
        }

        await this.rateLimiter.resetRateLimit(identifier, ruleId);
        
        res.json({
          message: 'Rate limit reset successfully',
          identifier,
          ruleId: ruleId || 'all',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to reset rate limit',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };
  }

  private getQueueStatsRoute() {
    return async (req: Request, res: Response): Promise<void> => {
      try {
        const stats = await this.queueService.getQueueStats();
        res.json({
          timestamp: new Date().toISOString(),
          queues: stats,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to get queue stats',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };
  }

  private setupErrorHandling(): void {
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Unhandled error:', error);
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString(),
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`API Server running on port ${this.port}`);
        console.log(`Health check: http://localhost:${this.port}/health`);
        console.log(`API endpoints: http://localhost:${this.port}/api/*`);
        console.log(`Admin stats: http://localhost:${this.port}/admin/stats`);
        console.log(`Auth endpoints: http://localhost:${this.port}/auth/*`);
        console.log(`Test endpoints: http://localhost:${this.port}/test/*`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      console.log('Shutting down API server...');
      resolve();
    });
  }

  getApp(): express.Application {
    return this.app;
  }

  getRateLimiter(): RateLimiterMiddleware {
    return this.rateLimiter;
  }
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000');
  const server = new ApiServer(port);
  
  server.start().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
  
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });
}