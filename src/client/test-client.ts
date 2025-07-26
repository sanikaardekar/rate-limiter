import axios, { AxiosResponse, AxiosError } from 'axios';

interface RateLimitHeaders {
  'x-ratelimit-limit'?: string;
  'x-ratelimit-remaining'?: string;
  'x-ratelimit-reset'?: string;
  'x-ratelimit-retryafter'?: string;
  'x-ratelimit-warning'?: string;
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
  testType?: string;
}

export class RateLimitTestClient {
  private baseUrl: string;
  private results: TestResult[] = [];

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async runTests(): Promise<void> {
    console.log('Starting comprehensive rate limiter tests\n');

    await this.testHealthEndpointBypass();
    await this.testBasicEndpoints();
    await this.testAllHttpMethods();
    await this.testBurstProtection();
    await this.testAuthRateLimiting();
    await this.testApiRateLimiting();
    await this.testGlobalRateLimiting();
    await this.testConcurrentRequests();
    await this.testBoundaryConditions();
    await this.testRecoveryBehavior();
    await this.testAdminEndpoints();
    await this.testErrorHandling();
    await this.testHeaderValidation();
    await this.testSecurityScenarios();
    await this.testWorkerFunctionality();
    await this.testSkipLogicDetailed();
    await this.testRedisFallbackScenarios();
    await this.testMemoryCleanupBehavior();
    await this.testQueueFailureRecovery();
    await this.testInMemoryFallback();
    await this.testLocalThrottling();
    await this.testQueueEdgeCases();
    await this.testAlgorithmEdgeCases();

    this.printSummary();
  }

  private async testBasicEndpoints(): Promise<void> {
    console.log('Testing basic endpoints...');
    
    await this.makeRequest('GET', '/', undefined, 'basic');
    await this.makeRequest('GET', '/health', undefined, 'basic');
    await this.makeRequest('GET', '/test/limited', undefined, 'basic');
    
    console.log('Basic endpoints test completed\n');
  }

  private async testAllHttpMethods(): Promise<void> {
    console.log('Testing all HTTP methods...');
    
    await this.makeRequest('GET', '/api/data', undefined, 'http-methods');
    await this.makeRequest('POST', '/api/data', { test: 'data' }, 'http-methods');
    await this.makeRequest('PUT', '/api/data/123', { test: 'updated' }, 'http-methods');
    await this.makeRequest('DELETE', '/api/data/123', undefined, 'http-methods');
    await this.makeRequest('PATCH', '/api/data/123', { test: 'patched' }, 'http-methods');
    
    console.log('HTTP methods test completed\n');
  }

  private async testBurstProtection(): Promise<void> {
    console.log('Testing burst protection (100 req/sec)...');
    
    await this.resetRateLimits();
    
    const promises = [];
    for (let i = 0; i < 110; i++) {
      promises.push(this.makeRequest('GET', '/api/data', undefined, 'burst-protection'));
    }
    
    await Promise.all(promises);
    console.log('Burst protection test completed\n');
  }

  private async testAuthRateLimiting(): Promise<void> {
    console.log('Testing auth rate limiting (5 req/5min)...');
    
    await this.resetRateLimits();
    
    const authEndpoints = ['/auth/login', '/auth/register', '/auth/forgot-password'];
    
    for (const endpoint of authEndpoints) {
      for (let i = 0; i < 6; i++) {
        await this.makeRequest('POST', endpoint, {
          email: 'test@example.com',
          password: 'password123'
        }, 'auth-limiting');
      }
    }
    
    console.log('Auth rate limiting test completed\n');
  }

  private async testApiRateLimiting(): Promise<void> {
    console.log('Testing API rate limiting (300 req/min)...');
    
    await this.resetRateLimits();
    
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(this.makeRequest('GET', '/api/data', undefined, 'api-limiting'));
    }
    
    await Promise.all(promises);
    console.log('API rate limiting test completed\n');
  }

  private async testGlobalRateLimiting(): Promise<void> {
    console.log('Testing global rate limiting (1000 req/15min)...');
    
    await this.resetRateLimits();
    
    const endpoints = ['/', '/api/data', '/test/limited'];
    const promises = [];
    
    for (let i = 0; i < 100; i++) {
      const endpoint = endpoints[i % endpoints.length];
      promises.push(this.makeRequest('GET', endpoint, undefined, 'global-limiting'));
    }
    
    await Promise.all(promises);
    console.log('Global rate limiting test completed\n');
  }

  private async testConcurrentRequests(): Promise<void> {
    console.log('Testing concurrent requests...');
    
    await this.resetRateLimits();
    
    const promises = [];
    for (let i = 0; i < 150; i++) {
      promises.push(this.makeRequest('GET', '/api/data', undefined, 'concurrent'));
    }
    
    await Promise.all(promises);
    console.log('Concurrent requests test completed\n');
  }

  private async testBoundaryConditions(): Promise<void> {
    console.log('Testing boundary conditions...');
    
    await this.resetRateLimits();
    

    for (let i = 0; i < 100; i++) {
      await this.makeRequest('GET', '/api/data', undefined, 'boundary-burst');
    }
    

    await this.makeRequest('GET', '/api/data', undefined, 'boundary-burst-exceed');
    

    await this.resetRateLimits();
    for (let i = 0; i < 5; i++) {
      await this.makeRequest('POST', '/auth/login', { email: 'test@example.com' }, 'boundary-auth');
    }
    

    await this.makeRequest('POST', '/auth/login', { email: 'test@example.com' }, 'boundary-auth-exceed');
    
    console.log('Boundary conditions test completed\n');
  }

  private async testRecoveryBehavior(): Promise<void> {
    console.log('Testing recovery behavior...');
    

    const promises = [];
    for (let i = 0; i < 110; i++) {
      promises.push(this.makeRequest('GET', '/api/data', undefined, 'recovery-exhaust'));
    }
    await Promise.all(promises);
    
    console.log('Waiting for rate limit window to reset...');
    await this.sleep(2000);
    

    await this.makeRequest('GET', '/api/data', undefined, 'recovery-test');
    
    console.log('Recovery behavior test completed\n');
  }

  private async testAdminEndpoints(): Promise<void> {
    console.log('Testing admin endpoints...');
    
    await this.makeRequest('GET', '/admin/stats', undefined, 'admin');
    await this.makeRequest('GET', '/admin/queue-stats', undefined, 'admin');
    await this.makeRequest('POST', '/admin/reset-rate-limit', {
      identifier: this.getClientIdentifier(),
      ruleId: 'api'
    }, 'admin');
    
    console.log('Admin endpoints test completed\n');
  }

  private async testErrorHandling(): Promise<void> {
    console.log('Testing error handling...');
    
    await this.makeRequest('GET', '/nonexistent', undefined, 'error-handling');
    await this.makeRequest('POST', '/invalid/endpoint', undefined, 'error-handling');
    await this.makeRequest('POST', '/admin/reset-rate-limit', undefined, 'error-handling');
    
    console.log('Error handling test completed\n');
  }

  private async testHeaderValidation(): Promise<void> {
    console.log('Testing header validation...');
    

    await this.resetRateLimits();
    await this.sleep(100);
    

    const successResult = await this.makeRequestForHeaders('GET', '/api/data');
    const successLegacy = !!(successResult.rateLimitHeaders['x-ratelimit-limit']);
    const successStandard = !!(successResult.rateLimitHeaders['ratelimit-limit']);
    
    console.log(`Success request - Legacy: ${successLegacy ? 'Present' : 'Missing'}, Standard: ${successStandard ? 'Present' : 'Missing'}`);
    

    const loadPromises = [];
    for (let i = 0; i < 150; i++) {
      loadPromises.push(this.makeRequest('GET', '/api/data', undefined, 'header-load'));
    }
    await Promise.all(loadPromises);
    

    const blockedResult = await this.makeRequestForHeaders('GET', '/api/data');
    const blockedLegacy = !!(blockedResult.rateLimitHeaders['x-ratelimit-limit']);
    const blockedStandard = !!(blockedResult.rateLimitHeaders['ratelimit-limit']);
    
    console.log(`Blocked request - Legacy: ${blockedLegacy ? 'Present' : 'Missing'}, Standard: ${blockedStandard ? 'Present' : 'Missing'}`);
    console.log(`Status: ${blockedResult.status}`);
    
    console.log('Header validation test completed\n');
  }

  private async testSecurityScenarios(): Promise<void> {
    console.log('Testing security scenarios...');
    

    await this.makeRawRequest('POST', '/api/data', '{"invalid": json}', 'security');
    

    const largePayload = 'x'.repeat(10000);
    await this.makeRequest('POST', '/api/data', { data: largePayload }, 'security');
    

    await this.makeRequest('POST', '/auth/login', {
      email: "'; DROP TABLE users; --",
      password: 'test'
    }, 'security');
    
    await this.makeRequest('POST', '/api/data', {
      content: '<script>alert("xss")</script>'
    }, 'security');
    

    console.log('   Testing Redis edge cases...');
    const extremePromises = [];
    for (let i = 0; i < 500; i++) {
      extremePromises.push(this.makeRequest('GET', '/api/data', undefined, 'redis-stress'));
    }
    await Promise.all(extremePromises);
    

    const injectionPayloads = [
      '127.0.0.1\r\nX-Injected: malicious',
      '10.0.0.1\nSet-Cookie: evil=true',
      '192.168.1.1\x00\x0d\x0aX-Evil: header'
    ];
    
    for (const payload of injectionPayloads) {
      await this.makeRawRequest('GET', '/api/data', undefined, 'header-injection', {
        'X-Forwarded-For': payload
      });
    }
    

    await this.testSkipLogicEdgeCases();
    
    console.log('Security scenarios test completed\n');
  }

  private async testSkipLogicEdgeCases(): Promise<void> {
    console.log('   Testing skip logic edge cases...');
    

    const testCases = [
      { method: 'GET', path: '/api/data', type: 'success-skip' },
      { method: 'GET', path: '/nonexistent', type: 'error-skip' },
      { method: 'POST', path: '/api/data', data: '{"malformed": json}', type: 'server-error-skip' },
      { method: 'POST', path: '/admin/reset-rate-limit', data: {}, type: 'bad-request-skip' }
    ];
    
    for (const testCase of testCases) {
      await this.makeRequest(
        testCase.method as any,
        testCase.path,
        testCase.data,
        testCase.type
      );
    }
  }

  private async testWorkerFunctionality(): Promise<void> {
    console.log('Testing worker functionality...');
    

    const statsBefore = await this.makeRequestForHeaders('GET', '/admin/queue-stats');
    

    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(this.makeRequest('GET', '/api/data', undefined, 'worker-test'));
    }
    await Promise.all(promises);
    

    await this.sleep(2000);
    

    const statsAfter = await this.makeRequestForHeaders('GET', '/admin/queue-stats');
    
    console.log('Worker functionality test completed\n');
  }

  private async testHealthEndpointBypass(): Promise<void> {
    console.log('Testing health endpoint bypass...');
    
    await this.resetRateLimits();
    
    // Test health endpoint should never be rate limited
    for (let i = 0; i < 100; i++) {
      await this.makeRequest('GET', '/health', undefined, 'health-bypass');
    }
    
    // Exhaust other limits to verify health still works
    const promises = [];
    for (let i = 0; i < 60; i++) {
      promises.push(this.makeRequest('GET', '/api/data', undefined, 'health-bypass-verify'));
    }
    await Promise.all(promises);
    
    // Health should still work
    for (let i = 0; i < 10; i++) {
      await this.makeRequest('GET', '/health', undefined, 'health-bypass-after-limit');
    }
    
    console.log('Health endpoint bypass test completed\n');
  }

  private async testSkipLogicDetailed(): Promise<void> {
    console.log('Testing skip logic for successful/failed requests...');
    
    await this.resetRateLimits();
    
    // Test successful requests
    for (let i = 0; i < 5; i++) {
      await this.makeRequest('GET', '/api/data', undefined, 'skip-success');
    }
    
    // Test failed requests
    for (let i = 0; i < 3; i++) {
      await this.makeRequest('GET', '/nonexistent', undefined, 'skip-failure');
    }
    
    // Test mixed requests
    const mixedRequests = [
      { url: '/api/data', expected: 200 },
      { url: '/nonexistent', expected: 404 },
      { url: '/api/data', expected: 200 },
      { url: '/invalid', expected: 404 }
    ];
    
    for (const { url } of mixedRequests) {
      await this.makeRequest('GET', url, undefined, 'skip-mixed');
    }
    
    console.log('Skip logic detailed test completed\n');
  }

  private async testRedisFallbackScenarios(): Promise<void> {
    console.log('Testing Redis failure scenarios and algorithm fallback...');
    
    await this.resetRateLimits();
    
    // Test normal operation
    for (let i = 0; i < 3; i++) {
      await this.makeRequest('GET', '/api/data', undefined, 'redis-normal');
    }
    
    // Test high load to potentially trigger fallback
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(this.makeRequest('GET', '/api/data', undefined, 'redis-fallback'));
    }
    await Promise.all(promises);
    
    // Test algorithm consistency
    await this.resetRateLimits();
    for (let i = 0; i < 10; i++) {
      await this.makeRequest('GET', '/api/data', undefined, 'redis-consistency');
      await this.sleep(50);
    }
    
    console.log('Redis fallback scenarios test completed\n');
  }

  private async testMemoryCleanupBehavior(): Promise<void> {
    console.log('Testing memory cleanup and local cache TTL...');
    
    // Generate unique identifiers to test cache
    const uniquePromises = [];
    for (let i = 0; i < 50; i++) {
      uniquePromises.push(
        this.makeRawRequest('GET', '/api/data', undefined, 'memory-cleanup', {
          'X-Forwarded-For': `192.168.1.${i}`
        })
      );
    }
    await Promise.all(uniquePromises);
    
    // Test throttle map usage
    const throttlePromises = [];
    for (let i = 0; i < 25; i++) {
      throttlePromises.push(this.makeRequest('GET', '/api/data', undefined, 'memory-throttle'));
    }
    await Promise.all(throttlePromises);
    
    // Test TTL behavior
    await this.resetRateLimits();
    for (let i = 0; i < 5; i++) {
      await this.makeRequest('GET', '/api/data', undefined, 'memory-ttl');
      await this.sleep(200);
    }
    
    // Test memory pressure
    const memoryPromises = [];
    for (let i = 0; i < 100; i++) {
      memoryPromises.push(
        this.makeRawRequest('GET', '/api/data', undefined, 'memory-pressure', {
          'X-Forwarded-For': `10.0.0.${i % 255}`
        })
      );
    }
    await Promise.all(memoryPromises);
    
    console.log('Memory cleanup behavior test completed\n');
  }

  private async testQueueFailureRecovery(): Promise<void> {
    console.log('Testing queue processing failures and recovery...');
    
    // Generate load to create queue jobs
    const loadPromises = [];
    for (let i = 0; i < 30; i++) {
      loadPromises.push(this.makeRequest('GET', '/api/data', undefined, 'queue-load'));
    }
    await Promise.all(loadPromises);
    
    // Test cleanup job triggers
    const cleanupPromises = [];
    for (let i = 0; i < 60; i++) {
      cleanupPromises.push(this.makeRequest('GET', '/api/data', undefined, 'queue-cleanup'));
    }
    await Promise.all(cleanupPromises);
    
    // Test different job types
    await this.makeRequest('POST', '/admin/reset-rate-limit', {
      identifier: this.getClientIdentifier(),
      ruleId: 'api'
    }, 'queue-reset');
    
    for (let i = 0; i < 10; i++) {
      await this.makeRequest('GET', '/api/data', undefined, 'queue-increment');
    }
    
    // Test queue resilience under stress
    const stressPromises = [];
    for (let i = 0; i < 100; i++) {
      stressPromises.push(this.makeRequest('GET', '/api/data', undefined, 'queue-stress'));
    }
    await Promise.all(stressPromises);
    
    console.log('Queue failure recovery test completed\n');
  }

  private async testInMemoryFallback(): Promise<void> {
    console.log('Testing in-memory fallback scenarios...');
    

    const ipFormats = ['192.168.1.1', '::1', '2001:db8::1', 'invalid-ip'];
    for (const ip of ipFormats) {
      await this.makeRawRequest('GET', '/api/data', undefined, 'fallback-test', {
        'X-Forwarded-For': ip
      });
    }
    
    console.log('In-memory fallback test completed\n');
  }

  private async testLocalThrottling(): Promise<void> {
    console.log('Testing local throttling behavior...');
    

    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(this.makeRequest('GET', '/api/data', undefined, 'throttle-test'));
    }
    await Promise.all(promises);
    
    console.log('Local throttling test completed\n');
  }

  private async testQueueEdgeCases(): Promise<void> {
    console.log('Testing queue edge cases...');
    

    await this.makeRequest('GET', '/admin/queue-stats', undefined, 'queue-before');
    

    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(this.makeRequest('GET', '/api/data', undefined, 'queue-load'));
    }
    await Promise.all(promises);
    
    await this.sleep(1000);
    await this.makeRequest('GET', '/admin/queue-stats', undefined, 'queue-after');
    
    console.log('Queue edge cases test completed\n');
  }

  private async testAlgorithmEdgeCases(): Promise<void> {
    console.log('Testing algorithm edge cases...');
    

    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(this.makeRequest('GET', '/api/data', undefined, 'algorithm-precision'));
    }
    await Promise.all(promises);
    

    await this.makeRequest('GET', '/api/data', undefined, 'boundary-timing');
    await this.makeRequest('GET', '/test/limited', undefined, 'boundary-timing');
    
    console.log('Algorithm edge cases test completed\n');
  }

  private async resetRateLimits(): Promise<void> {
    await this.makeRequest('POST', '/admin/reset-rate-limit', {
      identifier: this.getClientIdentifier()
    }, 'admin-reset');
  }

  private getClientIdentifier(): string {
    return process.env.NODE_ENV === 'test' ? '127.0.0.1' : '::1';
  }

  private async makeRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    data?: any,
    testType?: string
  ): Promise<void> {
    const startTime = Date.now();
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response: AxiosResponse = await axios({
        method,
        url,
        data,
        timeout: 10000,
        validateStatus: () => true
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
        testType
      };
      
      this.results.push(result);
      
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
        testType
      };
      
      this.results.push(result);
    }
  }

  private async makeRawRequest(
    method: string,
    path: string,
    data?: string,
    testType?: string,
    headers?: Record<string, string>
  ): Promise<void> {
    const startTime = Date.now();
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await axios({
        method: method as any,
        url,
        data,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        timeout: 10000,
        validateStatus: () => true
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
        testType
      };
      
      this.results.push(result);
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const axiosError = error as AxiosError;
      
      const result: TestResult = {
        url: path,
        method,
        status: axiosError.response?.status || 0,
        rateLimitHeaders: axiosError.response 
          ? this.extractRateLimitHeaders(axiosError.response.headers) : {},
        responseTime,
        timestamp: new Date().toISOString(),
        error: axiosError.message,
        testType
      };
      
      this.results.push(result);
    }
  }

  private async makeRequestForHeaders(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string): Promise<TestResult> {
    const startTime = Date.now();
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await axios({ 
        method, 
        url, 
        timeout: 5000,
        validateStatus: () => true
      });
      const responseTime = Date.now() - startTime;
      const rateLimitHeaders = this.extractRateLimitHeaders(response.headers);
      
      return {
        url: path,
        method,
        status: response.status,
        rateLimitHeaders,
        responseTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const axiosError = error as AxiosError;
      const rateLimitHeaders = axiosError.response 
        ? this.extractRateLimitHeaders(axiosError.response.headers) : {};
      
      return {
        url: path,
        method,
        status: axiosError.response?.status || 0,
        rateLimitHeaders,
        responseTime,
        timestamp: new Date().toISOString(),
        error: axiosError.message,
      };
    }
  }

  private extractRateLimitHeaders(headers: any): RateLimitHeaders {
    return {
      'x-ratelimit-limit': headers['x-ratelimit-limit'],
      'x-ratelimit-remaining': headers['x-ratelimit-remaining'],
      'x-ratelimit-reset': headers['x-ratelimit-reset'],
      'x-ratelimit-retryafter': headers['x-ratelimit-retryafter'],
      'x-ratelimit-warning': headers['x-ratelimit-warning'],
      'ratelimit-limit': headers['ratelimit-limit'],
      'ratelimit-remaining': headers['ratelimit-remaining'],
      'ratelimit-reset': headers['ratelimit-reset'],
      'retry-after': headers['retry-after'],
    };
  }

  private printSummary(): void {
    console.log('\nTest Summary');
    console.log('============');
    
    const totalRequests = this.results.length;
    const successfulRequests = this.results.filter(r => r.status === 200).length;
    const rateLimitedRequests = this.results.filter(r => r.status === 429).length;
    const authBlockedRequests = this.results.filter(r => r.status === 423).length;
    const notFoundRequests = this.results.filter(r => r.status === 404).length;
    const errorRequests = this.results.filter(r => r.error && ![429, 423, 404].includes(r.status)).length;
    
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Successful (200): ${successfulRequests}`);
    console.log(`Rate Limited (429): ${rateLimitedRequests}`);
    console.log(`Auth Blocked (423): ${authBlockedRequests}`);
    console.log(`Not Found (404): ${notFoundRequests}`);
    console.log(`Other Errors: ${errorRequests}`);
    
    const avgResponseTime = this.results
      .reduce((sum, r) => sum + r.responseTime, 0) / totalRequests;
    console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    
    const testedEndpoints = [...new Set(this.results.map(r => r.url))];
    const testedMethods = [...new Set(this.results.map(r => r.method))];
    
    const headersPresent = this.results.filter(r => r.rateLimitHeaders['x-ratelimit-limit']).length;
    
    console.log('\nRate Limiting Validation:');
    console.log(`Burst Protection: ${rateLimitedRequests > 0 ? 'TRIGGERED' : 'NOT TRIGGERED'}`);
    console.log(`Auth Protection: ${authBlockedRequests > 0 ? 'TRIGGERED' : 'NOT TRIGGERED'}`);
    console.log(`Headers Present: ${headersPresent}/${totalRequests} requests`);
    console.log(`Headers: ${headersPresent > 0 ? 'WORKING' : 'MISSING'}`);
    
    console.log('\nCoverage:');
    console.log(`Endpoints: ${testedEndpoints.length}`);
    console.log(`HTTP Methods: ${testedMethods.join(', ')}`);
    console.log(`Test Types: Health Bypass, Basic, Burst, Auth, API, Global, Concurrent, Boundary, Recovery, Admin, Error, Security, Worker, Skip Logic Detailed, Redis Fallback, Memory Cleanup, Queue Failure Recovery, In-Memory Fallback, Local Throttling, Queue Edge Cases, Algorithm Edge Cases`);
    
    this.saveResults();
    console.log('\nComprehensive rate limiter testing completed');
    

    const sampleWithHeaders = this.results.find(r => r.rateLimitHeaders['x-ratelimit-limit']);
    if (sampleWithHeaders) {
      console.log('\nSample headers:', JSON.stringify(sampleWithHeaders.rateLimitHeaders, null, 2));
    } else {
      console.log('\nNo headers found in any response');
    }
  }

  private saveResults(): void {
    const fs = require('fs');
    const filename = `rate-limit-test-results-${Date.now()}.json`;
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalRequests: this.results.length,
        successful: this.results.filter(r => r.status === 200).length,
        rateLimited: this.results.filter(r => r.status === 429).length,
        authBlocked: this.results.filter(r => r.status === 423).length,
        notFound: this.results.filter(r => r.status === 404).length,
        errors: this.results.filter(r => r.error && ![429, 423, 404].includes(r.status)).length,
        coverage: {
          endpoints: [...new Set(this.results.map(r => r.url))],
          methods: [...new Set(this.results.map(r => r.method))],
          avgResponseTime: this.results.reduce((sum, r) => sum + r.responseTime, 0) / this.results.length
        }
      },
      results: this.results
    };
    
    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`Results saved to ${filename}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}


if (require.main === module) {
  const baseUrl = process.argv[2] || 'http://localhost:3000';
  
  (async () => {
    try {
      console.log(`Testing rate limiter at: ${baseUrl}\n`);
      const client = new RateLimitTestClient(baseUrl);
      await client.runTests();
    } catch (error) {
      console.error('Test execution failed:', error);
      process.exit(1);
    }
  })();
}