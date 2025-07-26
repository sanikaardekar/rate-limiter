import Bull from 'bull';
import { RedisService } from './redis-service';
import { QueueMessage } from '../types';

export class QueueService {
  private rateLimitQueue: Bull.Queue<QueueMessage>;
  private cleanupQueue: Bull.Queue<{ pattern: string }>;
  private redisService: RedisService;

  constructor() {
    this.redisService = RedisService.getInstance();
    
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    };

    this.rateLimitQueue = new Bull('rate-limit-queue', { redis: redisConfig });
    this.cleanupQueue = new Bull('cleanup-queue', { redis: redisConfig });

    this.setupQueueProcessors();
    this.setupPeriodicCleanup();
  }

  private setupQueueProcessors(): void {

  }

  async startProcessing(): Promise<void> {
    try {
      this.rateLimitQueue.process('process-rate-limit', 10, async (job) => {
      const { type, key, rule, timestamp } = job.data;
      
      try {
        switch (type) {
          case 'INCREMENT':
            await this.redisService.incrementCounter(key, rule);
            break;
          case 'RESET':
            const redis = await this.redisService.getClient();
            await redis.del(key);
            break;
          case 'CLEANUP':
            await this.redisService.cleanupExpiredKeys(`${key}*`);
            break;
        }
      } catch (error) {
        console.error(`Error processing ${type} job:`, error);
        throw error;
      }
    });

      this.cleanupQueue.process('cleanup-expired', 1, async (job) => {
      const { pattern } = job.data;
      
      try {
        await this.redisService.cleanupExpiredKeys(pattern);
      } catch (error) {
        console.error('Error in cleanup job:', error);
        throw error;
      }
    });

      this.rateLimitQueue.on('failed', (job, err) => {
        console.error(`Rate limit job ${job.id} failed:`, err);
      });
    } catch (error) {
      console.error('Failed to setup queue processors:', error);
      throw error;
    }
  }

  private setupPeriodicCleanup(): void {
    this.cleanupQueue.add(
      'cleanup-expired',
      { pattern: 'rate_limit:*' },
      {
        repeat: { cron: '*/10 * * * *' }, 
        removeOnComplete: 5,
        removeOnFail: 3,
      }
    );
  }

  async addRateLimitJob(message: QueueMessage, delay?: number): Promise<Bull.Job<QueueMessage>> {
    const jobOptions: Bull.JobOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 10,
      removeOnFail: 5,
    };

    if (delay) {
      jobOptions.delay = delay;
    }

    return this.rateLimitQueue.add('process-rate-limit', message, jobOptions);
  }

  async addCleanupJob(pattern: string): Promise<Bull.Job<{ pattern: string }>> {
    return this.cleanupQueue.add('cleanup-expired', { pattern }, {
      attempts: 2,
      removeOnComplete: 3,
      removeOnFail: 2,
    });
  }

  async getQueueStats(): Promise<{
    rateLimitQueue: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
    cleanupQueue: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
  }> {
    const [
      rateLimitWaiting,
      rateLimitActive,
      rateLimitCompleted,
      rateLimitFailed,
      cleanupWaiting,
      cleanupActive,
      cleanupCompleted,
      cleanupFailed,
    ] = await Promise.all([
      this.rateLimitQueue.getWaiting(),
      this.rateLimitQueue.getActive(),
      this.rateLimitQueue.getCompleted(),
      this.rateLimitQueue.getFailed(),
      this.cleanupQueue.getWaiting(),
      this.cleanupQueue.getActive(),
      this.cleanupQueue.getCompleted(),
      this.cleanupQueue.getFailed(),
    ]);

    return {
      rateLimitQueue: {
        waiting: rateLimitWaiting.length,
        active: rateLimitActive.length,
        completed: rateLimitCompleted.length,
        failed: rateLimitFailed.length,
      },
      cleanupQueue: {
        waiting: cleanupWaiting.length,
        active: cleanupActive.length,
        completed: cleanupCompleted.length,
        failed: cleanupFailed.length,
      },
    };
  }

  async pauseQueues(): Promise<void> {
    await Promise.all([
      this.rateLimitQueue.pause(),
      this.cleanupQueue.pause(),
    ]);
  }

  async resumeQueues(): Promise<void> {
    await Promise.all([
      this.rateLimitQueue.resume(),
      this.cleanupQueue.resume(),
    ]);
  }

  async closeQueues(): Promise<void> {
    await Promise.all([
      this.rateLimitQueue.close(),
      this.cleanupQueue.close(),
    ]);
  }
}