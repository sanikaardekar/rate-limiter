export interface RateLimitRule {
  id: string;
  windowMs: number;
  maxRequests: number; 
  keyGenerator?: (req: any) => string; 
  skipIf?: (req: any) => boolean; 
  message?: string; 
  statusCode?: number;
  algorithm?: 'fixed' | 'sliding';
}

export interface RateLimitInfo {
  totalRequests: number;
  remainingRequests: number;
  resetTime: number;
  retryAfter?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  info: RateLimitInfo;
  rule: RateLimitRule;
}

export interface CacheEntry {
  count: number;
  resetTime: number;
  createdAt: number;
}

export interface QueueMessage {
  type: 'INCREMENT' | 'RESET' | 'CLEANUP';
  key: string;
  rule: RateLimitRule;
  timestamp: number;
  metadata?: any;
}

export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  'X-RateLimit-RetryAfter'?: string;
}

export enum RateLimitStrategy {
  FIXED_WINDOW = 'fixed_window',
  SLIDING_WINDOW = 'sliding_window',
}