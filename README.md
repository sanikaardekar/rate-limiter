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
  - [System Architecture Diagram](#system-architecture-diagram)
  - [Core Concepts](#core-concepts)
  - [System Flow](#system-flow)
  - [Caching Strategy](#caching-strategy)
  - [Background Processing](#background-processing)
  - [Algorithm Deep Dive](#algorithm-deep-dive)
  - [Security & Resilience](#security--resilience)
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

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              RATE LIMITER SYSTEM                               │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐    ┌──────────────────────────────────────────────────────────┐
│   CLIENT    │───▶│                    EXPRESS SERVER                        │
│  (Browser/  │    │                                                          │
│   API Tool) │    │  ┌─────────────────────────────────────────────────────┐ │
└─────────────┘    │  │              RATE LIMIT MIDDLEWARE                 │ │
                   │  │                                                     │ │
                   │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │ │
                   │  │  │   GLOBAL    │  │     API     │  │    AUTH     │ │ │
                   │  │  │ 1000/15min  │  │  300/1min   │  │   5/5min    │ │ │
                   │  │  └─────────────┘  └─────────────┘  └─────────────┘ │ │
                   │  │  ┌─────────────┐                                   │ │
                   │  │  │   BURST     │  ◄── RULE EVALUATION ──────────── │ │
                   │  │  │   50/1sec   │      (Most Restrictive Wins)     │ │
                   │  │  └─────────────┘                                   │ │
                   │  └─────────────────────────────────────────────────────┘ │
                   │                           │                              │
                   │                           ▼                              │
                   │  ┌─────────────────────────────────────────────────────┐ │
                   │  │                CACHE LAYER                         │ │
                   │  │                                                     │ │
                   │  │  ┌─────────────┐              ┌─────────────────┐  │ │
                   │  │  │   MEMORY    │◄─────────────┤  CIRCUIT BREAKER │  │ │
                   │  │  │   CACHE     │   FALLBACK   │   (5 failures)  │  │ │
                   │  │  │ (Fixed Win) │              └─────────────────┘  │ │
                   │  │  └─────────────┘                       │           │ │
                   │  │         ▲                              ▼           │ │
                   │  │         │                    ┌─────────────────┐  │ │
                   │  │         │                    │     REDIS       │  │ │
                   │  │         │                    │  (Primary Store) │  │ │
                   │  │         │                    │                 │  │ │
                   │  │         │                    │ ┌─────────────┐ │  │ │
                   │  │         │                    │ │ SORTED SETS │ │  │ │
                   │  │         │                    │ │ Timestamps  │ │  │ │
                   │  │         │                    │ │ Sliding Win │ │  │ │
                   │  │         │                    │ └─────────────┘ │  │ │
                   │  │         │                    └─────────────────┘  │ │
                   │  └─────────────────────────────────────────────────────┘ │
                   │                           │                              │
                   │                           ▼                              │
                   │  ┌─────────────────────────────────────────────────────┐ │
                   │  │              DECISION ENGINE                        │ │
                   │  │                                                     │ │
                   │  │     ALLOW ◄──── COUNT ◄──── SLIDING WINDOW         │ │
                   │  │       │           │           CALCULATION           │ │
                   │  │       ▼           ▼                                 │ │
                   │  │   RESPONSE    BLOCK (429/423)                      │ │
                   │  │   + HEADERS   + RETRY-AFTER                        │ │
                   │  └─────────────────────────────────────────────────────┘ │
                   └──────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BACKGROUND PROCESSING                                │
│                                                                                 │
│  ┌─────────────────┐                           ┌─────────────────────────────┐ │
│  │ RATE LIMIT QUEUE│                           │      CLEANUP QUEUE          │ │
│  │                 │                           │                             │ │
│  │ • Increments    │                           │ • Expired Entry Removal    │ │
│  │ • Resets        │                           │ • Memory Optimization      │ │
│  │ • Reverts       │                           │ • Periodic Maintenance     │ │
│  └─────────────────┘                           └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              RESPONSE HEADERS                                  │
│                                                                                 │
│  X-RateLimit-Limit: 100        │  RateLimit-Limit: 100                        │
│  X-RateLimit-Remaining: 95     │  RateLimit-Remaining: 95                     │
│  X-RateLimit-Reset: 1640995200 │  RateLimit-Reset: 1640995200                 │
│  X-RateLimit-Warning: ...      │  RateLimit-Policy: 100;w=60                  │
│                                │  Retry-After: 60                             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Core Concepts

**Rate Limiting Fundamentals:**
- **Purpose**: Control request frequency to prevent abuse and ensure fair resource usage
- **Sliding Window**: More accurate than fixed windows, prevents boundary bursts
- **Multiple Rules**: Different limits for different endpoints (global, API, auth, burst)
- **Graduated Response**: Warning headers before blocking, then HTTP 429/423

**Key Design Decisions:**
- **Redis Sorted Sets**: Store request timestamps for precise sliding window calculations
- **Dual-Layer Caching**: Redis primary + in-memory fallback for resilience
- **Asynchronous Processing**: Rate checks are fast, cleanup happens in background
- **Circuit Breaker**: Automatic fallback when Redis fails

### System Flow

```
Request → Middleware → Cache Check → Redis Window → Decision → Response
    ↓         ↓           ↓            ↓          ↓         ↓
  Client   Multiple    Local +      Sorted     Allow/    Headers +
           Rules       Redis        Sets       Block     Status
                                      ↓
                               Background Queue
                               (Cleanup/Reset)
```

**Step-by-Step Process:**
1. **Request arrives** at Express middleware
2. **Rule evaluation** checks all applicable limits simultaneously  
3. **Cache lookup** checks local cache first, then Redis
4. **Sliding window** counts requests in time window using sorted sets
5. **Cleanup** removes expired entries outside window
6. **Decision** allows or blocks based on most restrictive rule
7. **Response** includes RFC-compliant headers
8. **Background jobs** handle async cleanup and resets

### Caching Strategy

**Two-Layer Design:**
- **Layer 1 (Redis)**: Distributed, persistent, sliding window with sorted sets
- **Layer 2 (Memory)**: Local fallback when Redis unavailable, fixed window

**Redis Operations:**
```bash
# Add request timestamp
ZADD rate_limit:key timestamp request_id

# Count requests in window  
ZCOUNT rate_limit:key (now-window) +inf

# Remove expired entries
ZREMRANGEBYSCORE rate_limit:key -inf (now-window)
```

**Fallback Behavior:**
- **Circuit Breaker**: Detects Redis failures (5 consecutive failures)
- **Automatic Fallback**: Switches to in-memory cache
- **Recovery**: Gradually returns to Redis when healthy

### Background Processing

**Why Async Processing?**
- **Fast Response**: Rate checks return immediately, cleanup happens later
- **Memory Optimization**: Removes expired Redis entries to prevent memory bloat
- **Error Recovery**: Handles failed operations without blocking requests

**Queue Types:**
- **Rate Limit Queue**: Handles increments, resets, and reverts
- **Cleanup Queue**: Periodic maintenance and expired entry removal

### Algorithm Deep Dive

**Sliding Window vs Fixed Window:**

*Fixed Window Problem:*
```
Window 1: [0-60s] = 100 requests
Window 2: [60-120s] = 100 requests
Problem: 200 requests possible at 59-61s boundary
```

*Sliding Window Solution:*
```
Any 60s period = Max 100 requests
At time T: Count requests from (T-60s) to T
Result: Smooth distribution, no boundary bursts
```

### Security & Resilience

**Security Measures:**
- **IP Sanitization**: Validates and cleans client IP addresses
- **Key Hashing**: Prevents Redis key collision attacks  
- **Header Injection Protection**: Sanitizes malicious headers
- **Input Validation**: Validates all admin endpoint parameters

**Resilience Features:**
- **Circuit Breaker**: 5 failure threshold, 30s recovery timeout
- **Graceful Degradation**: Falls back to in-memory cache
- **Error Handling**: Comprehensive try-catch with fallbacks
- **Memory Management**: TTL cleanup prevents memory leaks

**Performance Optimizations:**
- **Short-Circuit Evaluation**: Stops at first blocking rule
- **Lua Scripts**: Atomic Redis operations prevent race conditions
- **Connection Pooling**: Efficient Redis connection management
- **Local Caching**: Reduces Redis load for frequent checks

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
- **Limit**: 50 requests per second
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

```bash
# Run comprehensive test suite
npm run test:client

# Run individual tests
node tests/run-all-tests.js
```

## ⚠️ Assumptions & Limitations

**Assumptions:**
- Single Redis instance (not clustered)
- IP-based client identification
- Sliding window algorithm with Redis sorted sets

**Limitations:**
- Requires synchronized clocks across servers
- Redis dependency (mitigated with circuit breaker)
- 1-second minimum window resolution
- No coordination between multiple server instances