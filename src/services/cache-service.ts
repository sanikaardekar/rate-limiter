import { RedisService } from './redis-service';
import { RateLimitRule, CacheEntry, RateLimitResult, RateLimitInfo } from '../types';

export class CacheService {
  private redisService: RedisService;
  private localCache: Map<string, CacheEntry> = new Map();
  private localCacheTTL: number = 60000; 

  constructor() {
    this.redisService = RedisService.getInstance();
    this.startLocalCacheCleanup();
  }

  async checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    try {
      const localData = this.getFromLocalCache(key);
      if (localData && Date.now() < localData.resetTime) {
        const allowed = localData.count <= rule.maxRequests;
        return this.buildResult(localData, rule, allowed);
      }

      const data = await this.redisService.incrementCounter(key, rule);
      
      this.setInLocalCache(key, data);

      const allowed = data.count <= rule.maxRequests;
      return this.buildResult(data, rule, allowed);
    } catch (error) {
      console.error('Error checking rate limit:', error);
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

  private getFromLocalCache(key: string): CacheEntry | null {
    const entry = this.localCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.resetTime) {
      this.localCache.delete(key);
      return null;
    }

    return entry;
  }

  private setInLocalCache(key: string, data: CacheEntry): void {
    const timeToExpire = data.resetTime - Date.now();
    if (timeToExpire > this.localCacheTTL / 2) {
      this.localCache.set(key, data);
    }
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
}