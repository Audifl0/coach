# Stack Research

**Domain:** AI virtual bodybuilding coach web app (greenfield, VPS-hosted)
**Researched:** 2026-03-04
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 24.14.0 LTS | Runtime for app + jobs | Stable LTS line, modern performance, and strong ecosystem support for AI/web workloads. |
| Next.js | 16.1.6 | Full-stack web framework (UI + API routes + server actions) | Fast path for shipping one deployable artifact on VPS, strong DX, and mature React integration. |
| React | 19.2.4 | UI layer | Current stable React line with strong framework support and broad library compatibility. |
| PostgreSQL | 18.3 | System of record (users, plans, logs, progression) | Best fit for relational coaching data, transactional safety, and robust analytics querying. |
| pgvector | 0.8.1 | Embeddings and similarity search inside Postgres | Avoids a separate vector database in V1 while keeping semantic retrieval available. |
| Prisma ORM | 7.4.2 | Type-safe DB access + migrations | Fast iteration for greenfield product, good TypeScript ergonomics, reliable migration workflow. |
| OpenAI Node SDK | 6.25.0 | LLM integration for plan generation/adaptation | Official SDK, actively maintained, straightforward integration with server-side Node code. |

### Infrastructure

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Docker Engine (Moby) | 29.1.2 | Container runtime on VPS | Standardized deploy/runtime model, easy rollback, reproducible environments. |
| Docker Compose | 5.0.1 | Multi-service orchestration on one VPS | Simplest production setup for app + Postgres + Redis + proxy without Kubernetes overhead. |
| Caddy | 2.10.2 | Reverse proxy + automatic TLS | Lower operational burden than manual Nginx+Certbot management; secure-by-default TLS automation. |
| Redis | 8.4.0 | Queue, caching, and rate-limit primitives | Reliable low-latency state for background adaptation jobs and session/cache acceleration. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 4.3.6 | Runtime validation of inputs/AI outputs | Use on every external boundary (forms, APIs, model responses). |
| React Hook Form | 7.71.2 | Form state and validation performance | Use for onboarding/profile/training log forms. |
| @tanstack/react-query | 5.90.21 | Server-state caching and sync | Use for dashboard timelines, history lists, and optimistic updates. |
| BullMQ | 5.70.1 | Job queue on Redis | Use for delayed/scheduled adaptation and non-blocking AI tasks. |
| pino | 10.3.1 | Structured logging | Use across app and workers for production debugging/observability. |
| vitest | 4.0.18 | Unit/integration tests | Use for service logic, recommendation rules, and API contract tests. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| pnpm | Fast, disk-efficient package management | Prefer workspace-friendly installs and deterministic lockfile commits. |
| ESLint + TypeScript strict mode | Static quality gates | Keep strict TS enabled from day 1 to reduce model/data-shape defects. |
| Docker-based local dev | Parity with VPS runtime | Run Postgres/Redis/proxy locally in Compose to prevent env drift. |

## Installation

```bash
# Core app
pnpm add next@16.1.6 react@19.2.4 react-dom@19.2.4 typescript@5.9.3

# Data + AI
pnpm add prisma@7.4.2 @prisma/client@7.4.2 pg@8.19.0 pgvector@0.2.1 openai@6.25.0

# App support
pnpm add zod@4.3.6 react-hook-form@7.71.2 @tanstack/react-query@5.90.21 bullmq@5.70.1 pino@10.3.1

# Dev/test
pnpm add -D vitest@4.0.18 @types/node
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Web framework | Next.js 16 | Nuxt 4 / SvelteKit | Strong options, but weaker alignment with chosen TS+Node+AI tooling and team ecosystem assumptions here. |
| ORM | Prisma 7 | Drizzle ORM | Drizzle is excellent, but Prisma gives faster schema/migration velocity for this V1 roadmap. |
| Queue | BullMQ + Redis | Postgres-only queue (pg-boss/graphile-worker) | Postgres queues are viable, but Redis queueing gives better latency and job control under bursty AI workloads. |
| Proxy/TLS | Caddy | Nginx + Certbot | Nginx is powerful but adds certificate lifecycle and config complexity for solo VPS operation. |
| Vector store | pgvector in Postgres | Dedicated vector DB (Qdrant/Weaviate/Pinecone) | Extra operational surface area too early; split only when retrieval scale requires it. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `middleware.ts` as primary boundary in new Next.js 16 code | Deprecated path in v16 direction; will create migration churn | `proxy.ts` for request boundary logic |
| MongoDB as primary DB for V1 | Coaching domain is relational and transactional; harder analytics joins and consistency patterns | PostgreSQL 18.3 |
| Separate Python microservice for first release | Unnecessary distributed-system complexity for a single VPS product | Single Node/Next.js deploy, split later only if bottleneck appears |
| Kubernetes on day one | Ops overhead disproportionate to single-product VPS scope | Docker Compose with clear service boundaries |
| Redis Stack 7.x for new builds | Redis 8 integrates prior module capabilities and newer performance profile | Redis 8.4.0 OSS |
| Blind end-to-end AI automation of plan edits | Safety/reliability risk for training recommendations | AI-assisted recommendations + explicit user validation |

## Stack Patterns by Variant

**If this stays a personal/low-concurrency app (<100 daily active users):**
- Keep single VPS, one Postgres instance, one Redis instance, one worker process.
- Disable nonessential background pipelines; run only adaptation + notification jobs.

**If usage grows (multi-tenant, >1k daily active users):**
- Split app and worker into separate services, add read replicas for Postgres, and isolate Redis for queue vs cache.
- Add object storage + CDN for media and keep app nodes stateless.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.1.6` | `react@19.2.4`, `react-dom@19.2.4`, Node `>=20.9` (using Node 24.14.0 LTS recommended) | Align framework/runtime to avoid edge runtime and routing regressions. |
| `prisma@7.4.2` | `@prisma/client@7.4.2`, `pg@8.19.0`, PostgreSQL `18.x` | Keep Prisma CLI/client versions in lockstep. |
| `bullmq@5.70.1` | Redis `8.x` | Pin Redis major and monitor queue behavior after Redis upgrades. |
| `pgvector@0.8.1` (DB extension) | PostgreSQL `13+` (using `18.3`) | Enable extension per database and track ANN index settings explicitly. |

## Sources

- Node.js releases: https://nodejs.org/en/about/previous-releases
- Next.js 16 release: https://nextjs.org/blog/next-16
- Next.js installation/runtime notes: https://nextjs.org/docs/app/getting-started/installation
- PostgreSQL release archive (18.3 current patch listed): https://www.postgresql.org/docs/release/
- Redis 8 GA announcement: https://redis.io/blog/redis-8-ga/
- Redis GitHub releases (8.4.0 latest listed): https://github.com/redis/redis
- Caddy releases: https://github.com/caddyserver/caddy/releases
- Docker Engine (Moby) releases: https://github.com/moby/moby/releases
- Docker Compose releases: https://github.com/docker/compose/releases
- npm registry package versions verified on 2026-03-04:
  - https://www.npmjs.com/package/next
  - https://www.npmjs.com/package/react
  - https://www.npmjs.com/package/typescript
  - https://www.npmjs.com/package/prisma
  - https://www.npmjs.com/package/@prisma/client
  - https://www.npmjs.com/package/openai
  - https://www.npmjs.com/package/zod
  - https://www.npmjs.com/package/react-hook-form
  - https://www.npmjs.com/package/@tanstack/react-query
  - https://www.npmjs.com/package/bullmq
  - https://www.npmjs.com/package/pino
  - https://www.npmjs.com/package/vitest
- pgvector project/readme (0.8.1 tags/install examples): https://github.com/pgvector/pgvector

---
*Stack research for: AI virtual bodybuilding coach web app on VPS*
*Researched: 2026-03-04*
