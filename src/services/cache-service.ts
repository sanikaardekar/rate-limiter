import { RedisService } from './redis-service';
import { RateLimitRule, CacheEntry, RateLimitResult, RateLimitInfo } from '../types';
import { CircuitBreaker } from '../utils/circuit-breaker';

export class CacheService {
  private redisService: RedisService;
  private localCache: Map<string, CacheEntry> = new Map();
  private localCacheTTL: number = parseInt(process.env.LOCAL_CACHE_TTL || '60000');
  private enableInMemoryFallback: boolean = false;
  private circuitBreaker: CircuitBreaker;

  constructor(enableInMemoryFallback: boolean = false) {
    this.redisService = RedisService.getInstance();
    this.enableInMemoryFallback = enableInMemoryFallback;
    this.circuitBreaker = new CircuitBreaker();
    this.startLocalCacheCleanup();
  }

  async checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    return this.circuitBreaker.execute(
      async () => {
        const data = await this.redisService.slidingWindowCheck(key, rule, true);
        return this.buildResult(data, rule, data.allowed);
      },
      async () => {
        console.error(`[ERROR] Redis failed for key=${key}, rule=${rule.id} - using fallback`);
        const { HeadersUtil } = require('../utils/headers');
        HeadersUtil.logError('redis', new Error('Circuit breaker open'), { operation: 'checkRateLimit', key, rule: rule.id });
        
        if (this.enableInMemoryFallback) {
          return this.checkRateLimitInMemory(key, rule);
        }
        return this.buildDefaultResult(rule, true);
      }
    );
  }

  async getCurrentCount(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    try {
      const data = await this.redisService.slidingWindowCheck(key, rule, false);
      return this.buildResult(data, rule, data.allowed);
    } catch (error) {
      console.error('Error getting current count:', error);
      return this.buildDefaultResult(rule, true);
    }
  }

  private buildResult(data: CacheEntry, rule: RateLimitRule, allowed: boolean): RateLimitResult {
    const remaining = Math.max(0, rule.maxRequests - data.count);
    const retryAfter = allowed ? undefined : Math.ceil((data.resetTime - Date.now()) / 1000);

    const info: RateLimitInfo = {
      totalRequests: data.count,
      remainingRequests: remaining,
      resetTime: data.resetTime,
      retryAfter
    };

    return { allowed, info, rule };
  }

  private buildDefaultResult(rule: RateLimitRule, allowed: boolean): RateLimitResult {
    const now = Date.now();
    const resetTime = now + rule.windowMs;
    
    const info: RateLimitInfo = {
      totalRequests: 0,
      remainingRequests: rule.maxRequests,
      resetTime,
      retryAfter: allowed ? undefined : Math.ceil(rule.windowMs / 1000)
    };

    return { allowed, info, rule };
  }

  private startLocalCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.localCache.entries()) {
        if (now > entry.resetTime) {
          this.localCache.delete(key);
        }
      }
    }, this.localCacheTTL);
  }

  async getRateLimitStats(keyPattern: string): Promise<Map<string, CacheEntry>> {
    const stats = new Map<string, CacheEntry>();
    
    try {
      const redis = await this.redisService.getClient();
      const keys = await redis.keys(keyPattern);
      
      for (const key of keys) {
        const data = await this.redisService.getRateLimitData(key);
        if (data) {
          stats.set(key, data);
        }
      }
    } catch (error) {
      console.error('Error getting rate limit stats:', error);
    }

    return stats;
  }

  async resetRateLimit(key: string): Promise<void> {
    try {
      const redis = await this.redisService.getClient();
      await redis.del(key);
      this.localCache.delete(key);
    } catch (error) {
      console.error('Error resetting rate limit:', error);
    }
  }

  getLocalCacheSize(): number {
    return this.localCache.size;
  }

  clearLocalCache(): void {
    this.localCache.clear();
  }

  private checkRateLimitInMemory(key: string, rule: RateLimitRule): RateLimitResult {
    const now = Date.now();
    const existing = this.localCache.get(key);
    
    let data: CacheEntry;
    if (!existing || now >= existing.resetTime) {
      const resetTime = rule.algorithm === 'sliding' 
        ? now + rule.windowMs 
        : Math.floor(now / rule.windowMs) * rule.windowMs + rule.windowMs;
      data = { count: 1, resetTime, createdAt: now };
    } else {
      data = { ...existing, count: existing.count + 1 };
    }
    
    this.localCache.set(key, data);
    const allowed = data.count <= rule.maxRequests;
    return this.buildResult(data, rule, allowed);
  }
}