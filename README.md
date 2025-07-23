# Rate Limiter API Server

A rate limiting system built with Node.js, TypeScript, and Express.js. Implements sliding window counter algorithms with Redis sorted sets for precise traffic control, dual-layer caching with in-memory fallback, asynchronous queue-based processing for optimal system performance, and real-time monitoring with RFC-compliant headers and administrative dashboards.

## 🚀 Features

- **Sliding Window Counter Algorithm**: Precise rate limiting with smooth distribution across time windows
- **Multiple Rate Limiting Rules**: Configurable global, API-specific, authentication, and burst protection rules
- **Redis Persistence**: Distributed rate limiting with Redis sorted sets for accurate tracking
- **Resilient Architecture**: In-memory fallback when Redis is unavailable
- **Queue-Based Processing**: Asynchronous job processing with Bull queues for optimal performance
- **Flexible Configuration**: Path-specific rules with custom key generators and skip conditions
- **Graduated Response System**: Warning headers when approaching limits
- **Monitoring & Admin**: Real-time statistics and administrative controls
- **RFC-Compliant Headers**: Both standard and legacy HTTP rate limit headers
- **Security Features**: Header sanitization, key collision prevention, and protection against injection
- **Local Throttling**: Optional request throttling for smoother traffic distribution
- **Skip Logic**: Configurable options to exclude successful or failed requests from rate limits

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Rate Limiting Rules](#rate-limiting-rules)
- [API Endpoints](#api-endpoints)
- [Monitoring](#monitoring)
- [Testing](#testing)
- [Assumptions & Limitations](#assumptions--limitations)

## 🏃 Quick Start

### Prerequisites

- Node.js 16+
- Redis server
- TypeScript
- npm package manager

### Dependencies

**Runtime Dependencies:**
- `express` - Web framework
- `ioredis` - Redis client
- `bull` - Queue processing
- `cors` - Cross-origin resource sharing
- `helmet` - Security headers
- `axios` - HTTP client (for testing)

**Development Dependencies:**
- `typescript` - TypeScript compiler
- `ts-node-dev` - Development server with hot reload
- `@types/*` - TypeScript type definitions

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd rate-limiter

# Install dependencies
npm install

# Install and start Redis (macOS with Homebrew)
brew install redis
redis-server

# Build the project
npm run build

# Start the development server (includes worker)
npm run dev

# Or start production server (includes worker)
npm start
```

The server will start on `http://localhost:3000`

### Basic Usage

```bash
# Check server health
curl http://localhost:3000/health

# Test API endpoint
curl http://localhost:3000/api/data

# View rate limit stats
curl http://localhost:3000/admin/stats
```

## 🏗️ Architecture

### System Architecture

```
┌─────────────┐
│   Client    │
│  Request    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                 ApiServer + RateLimitWorker                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            RateLimiterMiddleware                    │    │
│  │                                                     │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │    │
│  │  │ Global  │  │   API   │  │  Auth   │  │ Burst   │ │    │
│  │  │15min/1k │  │1min/300 │  │5min/5   │  │1sec/100 │ │    │
│  │  │Sliding  │  │Sliding  │  │Sliding  │  │Sliding  │ │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘ │    │
│  │       │           │           │           │         │    │
│  │       └───────────┼───────────┼───────────┘         │    │
│  │                   │           │                     │    │
│  │              ┌────▼───────────▼────┐                │    │
│  │              │  Most Restrictive   │                │    │
│  │              │    Rule Wins        │                │    │
│  │              └────┬────────────────┘                │    │
│  └───────────────────┼─────────────────────────────────┘    │
│                      │                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              RateLimitWorker                       │    │
│  │                                                     │    │
│  │  ┌─────────────┐    ┌─────────────┐                │    │
│  │  │ QueueService│    │ Background  │                │    │
│  │  │             │    │ Processing  │                │    │
│  │  │ • INCREMENT │    │ • CLEANUP   │                │    │
│  │  │ • RESET     │    │ • REVERT    │                │    │
│  │  └─────────────┘    └─────────────┘                │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────────┘
                       │
            ┌──────────▼──────────┐
            │     Decision        │
            └──────────┬──────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              │              ▼
  ┌──────────┐         │        ┌──────────┐
  │  ALLOW   │         │        │  BLOCK   │
  └─────┬────┘         │        └─────┬────┘
        │              │              │
        ▼              │              ▼
┌──────────────┐       │      ┌──────────────┐
│ Process      │       │      │ Return 429   │
│ Request +    │       │      │ or 423       │
│ Queue Jobs   │       │      │ + Headers    │
└──────────────┘       │      └──────────────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Redis Backend   │
              │ • Sorted Sets   │
              │ • Sliding Window│
              │ • TTL Cleanup   │
              └─────────────────┘
```

### Cache Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cache Service                            │
│                                                             │
│  ┌─────────────────┐           ┌─────────────────────────┐  │
│  │  Local Cache    │           │     Redis Service       │  │
│  │  (In-Memory)    │           │                         │  │
│  │                 │           │  ┌─────────────────────┐ │  │
│  │ ┌─────────────┐ │    Fast   │  │ Sliding Window      │ │  │
│  │ │    Key1     │ │◄─────────►│  │ (Sorted Sets)       │ │  │
│  │ │ count: 5    │ │   Lookup  │  │                     │ │  │
│  │ │ reset: 1234 │ │           │  │ ZADD key timestamp  │ │  │
│  │ └─────────────┘ │           │  │ ZCOUNT key range    │ │  │
│  │                 │           │  │ ZREMRANGEBYSCORE    │ │  │
│  │ ┌─────────────┐ │           │  │ Security: Hashed    │ │  │
│  │ │    Key2     │ │           │  │ Keys + Sanitized    │ │  │
│  │ │ count: 12   │ │           │  │ Client IPs          │ │  │
│  │ │ reset: 5678 │ │  Fallback │  └─────────────────────┘ │  │
│  │ └─────────────┘ │◄─────────►│                         │  │
│  └─────────────────┘           │  ┌─────────────────────┐ │  │
│                                │  │ In-Memory Fallback  │ │  │
│                                │  │ (When Redis Down)   │ │  │
│                                │  │                     │ │  │
│                                │  │ Local Map Storage   │ │  │
│                                │  │ TTL-based Cleanup   │ │  │
│                                │  └─────────────────────┘ │  │
│                                └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Queue Processing Flow

The system uses two separate queues (`rateLimitQueue` and `cleanupQueue`) for different operations:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Request   │    │  Queue Service  │    │ RateLimitWorker │
│   Processing    │    │                 │    │ (Integrated)    │
│                 │    │                 │    │                 │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │ 1. Rate Limit Check  │                      │
          │    (Synchronous)     │                      │
          │                      │                      │
          │ 2. Queue Cleanup Job │                      │
          ├─────────────────────►│                      │
          │                      │                      │
          │ 3. Return Response   │                      │
          │    Immediately       │                      │
          │◄─────────────────────┤                      │
          │                      │                      │
          │                      │ 4. Process Jobs      │
          │                      │    Background        │
          │                      ├─────────────────────►│
          │                      │                      │
          │                      │                      │ 5. Redis Operations
          │                      │                      │    • Cleanup expired
          │                      │                      │    • Revert counters
          │                      │                      │    • Reset limits
          │                      │ 6. Job Complete      │
          │                      │◄─────────────────────┤
          │                      │                      │

┌─────────────────────────────────────────────────────────────┐
│                    Job Types                                │
│                                                             │
│  CLEANUP Job:                   RESET Job:                  │
│  • Remove expired entries       • Delete rate limit keys   │
│  • Clean up old ZSET data       • Clear local cache        │
│  • Optimize Redis memory        • Revert increments        │
│  • Periodic maintenance         • Admin reset operations   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

1. **Request arrives** → Express.js server
2. **Rate limiter middleware** → Checks all applicable rules
3. **Cache service** → Checks local cache first, then Redis
4. **Sliding window check** → Redis sorted sets track request timestamps
5. **Expired requests removed** → Cleanup old entries outside window
6. **Current count calculated** → Count requests in sliding window
7. **Graduated response** → Add warning headers if approaching limits
8. **Decision made** → Allow/block request based on limits
9. **Response sent** → With appropriate headers and status
10. **Queue job** → Async increment/cleanup operations (background)

### Algorithm Comparison

```
Fixed Window vs Sliding Window:

Fixed Window (Fallback):
┌─────────┬─────────┬─────────┬─────────┐
│ Window1 │ Window2 │ Window3 │ Window4 │
│ 0-59s   │ 60-119s │120-179s │180-239s │
│ 10 req  │ 10 req  │ 10 req  │ 10 req  │
└─────────┴─────────┴─────────┴─────────┘
Problem: 20 requests possible at boundary (59s + 60s)

Sliding Window (Primary):
┌─────────────────────────────────────────┐
│        1-second sliding window          │
│  ┌─────────────────────────────────┐    │
│  │     Current window (any time)   │    │
│  │        Max 100 requests        │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
Benefit: Smooth rate limiting, no boundary bursts
```

### Key Components

- **`ApiServer`**: Express.js server with rate limiting middleware
- **`RateLimiterMiddleware`**: Evaluates multiple rules simultaneously
- **`CacheService`**: Dual-layer caching (Redis + in-memory)
- **`RedisService`**: Sliding window counter with Redis sorted sets
- **`QueueService`**: Async processing for increments and cleanup
- **`RateLimitWorker`**: Background job processing worker
- **`HeadersUtil`**: RFC-compliant rate limit headers with security sanitization

## 📊 Rate Limiting Rules

The system implements four distinct rate limiting rules:

### 1. Global Rate Limit
- **Limit**: 1000 requests per 15 minutes
- **Scope**: All endpoints per IP
- **Purpose**: Prevent abuse and ensure fair usage

### 2. API Rate Limit
- **Limit**: 300 requests per minute (5 req/sec sustained)
- **Scope**: `/api/*` endpoints
- **Key**: `${req.ip}--${req.path}` (separate counters per endpoint)
- **Bypass**: `/health` endpoint excluded

### 3. Authentication Rate Limit
- **Limit**: 5 requests per 5 minutes
- **Scope**: `/auth/*` endpoints only
- **Purpose**: Prevent brute force attacks
- **Status Code**: 423 (Locked)

### 4. Burst Protection
- **Limit**: 100 requests per second
- **Scope**: All endpoints except `/health`
- **Purpose**: Allow legitimate bursts while preventing DDoS

### Rule Priority

Rules are evaluated simultaneously, and the **most restrictive** (first blocked or lowest remaining) takes precedence.

## 🛠️ API Endpoints

### Public Endpoints

| Method | Path | Description | Rate Limited |
|--------|------|-------------|--------------|
| `GET` | `/` | API information | ✅ |
| `GET` | `/health` | Health check | ❌ |
| `GET` | `/api/data` | Sample API endpoint | ✅ |
| `POST` | `/api/data` | Create data | ✅ |
| `PUT` | `/api/data/:id` | Update data | ✅ |
| `DELETE` | `/api/data/:id` | Delete data | ✅ |
| `POST` | `/auth/login` | Authentication | ✅ (Strict) |
| `POST` | `/auth/register` | Registration | ✅ (Strict) |
| `POST` | `/auth/forgot-password` | Password reset | ✅ (Strict) |
| `GET` | `/test/limited` | Rate limited test | ✅ |

### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/stats` | Rate limiter statistics |
| `GET` | `/admin/queue-stats` | Queue processing stats |
| `POST` | `/admin/reset-rate-limit` | Reset rate limits |

#### Reset Rate Limit

```bash
curl -X POST http://localhost:3000/admin/reset-rate-limit \
  -H "Content-Type: application/json" \
  -d '{"identifier":"::1","ruleId":"api"}'
```

Parameters:
- `identifier`: IP address or custom identifier (use `::1` for localhost)
- `ruleId`: Specific rule to reset (optional, defaults to all)

## 📈 Monitoring

### Rate Limit Headers

Every response includes both legacy and standard rate limiting headers:

**Combined Headers (Legacy + Standard)**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
X-RateLimit-RetryAfter: 60
X-RateLimit-Warning: Approaching rate limit
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1640995200
RateLimit-Policy: 100;w=60  # 100 requests per 60-second window
Retry-After: 60
```

The `RateLimit-Policy` header follows the RFC standard format and provides information about the rate limit policy: `[limit];w=[window in seconds]`. In this example, it indicates a limit of 100 requests per 60-second window.

**Graduated Response System:**
- **Normal**: No warning headers
- **20% remaining**: `X-RateLimit-Warning: Approaching rate limit`
- **10% remaining**: `X-RateLimit-Warning: Rate limit nearly exceeded`
- **0% remaining**: HTTP 429/423 with block

### Statistics Endpoint

```bash
curl http://localhost:3000/admin/stats
```

Response:
```json
{
  "timestamp": "2025-01-01T12:00:00.000Z",
  "rateLimiter": {
    "queueStats": {
      "rateLimitQueue": {
        "waiting": 0,
        "active": 1,
        "completed": 150,
        "failed": 0
      },
      "cleanupQueue": {
        "waiting": 0,
        "active": 0,
        "completed": 24,
        "failed": 0
      }
    },
    "localCacheSize": 25
  },
  "activeRateLimits": 12,
  "server": {
    "uptime": 3600,
    "memory": {...},
    "cpu": {...}
  }
}
```

The statistics endpoint provides comprehensive information about both queues (`rateLimitQueue` and `cleanupQueue`), allowing for complete monitoring of the system's operation.

## 🧪 Testing

### Rate Limiting Algorithm

The system uses **Sliding Window Counter** algorithm for all rules:
- More accurate than fixed windows
- Prevents burst at window boundaries
- Uses Redis sorted sets for timestamp tracking
- Consistent algorithm across all rate limiting rules

### Manual Testing

#### Quick Rate Limiter Tests
```bash
# Run all rate limiter tests
node tests/run-all-tests.js

# Or run individual tests
node tests/test-burst.js
node tests/test-api-limit.js
node tests/test-global-limit.js
node tests/test-warning-headers.js
```

#### Individual Manual Tests
```bash
# Test auth rate limiting (should block after 5 requests)
for i in {1..6}; do curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'; echo; done

# Test health endpoint bypass (should never block)
for i in {1..200}; do curl http://localhost:3000/health; echo; done

# Test admin reset functionality
curl -X POST http://localhost:3000/admin/reset-rate-limit \
  -H "Content-Type: application/json" \
  -d '{"identifier":"::1"}'

# Test different HTTP methods
curl -X POST http://localhost:3000/api/data \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}'

curl -X PUT http://localhost:3000/api/data/123 \
  -H "Content-Type: application/json" \
  -d '{"test":"updated"}'

curl -X DELETE http://localhost:3000/api/data/123
```

### Test Client

Use the built-in test client for comprehensive testing:

```bash
# Build the project first
npm run build

# Run test suite against default server (localhost:3000)
node dist/client/test-client.js

# Test against different server
node dist/client/test-client.js http://localhost:3001

# Or run via npm
npm run test:client
```

**Test Coverage:**
- All endpoints and HTTP methods
- Rate limit headers validation (legacy + standard)
- Burst protection, auth limits, and recovery
- Boundary conditions and security scenarios
- Header injection vulnerability testing
- Queue worker functionality validation
- Skip logic for successful/failed requests
- Concurrent request handling
- Detailed JSON reports with metrics

## ⚠️ Assumptions & Limitations

### Assumptions

1. **Single Redis Instance**: Assumes single Redis server (not clustered)
2. **IP-Based Identification**: Uses client IP for rate limiting by default
3. **Sliding Window Algorithm**: Uses sliding window counter with fixed window fallback
4. **Synchronous Processing**: Rate limit checks are synchronous, increments are async
5. **Memory Constraints**: Local cache has no size limits (relies on TTL cleanup)
6. **Redis Sorted Sets**: Relies on ZSET operations for sliding window implementation

### Limitations

1. **Clock Synchronization**: Requires synchronized clocks across multiple servers
2. **Redis Dependency**: System fails open if Redis is unavailable (mitigated by in-memory fallback)
3. **Memory Usage**: Local cache grows with unique client identifiers
4. **Precision**: 1-second minimum window resolution
5. **Distributed Coordination**: No coordination between multiple server instances

### Known Issues

1. **Race Conditions**: Possible under extreme concurrent load
2. **Memory Leaks**: Local cache cleanup relies on intervals
3. **Redis Failover**: No automatic Redis failover handling
4. **Lua Script Errors**: Falls back to fixed window algorithm
5. **Sorted Set Growth**: Redis memory usage grows with request volume (cleaned by TTL)
6. **TTL Precision**: Redis TTL calculations can be off by seconds due to rounding

### Skip Logic for Request Handling

The system includes configurable options to exclude successful or failed requests from rate limits:

- `skipSuccessfulRequests`: When enabled, successful requests (2xx status codes) don't count against limits
- `skipFailedRequests`: When enabled, failed requests (4xx/5xx status codes) don't count against limits

This provides flexibility for different use cases, such as only counting failed authentication attempts.

### Local Throttling

The implementation includes a local throttling mechanism that helps smooth traffic distribution:

- Uses a `throttleMap` to track request timing per client
- Calculates minimum intervals between requests based on burst rule
- Applies small delays to maintain consistent request spacing
- Automatically cleans up stale entries to prevent memory growth

### Monitoring & Alerting

- Monitor Redis memory usage
- Set up alerts for high error rates
- Track queue processing delays
- Monitor response times
- Use the comprehensive queue statistics to identify bottlenecks

### Scaling Considerations

1. **Horizontal Scaling**: Multiple server instances share Redis state
2. **Redis Clustering**: Consider Redis Cluster for high availability
3. **Load Balancing**: Use sticky sessions or consistent hashing
4. **Monitoring**: Implement comprehensive logging and metrics

### Security

1. **Redis Security**: Use Redis AUTH and network isolation
2. **Rate Limit Bypass**: Implement IP whitelisting for trusted sources
3. **DDoS Protection**: Consider upstream rate limiting (CDN/Load Balancer)
4. **Input Validation**: Validate all admin endpoint inputs
5. **Header Sanitization**: Client IP extraction sanitizes malicious headers
6. **Key Security**: Rate limit keys use hashing to prevent collisions