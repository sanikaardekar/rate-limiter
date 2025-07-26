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
        const parsed = JSON.parse(data);
        if (typeof parsed === 'object' && parsed !== null && 
            typeof parsed.count === 'number' && typeof parsed.resetTime === 'number') {
          return parsed;
        }
        return null;
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

  async getCurrentCount(key: string, rule: RateLimitRule): Promise<CacheEntry> {
    const algorithm = rule.algorithm || 'sliding';
    
    if (algorithm === 'fixed') {
      return await this.getCurrentCountFixedWindow(key, rule);
    } else {
      return await this.getCurrentCountSlidingWindow(key, rule);
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

  private async getCurrentCountSlidingWindow(key: string, rule: RateLimitRule): Promise<CacheEntry> {
    const now = Date.now();
    const windowStart = now - rule.windowMs;
    const resetTime = now + rule.windowMs;

    try {
      const luaScript = `
        local key = KEYS[1]
        local windowStart = tonumber(ARGV[1])
        local resetTime = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local windowMs = tonumber(ARGV[4])

        redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
        local currentCount = redis.call('ZCARD', key)

        if currentCount > 0 then
          redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
        end

        return cjson.encode({
          count = currentCount,
          resetTime = resetTime,
          createdAt = now
        })
      `;

      const result = await this.redis.eval(
        luaScript,
        1,
        key,
        windowStart.toString(),
        resetTime.toString(),
        now.toString(),
        rule.windowMs.toString()
      ) as string;

      return JSON.parse(result);
    } catch (error) {
      const { HeadersUtil } = require('../utils/headers');
      HeadersUtil.logError('redis', error as Error, { operation: 'getCurrentCountSlidingWindow', key, rule: rule.id });
      return this.getCurrentCountFixedWindow(key, rule);
    }
  }

  private async getCurrentCountFixedWindow(key: string, rule: RateLimitRule): Promise<CacheEntry> {
    const now = Date.now();
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    const resetTime = windowStart + rule.windowMs;

    const existing = await this.getRateLimitData(key);
    
    if (!existing || now >= existing.resetTime) {
      return { count: 0, resetTime, createdAt: now };
    } else {
      return existing;
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
        local windowMs = tonumber(ARGV[6])

        redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
        local currentCount = redis.call('ZCARD', key)
        
        if currentCount >= maxRequests then
          redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
          return cjson.encode({
            count = currentCount,
            resetTime = resetTime,
            createdAt = now,
            allowed = false
          })
        end
        
        local addResult = redis.call('ZADD', key, now, requestId)
        local finalCount = redis.call('ZCARD', key)
        
        if finalCount > maxRequests then
          redis.call('ZREM', key, requestId)
          finalCount = redis.call('ZCARD', key)
          redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
          return cjson.encode({
            count = finalCount,
            resetTime = resetTime,
            createdAt = now,
            allowed = false
          })
        end
        
        redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
        return cjson.encode({
          count = finalCount,
          resetTime = resetTime,
          createdAt = now,
          allowed = true
        })
      `;

      const requestId = `${now}-${Math.random().toString(36).substr(2, 9)}`;
      const result = await this.redis.eval(
        luaScript,
        1,
        key,
        now.toString(),
        windowStart.toString(),
        rule.maxRequests.toString(),
        resetTime.toString(),
        requestId,
        rule.windowMs.toString()
      ) as string;

      return JSON.parse(result);
    } catch (error) {
      const { HeadersUtil } = require('../utils/headers');
      HeadersUtil.logError('redis', error as Error, { operation: 'incrementCounterSlidingWindow', key, rule: rule.id });
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
          data = {count = 0, resetTime = resetTime, createdAt = now}
        end

        -- Check limit before incrementing
        if data.count >= maxRequests then
          local ttl = math.ceil((data.resetTime - now) / 1000)
          redis.call('SETEX', key, ttl, cjson.encode(data))
          return cjson.encode({
            count = data.count,
            resetTime = data.resetTime,
            createdAt = data.createdAt,
            allowed = false
          })
        end

        -- Increment counter
        data.count = data.count + 1
        local ttl = math.ceil((data.resetTime - now) / 1000)
        redis.call('SETEX', key, ttl, cjson.encode(data))

        return cjson.encode({
          count = data.count,
          resetTime = data.resetTime,
          createdAt = data.createdAt,
          allowed = true
        })
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

  async slidingWindowCheck(key: string, rule: RateLimitRule, increment: boolean = false): Promise<CacheEntry & { allowed: boolean }> {
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
        local increment = ARGV[5] == 'true'
        local requestId = ARGV[6]
        local windowMs = tonumber(ARGV[7])

        redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
        local currentCount = redis.call('ZCARD', key)
        
        local allowed = currentCount < maxRequests
        local finalCount = currentCount
        
        if increment and allowed then
          redis.call('ZADD', key, now, requestId)
          finalCount = currentCount + 1
        end
        
        if finalCount > 0 then
          redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
        end
        
        return cjson.encode({
          count = finalCount,
          resetTime = resetTime,
          createdAt = now,
          allowed = allowed
        })
      `;

      const requestId = increment ? `${now}-${Math.random().toString(36).substr(2, 9)}` : '';
      const result = await this.redis.eval(
        luaScript,
        1,
        key,
        now.toString(),
        windowStart.toString(),
        rule.maxRequests.toString(),
        resetTime.toString(),
        increment.toString(),
        requestId,
        rule.windowMs.toString()
      ) as string;

      return JSON.parse(result);
    } catch (error) {
      const { HeadersUtil } = require('../utils/headers');
      HeadersUtil.logError('redis', error as Error, { operation: 'slidingWindowCheck', key, rule: rule.id, increment });
      if (increment) {
        const result = await this.incrementCounterFixedWindow(key, rule);
        return { 
          ...result, 
          allowed: typeof result.allowed === 'boolean' ? result.allowed : (result.count || 0) <= rule.maxRequests 
        };
      } else {
        const result = await this.getCurrentCountFixedWindow(key, rule);
        return { ...result, allowed: result.count < rule.maxRequests };
      }
    }
  }

  async getClient(): Promise<Redis> {
    return this.redis;
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  async revertIncrement(key: string, rule: RateLimitRule): Promise<void> {
    const now = Date.now();
    const windowStart = now - rule.windowMs;

    try {
      const luaScript = `
        local key = KEYS[1]
        local windowStart = tonumber(ARGV[1])
        local windowMs = tonumber(ARGV[2])
        
        local entries = redis.call('ZREVRANGE', key, 0, 0, 'WITHSCORES')
        if #entries > 0 then
          redis.call('ZREM', key, entries[1])
        end
        
        redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
        local count = redis.call('ZCARD', key)
        if count > 0 then
          redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
        end
        
        return count
      `;

      await this.redis.eval(
        luaScript,
        1,
        key,
        windowStart.toString(),
        rule.windowMs.toString()
      );
    } catch (error) {
      const { HeadersUtil } = require('../utils/headers');
      HeadersUtil.logError('redis', error as Error, { operation: 'revertIncrement', key, rule: rule.id });
    }
  }
}