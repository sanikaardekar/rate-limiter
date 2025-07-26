import { Request, Response, NextFunction } from 'express';
import { CacheService } from '../services/cache-service';
import { QueueService } from '../services/queue-service';
import { RedisService } from '../services/redis-service';
import { HeadersUtil } from '../utils/headers';
import { RateLimitRule, QueueMessage } from '../types';

export interface RateLimiterOptions {
  rules: RateLimitRule[];
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response, result: any) => void;
  standardHeaders?: boolean; 
  legacyHeaders?: boolean;
  enableLocalThrottle?: boolean;
  maxThrottleDelay?: number;
  enableInMemoryFallback?: boolean;
}

export class RateLimiterMiddleware {
  private cacheService: CacheService;
  private queueService: QueueService;
  private options: Required<RateLimiterOptions>;
  private throttleMap: Map<string, number> = new Map();

  constructor(options: RateLimiterOptions) {
    this.cacheService = new CacheService(options.enableInMemoryFallback);
    this.queueService = new QueueService();
    
    this.options = {
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (req: Request) => HeadersUtil.getClientIdentifier(req),
      onLimitReached: this.defaultOnLimitReached,
      standardHeaders: true,
      legacyHeaders: true,
      enableLocalThrottle: false,
      maxThrottleDelay: 1000,
      enableInMemoryFallback: false,
      ...options,
    };
  }

  middleware = () => {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const identifier = this.options.keyGenerator(req);
        

        if (this.options.enableLocalThrottle) {
          const throttleDelay = await this.calculateThrottleDelay(identifier);
          if (throttleDelay > 0) {
            await this.delay(Math.min(throttleDelay, this.options.maxThrottleDelay));
          }
        }


        const results = await Promise.all(
          this.options.rules.map(rule => this.checkRule(req, rule, true))
        );

        const activeResults = results.filter(result => result !== null);

        
        if (activeResults.length === 0) {
          return next();
        }


        const blockedResult = activeResults.find(result => !result.allowed);
        if (blockedResult) {
          await this.queueCleanupJob(identifier, blockedResult.rule);
          return this.options.onLimitReached(req, res, blockedResult);
        }
        

        const finalResult = activeResults.reduce((most, current) => {
  
          return current.rule.maxRequests < most.rule.maxRequests ? current : most;
        });

        if (!finalResult) {
          return next();
        }

        if (this.options.legacyHeaders) {
          HeadersUtil.setRateLimitHeaders(res, finalResult);
        }

        if (this.options.standardHeaders) {
          this.setStandardHeaders(res, finalResult);
        }

        this.addWarningHeaders(res, finalResult);
        HeadersUtil.addSecurityHeaders(res);

        const metadata = HeadersUtil.getRequestMetadata(req);
        HeadersUtil.logRateLimitEvent(identifier, finalResult.rule, finalResult, metadata);


        this.setupPostResponseHandling(req, res, activeResults);

        next();
      } catch (error) {
        const { HeadersUtil } = require('../utils/headers');
        HeadersUtil.logError('rule', error as Error, { operation: 'middleware' });
        next();
      }
    };
  };

  private async checkRule(req: Request, rule: RateLimitRule, increment: boolean = true) {
    if (rule.skipIf && rule.skipIf(req)) {
      return null; 
    }

    const identifier = rule.keyGenerator ? rule.keyGenerator(req) : this.options.keyGenerator(req);
    const key = HeadersUtil.generateRateLimitKey(identifier, rule);

    return increment 
      ? await this.cacheService.checkRateLimit(key, rule)
      : await this.cacheService.getCurrentCount(key, rule);
  }

  private createAllowedResult(rule: RateLimitRule) {
    return {
      allowed: true,
      info: {
        totalRequests: 0,
        remainingRequests: rule.maxRequests,
        resetTime: Date.now() + rule.windowMs,
      },
      rule,
    };
  }

  private setStandardHeaders(res: Response, result: any): void {
    res.setHeader('RateLimit-Limit', result.rule.maxRequests);
    res.setHeader('RateLimit-Remaining', result.info.remainingRequests);
    res.setHeader('RateLimit-Reset', Math.ceil(result.info.resetTime / 1000));
    res.setHeader('RateLimit-Policy', `${result.rule.maxRequests};w=${result.rule.windowMs / 1000}`);
    
    if (result.info.retryAfter) {
      res.setHeader('Retry-After', result.info.retryAfter);
    }
  }

  private addWarningHeaders(res: Response, result: any): void {
    const remaining = result.info.remainingRequests;
    const total = result.rule.maxRequests;
    const remainingPercent = (remaining / total) * 100;
    
    if (remaining === 0) {
      res.setHeader('X-RateLimit-Warning', 'Rate limit nearly exceeded');
    } else if (remainingPercent <= 20) {
      res.setHeader('X-RateLimit-Warning', 'Approaching rate limit');
    }
  }

  private defaultOnLimitReached = (req: Request, res: Response, result: any) => {

    if (this.options.legacyHeaders) {
      HeadersUtil.setRateLimitHeaders(res, result);
    }
    if (this.options.standardHeaders) {
      this.setStandardHeaders(res, result);
    }
    this.addWarningHeaders(res, result);
    
    const message = result.rule.message || 'Too many requests, please try again later';
    const statusCode = result.rule.statusCode || 429;

    res.status(statusCode).json({
      error: 'Rate limit exceeded',
      message,
      retryAfter: result.info.retryAfter,
      limit: result.rule.maxRequests,
      remaining: result.info.remainingRequests,
      resetTime: result.info.resetTime,
    });
  };

  private async queueIncrementJob(identifier: string, rule: RateLimitRule): Promise<void> {
    const message: QueueMessage = {
      type: 'INCREMENT',
      key: HeadersUtil.generateRateLimitKey(identifier, rule),
      rule,
      timestamp: Date.now(),
    };

    await this.queueService.addRateLimitJob(message);
  }

  private async queueCleanupJob(identifier: string, rule: RateLimitRule): Promise<void> {
    const message: QueueMessage = {
      type: 'CLEANUP',
      key: HeadersUtil.generateRateLimitKey(identifier, rule),
      rule,
      timestamp: Date.now(),
    };

    await this.queueService.addRateLimitJob(message, 60000);
  }

  static create(options: RateLimiterOptions) {
    return new RateLimiterMiddleware(options).middleware();
  }

  async getStats() {
    const queueStats = await this.queueService.getQueueStats();
    const cacheSize = this.cacheService.getLocalCacheSize();
    
    return {
      queueStats,
      localCacheSize: cacheSize,
    };
  }

  async resetRateLimit(identifier: string, ruleId?: string): Promise<void> {
    if (ruleId) {
      const rule = this.options.rules.find(r => r.id === ruleId);
      if (rule) {
        const key = HeadersUtil.generateRateLimitKey(identifier, rule);
        await this.cacheService.resetRateLimit(key);
      }
    } else {
      for (const rule of this.options.rules) {
        const key = HeadersUtil.generateRateLimitKey(identifier, rule);
        await this.cacheService.resetRateLimit(key);
      }
    }
    

    this.throttleMap.delete(identifier);
  }

  private async calculateThrottleDelay(identifier: string): Promise<number> {
    const lastRequest = this.throttleMap.get(identifier) || 0;
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequest;
    
    const burstRule = this.options.rules.find(rule => rule.id === 'burst');
    if (!burstRule || burstRule.maxRequests === 0) return 0;
    
    const minInterval = burstRule.windowMs / burstRule.maxRequests;
    const delay = Math.max(0, minInterval - timeSinceLastRequest);
    
    this.throttleMap.set(identifier, now);
    this.cleanupThrottleMap();
    return delay;
  }

  private cleanupThrottleMap(): void {
    if (this.throttleMap.size > 1000) {
      const now = Date.now();
      const cutoff = now - 60000;
      for (const [key, timestamp] of this.throttleMap.entries()) {
        if (timestamp < cutoff) {
          this.throttleMap.delete(key);
        }
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private setupPostResponseHandling(req: Request, res: Response, results: any[]): void {
    res.on('finish', () => {
      const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
      const isError = res.statusCode >= 400;
      const shouldRevert = (isSuccess && this.options.skipSuccessfulRequests) ||
                          (isError && this.options.skipFailedRequests);
      
      if (shouldRevert) {
        results.forEach(result => {
          if (result && result.allowed) {
            const identifier = this.options.keyGenerator(req);
            this.revertRateLimit(identifier, result.rule);
          }
        });
      }
    });
  }

  private async revertRateLimit(identifier: string, rule: RateLimitRule): Promise<void> {
    try {
      const key = HeadersUtil.generateRateLimitKey(identifier, rule);
      const redis = await RedisService.getInstance().getClient();
      
      const luaScript = `
        local key = KEYS[1]
        local windowStart = tonumber(ARGV[1])
        
        local entries = redis.call('ZREVRANGE', key, 0, 0, 'WITHSCORES')
        if #entries > 0 then
          redis.call('ZREM', key, entries[1])
        end
        
        return redis.call('ZCARD', key)
      `;
      
      const windowStart = Date.now() - rule.windowMs;
      await redis.eval(luaScript, 1, key, windowStart.toString());
    } catch (error) {
      console.error('Error reverting rate limit:', error);
    }
  }

  private async queueRevertJob(identifier: string, rule: RateLimitRule): Promise<void> {
    const message: QueueMessage = {
      type: 'RESET',
      key: HeadersUtil.generateRateLimitKey(identifier, rule),
      rule,
      timestamp: Date.now(),
      metadata: { operation: 'revert_increment' }
    };

    await this.queueService.addRateLimitJob(message);
  }
}