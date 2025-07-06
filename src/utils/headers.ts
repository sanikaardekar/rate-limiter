import { Response } from 'express';
import { RateLimitResult, RateLimitHeaders, RateLimitRule } from '../types';

export class HeadersUtil {
  static setRateLimitHeaders(res: Response, result: RateLimitResult): void {
    const headers = this.buildRateLimitHeaders(result);
    
    Object.entries(headers).forEach(([key, value]) => {
      if (value !== undefined) {
        res.setHeader(key, value);
      }
    });
  }

  static buildRateLimitHeaders(result: RateLimitResult): RateLimitHeaders {
    const { info, rule } = result;
    
    const headers: RateLimitHeaders = {
      'X-RateLimit-Limit': rule.maxRequests.toString(),
      'X-RateLimit-Remaining': info.remainingRequests.toString(),
      'X-RateLimit-Reset': Math.ceil(info.resetTime / 1000).toString(),
      'RateLimit-Limit': rule.maxRequests.toString(),
      'RateLimit-Remaining': info.remainingRequests.toString(),
      'RateLimit-Reset': Math.ceil(info.resetTime / 1000).toString(),
    };

    if (info.retryAfter !== undefined) {
      headers['X-RateLimit-RetryAfter'] = info.retryAfter.toString();
      headers['Retry-After'] = info.retryAfter.toString();
    }

    return headers;
  }

  static getClientIdentifier(req: any): string {
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const clientIp = req.headers['x-client-ip'];
    const cfConnectingIp = req.headers['cf-connecting-ip'];
    
    let ip: string;
    
    if (forwarded) {
      ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    } else if (realIp) {
      ip = Array.isArray(realIp) ? realIp[0] : realIp;
    } else if (clientIp) {
      ip = Array.isArray(clientIp) ? clientIp[0] : clientIp;
    } else if (cfConnectingIp) {
      ip = Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
    } else {
      ip = req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || 'unknown';
    }

    return ip.trim();
  }

  static generateRateLimitKey(identifier: string, rule: RateLimitRule): string {
    return `rate_limit:${rule.id}:${identifier}`;
  }

  static getUserAgent(req: any): string {
    return req.headers['user-agent'] || 'unknown';
  }

  static getRequestMetadata(req: any): any {
    return {
      method: req.method,
      url: req.url,
      userAgent: this.getUserAgent(req),
      timestamp: Date.now(),
      headers: {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip'],
        'authorization': req.headers['authorization'] ? '[REDACTED]' : undefined,
      },
    };
  }

  static isValidHttpMethod(method: string): boolean {
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
    return validMethods.includes(method.toUpperCase());
  }

  static sanitizeHeaderValue(value: string): string {
    return value.replace(/[\r\n\t]/g, '').substring(0, 100);
  }

  static addSecurityHeaders(res: Response): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  static logRateLimitEvent(
    identifier: string,
    rule: RateLimitRule,
    result: RateLimitResult,
    metadata: any
  ): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[RateLimit] ${identifier} - Rule: ${rule.id}, Allowed: ${result.allowed}, Remaining: ${result.info.remainingRequests}`);
    }
  }
}