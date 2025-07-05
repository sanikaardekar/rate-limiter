import cluster from 'cluster';
import os from 'os';
import { QueueService } from '../services/queue-service';
import { RedisService } from '../services/redis-service';

export class RateLimitWorker {
  private queueService: QueueService;
  private redisService: RedisService;
  private isShuttingDown: boolean = false;

  constructor() {
    this.queueService = new QueueService();
    this.redisService = RedisService.getInstance();
    this.setupGracefulShutdown();
  }

  async start(): Promise<void> {
    console.log(`Rate limit worker ${process.pid} starting...`);
    
    try {
      this.startHealthCheck();
      
      console.log(`Rate limit worker ${process.pid} ready to process jobs`);

      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
      
    } catch (error) {
      console.error('Failed to start rate limit worker:', error);
      process.exit(1);
    }
  }

  private startHealthCheck(): void {
    setInterval(async () => {
      if (this.isShuttingDown) return;
      
      try {
        const stats = await this.queueService.getQueueStats();
        console.log(`Worker ${process.pid} - Queue Stats:`, {
          timestamp: new Date().toISOString(),
          rateLimitQueue: stats.rateLimitQueue,
          cleanupQueue: stats.cleanupQueue,
        });
        
        if (stats.rateLimitQueue.waiting > 1000) {
          console.warn(`High queue backlog: ${stats.rateLimitQueue.waiting} waiting jobs`);
        }
        
        if (stats.rateLimitQueue.failed > 50) {
          console.error(`High failure rate: ${stats.rateLimitQueue.failed} failed jobs`);
        }
        
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, 30000); 
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`Worker ${process.pid} received ${signal}, shutting down gracefully...`);
      this.isShuttingDown = true;
      
      try {
        await this.queueService.pauseQueues();
        
        await this.waitForJobsToComplete(30000);
        
        await this.queueService.closeQueues();
        
        await this.redisService.disconnect();
        
        console.log(`Worker ${process.pid} shut down complete`);
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  private async waitForJobsToComplete(timeout: number): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      try {
        const stats = await this.queueService.getQueueStats();
        const activeJobs = stats.rateLimitQueue.active + stats.cleanupQueue.active;
        
        if (activeJobs === 0) {
          console.log('All jobs completed');
          return;
        }
        
        console.log(`Waiting for ${activeJobs} active jobs to complete...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error('Error checking job status:', error);
        break;
      }
    }
    
    console.log('Timeout reached, forcing shutdown');
  }

  private async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    console.log(`Worker ${process.pid} shutting down...`);
    
    try {
      await this.queueService.closeQueues();
      await this.redisService.disconnect();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

export class WorkerCluster {
  private numWorkers: number;
  
  constructor(numWorkers?: number) {
    this.numWorkers = numWorkers || os.cpus().length;
  }

  start(): void {
    if (cluster.isMaster) {
      console.log(`Master ${process.pid} starting ${this.numWorkers} workers...`);
      
      for (let i = 0; i < this.numWorkers; i++) {
        cluster.fork();
      }

      cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
        
        if (!worker.exitedAfterDisconnect) {
          console.log('Starting a new worker...');
          cluster.fork();
        }
      });
      
      process.on('SIGTERM', () => {
        console.log('Master received SIGTERM, shutting down workers...');
        for (const id in cluster.workers) {
          cluster.workers[id]?.kill();
        }
      });
      
      process.on('SIGINT', () => {
        console.log('Master received SIGINT, shutting down workers...');
        for (const id in cluster.workers) {
          cluster.workers[id]?.kill();
        }
      });
      
    } else {
      const worker = new RateLimitWorker();
      worker.start().catch(error => {
        console.error('Worker failed to start:', error);
        process.exit(1);
      });
    }
  }
}

if (require.main === module) {
  const numWorkers = parseInt(process.env.RATE_LIMIT_WORKERS || '0') || os.cpus().length;
  
  if (process.env.NODE_ENV === 'production' && numWorkers > 1) {
    const cluster = new WorkerCluster(numWorkers);
    cluster.start();
  } else {
    const worker = new RateLimitWorker();
    worker.start().catch(error => {
      console.error('Failed to start worker:', error);
      process.exit(1);
    });
  }
}