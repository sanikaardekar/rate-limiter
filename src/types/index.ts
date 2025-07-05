export interface RateLimitRule {
  id: string;
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: any) => string; // Custom key generator
  skipIf?: (req: any) => boolean; // Skip condition
  message?: string; // Custom error message
  statusCode?: number; // Custom status code
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
  TOKEN_BUCKET = 'token_bucket',
  LEAKY_BUCKET = 'leaky_bucket'
}