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
      ip = this.sanitizeIpAddress(ip.trim());
    } else if (realIp) {
      ip = Array.isArray(realIp) ? realIp[0] : realIp;
      ip = this.sanitizeIpAddress(ip.trim());
    } else if (clientIp) {
      ip = Array.isArray(clientIp) ? clientIp[0] : clientIp;
      ip = this.sanitizeIpAddress(ip.trim());
    } else if (cfConnectingIp) {
      ip = Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
      ip = this.sanitizeIpAddress(ip.trim());
    } else {
      ip = req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || 'unknown';
      ip = this.sanitizeIpAddress(ip);
      // Don't include port for localhost connections to avoid each request being treated as different client
      if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
        return ip;
      }
      const port = req.connection?.remotePort || '';
      return port ? `${ip}:${port}` : ip;
    }
    
    return ip;
  }

  private static sanitizeIpAddress(ip: string): string {
    const sanitized = ip.replace(/[\r\n\t\x00-\x1f\x7f-\x9f]/g, '').substring(0, 45);
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
    
    if (ipv4Regex.test(sanitized) || ipv6Regex.test(sanitized)) {
      return sanitized;
    }
    
    return sanitized || 'unknown';
  }

  static generateRateLimitKey(identifier: string, rule: RateLimitRule): string {
    const sanitizedId = identifier.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ruleHash = this.hashString(rule.id + rule.windowMs + rule.maxRequests);
    return `rl:${rule.id}:${ruleHash}:${sanitizedId}`;
  }

  private static hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
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
    const logData = {
      timestamp: new Date().toISOString(),
      level: result.allowed ? 'info' : 'warn',
      event: 'rate_limit_check',
      identifier,
      rule: {
        id: rule.id,
        limit: rule.maxRequests,
        window: rule.windowMs
      },
      result: {
        allowed: result.allowed,
        remaining: result.info.remainingRequests,
        resetTime: result.info.resetTime
      },
      request: {
        method: metadata.method,
        url: metadata.url,
        userAgent: metadata.userAgent
      }
    };
    
    if (result.allowed) {
      console.log(JSON.stringify(logData));
    } else {
      console.warn(JSON.stringify(logData));
    }
  }

  static logError(type: 'redis' | 'increment' | 'rule', error: Error, context?: any): void {
    const logData = {
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'rate_limit_error',
      errorType: type,
      message: error.message,
      stack: error.stack,
      context
    };
    
    console.error(JSON.stringify(logData));
  }
}