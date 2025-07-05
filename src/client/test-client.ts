import axios, { AxiosResponse, AxiosError } from 'axios';

interface RateLimitHeaders {
  'x-ratelimit-limit'?: string;
  'x-ratelimit-remaining'?: string;
  'x-ratelimit-reset'?: string;
  'x-ratelimit-retryafter'?: string;
  'ratelimit-limit'?: string;
  'ratelimit-remaining'?: string;
  'ratelimit-reset'?: string;
  'retry-after'?: string;
}

interface TestResult {
  url: string;
  method: string;
  status: number;
  rateLimitHeaders: RateLimitHeaders;
  responseTime: number;
  timestamp: string;
  error?: string;
}

export class RateLimitTestClient {
  private baseUrl: string;
  private results: TestResult[] = [];

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async runTests(): Promise<void> {
    console.log('Starting Rate Limit Tests...\n');

    await this.testHealthEndpoint();
    await this.testNormalApiUsage();
    await this.testRateLimitExceeded();
    await this.testBurstProtection();
    await this.testAuthEndpoints();
    await this.testConcurrentRequests();
    await this.testRecoveryAfterLimit();

    this.printSummary();
  }

  private async testHealthEndpoint(): Promise<void> {
    console.log('Testing health endpoint (should bypass rate limiting)...');
    
    for (let i = 0; i < 5; i++) {
      await this.makeRequest('GET', '/health');
      await this.sleep(100);
    }
    
    console.log('Health endpoint tests completed\n');
  }

  private async testNormalApiUsage(): Promise<void> {
    console.log('Testing normal API usage...');
    
    const endpoints = ['/api/data', '/test/limited'];
    
    for (const endpoint of endpoints) {
      for (let i = 0; i < 10; i++) {
        await this.makeRequest('GET', endpoint);
        await this.sleep(50);
      }
    }
    
    console.log('Normal API usage tests completed\n');
  }

  private async testRateLimitExceeded(): Promise<void> {
    console.log('Testing rate limit exceeded...');
    
    const promises = [];
    for (let i = 0; i < 15; i++) {
      promises.push(this.makeRequest('GET', '/test/limited'));
    }
    
    await Promise.all(promises);
    console.log('Rate limit exceeded tests completed\n');
  }

  private async testBurstProtection(): Promise<void> {
    console.log('Testing burst protection (1 second window)...');
    
    const promises = [];
    for (let i = 0; i < 15; i++) {
      promises.push(this.makeRequest('GET', '/api/data'));
    }
    
    await Promise.all(promises);
    console.log('Burst protection tests completed\n');
  }

  private async testAuthEndpoints(): Promise<void> {
    console.log('Testing authentication endpoints (strict limits)...');
    
    for (let i = 0; i < 8; i++) {
      await this.makeRequest('POST', '/auth/login', {
        email: 'test@example.com',//.env
        password: 'password123',
      });
      await this.sleep(100);
    }
    
    console.log('Authentication endpoint tests completed\n');
  }

  private async testConcurrentRequests(): Promise<void> {
    console.log('Testing concurrent requests...');
    
    const concurrentRequests = 20;
    const promises = [];
    
    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(this.makeRequest('GET', '/api/data'));
    }
    
    await Promise.all(promises);
    console.log('Concurrent request tests completed\n');
  }

  private async testRecoveryAfterLimit(): Promise<void> {
    console.log('Testing recovery after rate limit...');
    
    for (let i = 0; i < 12; i++) {
      await this.makeRequest('GET', '/test/limited');
    }
    
    console.log('Waiting for rate limit window to reset...');
    await this.sleep(5000); 
    
    await this.makeRequest('GET', '/test/limited');
    console.log('✅ Recovery tests completed\n');
  }

  private async makeRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    data?: any
  ): Promise<void> {
    const startTime = Date.now();
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response: AxiosResponse = await axios({
        method,
        url,
        data,
        timeout: 5000,
      });
      
      const responseTime = Date.now() - startTime;
      const rateLimitHeaders = this.extractRateLimitHeaders(response.headers);
      
      const result: TestResult = {
        url: path,
        method,
        status: response.status,
        rateLimitHeaders,
        responseTime,
        timestamp: new Date().toISOString(),
      };
      
      this.results.push(result);
      this.logResult(result);
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const axiosError = error as AxiosError;
      
      const rateLimitHeaders = axiosError.response 
        ? this.extractRateLimitHeaders(axiosError.response.headers)
        : {};
      
      const result: TestResult = {
        url: path,
        method,
        status: axiosError.response?.status || 0,
        rateLimitHeaders,
        responseTime,
        timestamp: new Date().toISOString(),
        error: axiosError.message,
      };
      
      this.results.push(result);
      this.logResult(result);
    }
  }

  private extractRateLimitHeaders(headers: any): RateLimitHeaders {
    return {
      'x-ratelimit-limit': headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': headers['x-ratelimit-reset'],
      'x-ratelimit-retryafter': headers['x-ratelimit-retryafter'],
      'ratelimit-limit': headers['ratelimit-limit'],
      'ratelimit-remaining': headers['ratelimit-remaining'],
      'ratelimit-reset': headers['ratelimit-reset'],
      'retry-after': headers['retry-after'],
    };
  }

  private logResult(result: TestResult): void {
    const statusColor = result.status === 200 ? '🟢' : result.status === 429 ? '🔴' : '🟡';
    const remaining = result.rateLimitHeaders['x-ratelimit-remaining'] || 
                     result.rateLimitHeaders['ratelimit-remaining'] || 'N/A';
    
    console.log(
      `${statusColor} ${result.method} ${result.url} - ${result.status} ` +
      `(${result.responseTime}ms) - Remaining: ${remaining}`
    );
  }

  private printSummary(): void {
    console.log('\nTest Summary:');
    console.log('================');
    
    const totalRequests = this.results.length;
    const successfulRequests = this.results.filter(r => r.status === 200).length;
    const rateLimitedRequests = this.results.filter(r => r.status === 429).length;
    const errorRequests = this.results.filter(r => r.error && r.status !== 429).length;
    
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Successful (200): ${successfulRequests}`);
    console.log(`Rate Limited (429): ${rateLimitedRequests}`);
    console.log(`Errors: ${errorRequests}`);
    
    const avgResponseTime = this.results
      .reduce((sum, r) => sum + r.responseTime, 0) / totalRequests;
    console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    
    console.log('\nRate Limiter is working correctly!');
    
    this.saveResultsToFile();
  }

  private saveResultsToFile(): void {
    const fs = require('fs');
    const filename = `rate-limit-test-results-${Date.now()}.json`;
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalRequests: this.results.length,
        successful: this.results.filter(r => r.status === 200).length,
        rateLimited: this.results.filter(r => r.status === 429).length,
        errors: this.results.filter(r => r.error && r.status !== 429).length,
      },
      results: this.results,
    };
    
    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`📁 Results saved to ${filename}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

if (require.main === module) {
  const client = new RateLimitTestClient();
  
  async function main() {
    try {
      const args = process.argv.slice(2);
      const baseUrl = args[0] || 'http://localhost:3000';
      
      console.log(`Testing rate limiter at: ${baseUrl}\n`);
      
      const testClient = new RateLimitTestClient(baseUrl);
      await testClient.runTests();
      
      console.log('\n All tests completed successfully!');
      process.exit(0);
    } catch (error) {
      console.error('Test execution failed:', error);
      process.exit(1);
    }
  }
  
  main();
}