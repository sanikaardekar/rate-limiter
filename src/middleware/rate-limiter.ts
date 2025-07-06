import { Request, Response, NextFunction } from 'express';
import { CacheService } from '../services/cache-service';
import { QueueService } from '../services/queue-service';
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
}

export class RateLimiterMiddleware {
  private cacheService: CacheService;
  private queueService: QueueService;
  private options: Required<RateLimiterOptions>;

  constructor(options: RateLimiterOptions) {
    this.cacheService = new CacheService();
    this.queueService = new QueueService();
    
    this.options = {
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (req: Request) => HeadersUtil.getClientIdentifier(req),
      onLimitReached: this.defaultOnLimitReached,
      standardHeaders: true,
      legacyHeaders: true,
      ...options,
    };
  }

  middleware = () => {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const results = await Promise.all(
          this.options.rules.map(rule => this.checkRule(req, rule))
        );

        const blockedResult = results.find(result => !result.allowed);
        const finalResult = blockedResult || results.reduce((most, current) => 
          current.info.remainingRequests < most.info.remainingRequests ? current : most
        );

        if (!finalResult) {
          return next();
        }

        if (this.options.legacyHeaders) {
          HeadersUtil.setRateLimitHeaders(res, finalResult);
        }

        if (this.options.standardHeaders) {
          this.setStandardHeaders(res, finalResult);
        }

        HeadersUtil.addSecurityHeaders(res);

        const identifier = this.options.keyGenerator(req);
        const metadata = HeadersUtil.getRequestMetadata(req);
        HeadersUtil.logRateLimitEvent(identifier, finalResult.rule, finalResult, metadata);

        if (!finalResult.allowed) {
          await this.queueCleanupJob(identifier, finalResult.rule);
          return this.options.onLimitReached(req, res, finalResult);
        }

        await this.queueIncrementJob(identifier, finalResult.rule);
        next();
      } catch (error) {
        console.error('Rate limiter middleware error:', error);
        next();
      }
    };
  };

  private async checkRule(req: Request, rule: RateLimitRule) {
    if (rule.skipIf && rule.skipIf(req)) {
      return this.createAllowedResult(rule);
    }

    const identifier = rule.keyGenerator ? rule.keyGenerator(req) : this.options.keyGenerator(req);
    const key = HeadersUtil.generateRateLimitKey(identifier, rule);

    return await this.cacheService.checkRateLimit(key, rule);
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
    
    if (result.info.retryAfter) {
      res.setHeader('Retry-After', result.info.retryAfter);
    }
  }

  private defaultOnLimitReached = (req: Request, res: Response, result: any) => {
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
  }
}