import Redis from 'ioredis';
import { RateLimitRule, CacheEntry } from '../types';

export class RedisService {
  private redis: Redis;
  private static instance: RedisService;

  private constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
  }

  static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  async getRateLimitData(key: string): Promise<CacheEntry | null> {
    try {
      const data = await this.redis.get(key);
      if (!data) return null;
      
      try {
        return JSON.parse(data);
      } catch (parseError) {
        console.error('JSON parse error for key:', key, 'data:', data);
        return null;
      }
    } catch (error) {
      console.error('Error getting rate limit data:', error);
      return null;
    }
  }

  async setRateLimitData(key: string, data: CacheEntry, ttl: number): Promise<void> {
    try {
      await this.redis.setex(key, Math.ceil(ttl / 1000), JSON.stringify(data));
    } catch (error) {
      console.error('Error setting rate limit data:', error);
    }
  }

  async incrementCounter(key: string, rule: RateLimitRule): Promise<CacheEntry> {
    const algorithm = rule.algorithm || 'sliding'; 
    
    if (algorithm === 'fixed') {
      return await this.incrementCounterFixedWindow(key, rule);
    } else {
      return await this.incrementCounterSlidingWindow(key, rule);
    }
  }

  private async incrementCounterSlidingWindow(key: string, rule: RateLimitRule): Promise<CacheEntry> {
    const now = Date.now();
    const windowStart = now - rule.windowMs;
    const resetTime = now + rule.windowMs;

    try {
      const luaScript = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local windowStart = tonumber(ARGV[2])
        local maxRequests = tonumber(ARGV[3])
        local resetTime = tonumber(ARGV[4])
        local requestId = ARGV[5]

        -- Remove expired entries
        redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)

        -- Count current requests in window
        local currentCount = redis.call('ZCARD', key)

        -- Add current request
        redis.call('ZADD', key, now, requestId)
        redis.call('EXPIRE', key, math.ceil(resetTime / 1000))

        local newCount = currentCount + 1

        return cjson.encode({
          count = newCount,
          resetTime = resetTime,
          createdAt = now
        })
      `;

      const requestId = `${now}-${Math.random()}`;
      const result = await this.redis.eval(
        luaScript,
        1,
        key,
        now.toString(),
        windowStart.toString(),
        rule.maxRequests.toString(),
        resetTime.toString(),
        requestId
      ) as string;

      return JSON.parse(result);
    } catch (error) {
      console.error('Error with sliding window, falling back to fixed window:', error);
      return this.incrementCounterFixedWindow(key, rule);
    }
  }

  private async incrementCounterFixedWindow(key: string, rule: RateLimitRule): Promise<CacheEntry> {
    const now = Date.now();
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    const resetTime = windowStart + rule.windowMs;

    try {
      const luaScript = `
        local key = KEYS[1]
        local windowStart = tonumber(ARGV[1])
        local resetTime = tonumber(ARGV[2])
        local maxRequests = tonumber(ARGV[3])
        local now = tonumber(ARGV[4])

        local current = redis.call('GET', key)
        local data = current and cjson.decode(current) or {count = 0, resetTime = resetTime, createdAt = now}

        -- Reset if window has passed
        if now >= data.resetTime then
          data = {count = 1, resetTime = resetTime, createdAt = now}
        else
          data.count = data.count + 1
        end

        local ttl = math.ceil((data.resetTime - now) / 1000)
        redis.call('SETEX', key, ttl, cjson.encode(data))

        return cjson.encode(data)
      `;

      const result = await this.redis.eval(
        luaScript,
        1,
        key,
        windowStart.toString(),
        resetTime.toString(),
        rule.maxRequests.toString(),
        now.toString()
      ) as string;

      return JSON.parse(result);
    } catch (error) {
      console.error('Error incrementing counter:', error);
      return this.incrementCounterFallback(key, rule);
    }
  }

  private async incrementCounterFallback(key: string, rule: RateLimitRule): Promise<CacheEntry> {
    const now = Date.now();
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    const resetTime = windowStart + rule.windowMs;

    const existing = await this.getRateLimitData(key);
    
    let data: CacheEntry;
    if (!existing || now >= existing.resetTime) {
      data = { count: 1, resetTime, createdAt: now };
    } else {
      data = { ...existing, count: existing.count + 1 };
    }

    const ttl = data.resetTime - now;
    await this.setRateLimitData(key, data, ttl);
    
    return data;
  }

  async cleanupExpiredKeys(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;

      const pipeline = this.redis.pipeline();
      keys.forEach(key => pipeline.del(key));
      
      const results = await pipeline.exec();
      return results?.length || 0;
    } catch (error) {
      console.error('Error cleaning up expired keys:', error);
      return 0;
    }
  }

  async getClient(): Promise<Redis> {
    return this.redis;
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}