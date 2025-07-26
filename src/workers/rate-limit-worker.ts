import { QueueService } from '../services/queue-service';
import { RedisService } from '../services/redis-service';

export class RateLimitWorker {
  private queueService: QueueService;
  private redisService: RedisService;
  private isRunning: boolean = false;

  constructor() {
    this.queueService = new QueueService();
    this.redisService = RedisService.getInstance();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Rate limit worker started');
    
    await this.queueService.startProcessing();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    await this.queueService.closeQueues();
    console.log('Rate limit worker stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

if (require.main === module) {
  const worker = new RateLimitWorker();
  
  worker.start().catch(error => {
    console.error('Failed to start rate limit worker:', error);
    process.exit(1);
  });
  
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down worker');
    await worker.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down worker');
    await worker.stop();
    process.exit(0);
  });
}