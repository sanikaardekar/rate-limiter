# Rate Limiter API Server

A Redis-backed rate limiting system built with Node.js, TypeScript, and Express.js. Features multiple rate limiting strategies, queue-based processing, and comprehensive monitoring capabilities.

## 🚀 Features

- **Sliding Window Counter Algorithm**: More accurate rate limiting with smooth distribution
- **Multiple Rate Limiting Rules**: Global, API-specific, authentication, and burst protection
- **Redis Persistence**: Distributed rate limiting with Redis backend using sorted sets
- **Queue-Based Processing**: Asynchronous job processing with Bull queues
- **Flexible Configuration**: Path-specific rules with custom key generators
- **Monitoring & Admin**: Real-time stats and administrative controls
- **RFC Compliant**: Standard and legacy HTTP headers

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
- npm or yarn package manager

### Dependencies

**Runtime Dependencies:**
- `express` - Web framework
- `ioredis` - Redis client
- `bull` - Queue processing
- `cors` - Cross-origin resource sharing
- `helmet` - Security headers
- `axios` - HTTP client (for testing)
- `dotenv` - Environment variables

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

# Start the development server
npm run dev

# Or start production server
npm start
```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start production server from compiled code

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
│                Express.js Server                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            Rate Limiter Middleware                 │    │
│  │                                                     │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │    │
│  │  │ Global  │  │   API   │  │  Auth   │  │ Burst   │ │    │
│  │  │15min/1k │  │1min/100 │  │5min/5   │  │1sec/10  │ │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘ │    │
│  │       │           │           │           │         │    │
│  │       └───────────┼───────────┼───────────┘         │    │
│  │                   │           │                     │    │
│  │              ┌────▼───────────▼────┐                │    │
│  │              │  Most Restrictive   │                │    │
│  │              │    Rule Wins        │                │    │
│  │              └────┬────────────────┘                │    │
│  └───────────────────┼─────────────────────────────────┘    │
└──────────────────────┼──────────────────────────────────────┘
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
│ Request      │       │      │ or 423       │
│ Normally     │       │      │ + Headers    │
└──────────────┘       │      └──────────────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Queue Async Job │
              │ (Increment +    │
              │  Cleanup)       │
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
│  │ ┌─────────────┐ │           │  └─────────────────────┘ │  │
│  │ │    Key2     │ │           │                         │  │
│  │ │ count: 12   │ │           │  ┌─────────────────────┐ │  │
│  │ │ reset: 5678 │ │  Fallback │  │ Fixed Window        │ │  │
│  │ └─────────────┘ │◄─────────►│  │ (String + JSON)     │ │  │
│  └─────────────────┘           │  │                     │ │  │
│                                │  │ SET key data EX ttl │ │  │
│                                │  │ GET key             │ │  │
│                                │  └─────────────────────┘ │  │
│                                └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Queue Processing Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Request   │    │  Queue Service  │    │ Rate Limit      │
│   Processing    │    │                 │    │ Worker          │
│                 │    │                 │    │ (Optional)      │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │ 1. Create Job        │                      │
          ├─────────────────────►│                      │
          │                      │                      │
          │ 2. Return Response   │                      │
          │    Immediately       │                      │
          │◄─────────────────────┤                      │
          │                      │                      │
          │                      │ 3. Process Job       │
          │                      │     Async            │
          │                      ├─────────────────────►│
          │                      │                      │
          │                      │                      │ 4. Update Redis
          │                      │                      │    Counters
          │                      │                      │
          │                      │ 5. Job Complete      │
          │                      │◄─────────────────────┤
          │                      │                      │

┌─────────────────────────────────────────────────────────────┐
│                    Job Types                                │
│                                                             │
│  INCREMENT Job:                 CLEANUP Job:                │
│  • Update request count         • Remove expired entries   │
│  • Add timestamp to ZSET        • Clean up old data        │
│  • Set TTL                      • Optimize memory usage     │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

1. **Request arrives** → Express.js server
2. **Rate limiter middleware** → Checks all applicable rules
3. **Cache service** → Checks local cache first, then Redis
4. **Sliding window check** → Redis sorted sets track request timestamps
5. **Expired requests removed** → Cleanup old entries outside window
6. **Current count calculated** → Count requests in sliding window
7. **Decision made** → Allow/block request based on limits
8. **Response sent** → With appropriate headers and status
9. **Queue job** → Async increment/cleanup operations (background)

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
│        60-second sliding window         │
│  ┌─────────────────────────────────┐    │
│  │     Current window (any time)   │    │
│  │         Max 10 requests         │    │
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
- **`RateLimitWorker`**: Background job processor with health monitoring
- **`HeadersUtil`**: RFC-compliant rate limit headers

## 📊 Rate Limiting Rules

The system implements four distinct rate limiting rules:

### 1. Global Rate Limit
- **Limit**: 1000 requests per 15 minutes
- **Scope**: All endpoints per IP
- **Purpose**: Prevent abuse and ensure fair usage

### 2. API Rate Limit
- **Limit**: 100 requests per minute
- **Scope**: `/api/*` endpoints
- **Key**: `${req.ip}--${req.path}` (separate counters per endpoint)
- **Bypass**: `/health` endpoint excluded

### 3. Authentication Rate Limit
- **Limit**: 5 requests per 5 minutes
- **Scope**: `/auth/*` endpoints only
- **Purpose**: Prevent brute force attacks
- **Status Code**: 423 (Locked)

### 4. Burst Protection
- **Limit**: 10 requests per second
- **Scope**: All endpoints except `/health`
- **Purpose**: Prevent rapid-fire attacks

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
| `GET` | `/test/unlimited` | Test endpoint (global limits apply) | ✅ |
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
  -d '{"identifier":"127.0.0.1","ruleId":"api"}'
```

Parameters:
- `identifier`: IP address or custom identifier
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
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1640995200
Retry-After: 60
```

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

## 🧪 Testing

### Rate Limiting Algorithm

The system uses **Sliding Window Counter** algorithm:
- More accurate than fixed windows
- Prevents burst at window boundaries
- Uses Redis sorted sets for timestamp tracking
- Falls back to fixed window if needed

### Manual Testing

```bash
# Reset rate limits before testing
curl -X POST http://localhost:3000/admin/reset-rate-limit \
  -H "Content-Type: application/json" \
  -d '{"identifier":"127.0.0.1"}'

# Test burst protection (should block after 10 requests)
for i in {1..15}; do curl http://localhost:3000/api/data; echo; done

# Test auth rate limiting (should block after 5 requests)
for i in {1..6}; do curl -X POST http://localhost:3000/auth/login; echo; done

# Test health endpoint bypass (should never block)
for i in {1..20}; do curl http://localhost:3000/health; echo; done
```

### Comprehensive Test Client

Use the built-in test client for thorough testing:

```bash
# Build the project first (required)
npm run build

# Run comprehensive test suite against default server (localhost:3000)
node dist/client/test-client.js

# Test against different server
node dist/client/test-client.js http://localhost:3001
```

**Test Client Features:**
- Tests all endpoints and HTTP methods
- Validates rate limit headers (legacy + standard)
- Tests burst protection, auth limits, and recovery
- Generates detailed JSON reports
- Measures response times and coverage
- Concurrent request testing

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
2. **Redis Dependency**: System fails open if Redis is unavailable
3. **Memory Usage**: Local cache grows with unique client identifiers
4. **Precision**: 1-second minimum window resolution
5. **Distributed Coordination**: No coordination between multiple server instances

### Known Issues

1. **Race Conditions**: Possible under extreme concurrent load
2. **Memory Leaks**: Local cache cleanup relies on intervals
3. **Redis Failover**: No automatic Redis failover handling
4. **Lua Script Errors**: Falls back to fixed window algorithm
5. **Sorted Set Growth**: Redis memory usage grows with request volume (cleaned by TTL)

### Monitoring & Alerting

- Monitor Redis memory usage
- Set up alerts for high error rates
- Track queue processing delays
- Monitor response times

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

