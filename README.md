# Rate Limiter API Server

A Redis-backed rate limiting system built with Node.js, TypeScript, and Express.js. Features multiple rate limiting strategies, queue-based processing, and comprehensive monitoring capabilities.

## 🚀 Features

- **Multiple Rate Limiting Rules**: Global, API-specific, authentication, and burst protection
- **Redis Persistence**: Distributed rate limiting with Redis backend
- **Queue-Based Processing**: Asynchronous job processing with Bull queues
- **Flexible Configuration**: Path-specific rules with custom key generators
- **Monitoring & Admin**: Real-time stats and administrative controls
- **Production Ready**: Error handling, logging, and graceful shutdown
- **RFC Compliant**: Standard and legacy HTTP headers

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Rate Limiting Rules](#rate-limiting-rules)
- [API Endpoints](#api-endpoints)
- [Configuration](#configuration)
- [Monitoring](#monitoring)
- [Testing](#testing)
- [Assumptions & Limitations](#assumptions--limitations)
- [Production Deployment](#production-deployment)

## 🏃 Quick Start

### Prerequisites

- Node.js 16+
- Redis server
- TypeScript

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd rate-limiter

# Install dependencies
npm install

# Start Redis (macOS with Homebrew)
brew install redis
redis-server

# Start the development server
npm run dev
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

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Server    │────│ Rate Limiter    │────│  Cache Service  │
│   (Express.js)  │    │   Middleware    │    │    (Redis)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         └──────────────│ Queue Service   │──────────────┘
                        │    (Bull)       │
                        └─────────────────┘
```

### Data Flow

1. **Request arrives** → Express.js server
2. **Rate limiter middleware** → Checks all applicable rules
3. **Cache service** → Queries Redis for current counts
4. **Decision made** → Allow/block request based on limits
5. **Queue job** → Async increment/cleanup operations
6. **Response sent** → With appropriate headers and status

### Key Classes

- **`ApiServer`**: Main Express.js application server
- **`RateLimiterMiddleware`**: Core rate limiting logic
- **`CacheService`**: Redis operations and local caching
- **`QueueService`**: Background job processing
- **`RedisService`**: Redis connection and atomic operations

## 📊 Rate Limiting Rules

The system implements four distinct rate limiting rules:

### 1. Global Rate Limit
- **Limit**: 1000 requests per 15 minutes
- **Scope**: All endpoints per IP
- **Purpose**: Prevent abuse and ensure fair usage

### 2. API Rate Limit
- **Limit**: 100 requests per minute
- **Scope**: `/api/*` endpoints
- **Key**: `IP--path` (separate counters per endpoint)
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
| `GET` | `/test/unlimited` | No rate limiting | ❌ |
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

## ⚙️ Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password

# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### Custom Rate Limiting Rules

```typescript
const customRules: RateLimitRule[] = [
  {
    id: 'custom',
    windowMs: 60000, // 1 minute
    maxRequests: 50,
    message: 'Custom rate limit exceeded',
    keyGenerator: (req) => `${req.ip}-${req.headers['user-agent']}`,
    skipIf: (req) => req.path.startsWith('/public'),
  }
];
```

## 📈 Monitoring

### Rate Limit Headers

Every response includes rate limiting headers:

**Legacy Headers (X-RateLimit-*)**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
X-RateLimit-RetryAfter: 60
```

**Standard Headers (RFC 6585)**
```
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

### Manual Testing

```bash
# Test burst protection (should block after 10 requests)
for i in {1..15}; do curl http://localhost:3000/api/data; echo; done

# Test auth rate limiting (should block after 5 requests)
for i in {1..6}; do curl -X POST http://localhost:3000/auth/login; echo; done

# Test health endpoint bypass (should never block)
for i in {1..20}; do curl http://localhost:3000/health; echo; done
```

### Load Testing

```bash
# Install Apache Bench
brew install httpie

# Test with concurrent requests
ab -n 1000 -c 10 http://localhost:3000/api/data
```

### Redis Verification

```bash
# Check stored rate limit keys
redis-cli keys "rate_limit:*"

# View specific key data
redis-cli get "rate_limit:127.0.0.1:api"
```

## ⚠️ Assumptions & Limitations

### Assumptions

1. **Single Redis Instance**: Assumes single Redis server (not clustered)
2. **IP-Based Identification**: Uses client IP for rate limiting by default
3. **Fixed Window Algorithm**: Uses fixed time windows, not sliding windows
4. **Synchronous Processing**: Rate limit checks are synchronous, increments are async
5. **Memory Constraints**: Local cache has no size limits (relies on TTL cleanup)

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
4. **Lua Script Errors**: Falls back to non-atomic operations

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


## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📞 Support

For issues and questions:
- Create an issue in the repository
- Check existing documentation
- Review the test cases for usage examples