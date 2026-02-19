# Tech Stack

## Monorepo Structure

**Tool**: Turborepo - handles caching, task orchestration, dependency graph across packages.

```
ai-cost-profiler/
├── apps/
│   ├── web/              # Next.js 14 dashboard (App Router)
│   └── server/           # Express API server
├── packages/
│   ├── sdk/              # TypeScript instrumentation SDK
│   ├── shared/           # Shared types, constants, utils
│   └── ui/               # Shared UI components (shadcn/ui based)
├── turbo.json
├── package.json          # pnpm workspaces root
└── tsconfig.base.json
```

**Package manager**: pnpm (workspace support, disk efficient, strict by default).

## Core Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **SDK** | TypeScript library | Wraps OpenAI/Anthropic/etc. clients; intercepts calls, captures tokens/latency/cost |
| **Backend** | Node.js + Express + TS | Fast iteration, shared types with SDK/frontend, streaming support |
| **Frontend** | Next.js 14 (App Router) | SSR for initial load, React Server Components, API routes as BFF |
| **UI Components** | shadcn/ui + Tailwind CSS | Copy-paste components, no library lock-in, highly customizable |
| **Visualizations** | Visx (D3 wrapper) | React-native D3 bindings for flamegraphs, treemaps, Sankey, waterfall |
| **State/Fetching** | TanStack Query | Caching, background refetch, SSE integration, optimistic updates |
| **Database** | PostgreSQL | JSONB for flexible event data, window functions for analytics, mature |
| **ORM** | Drizzle | Type-safe, lightweight, SQL-like API, good migration story |
| **Cache/Pub-Sub** | Redis | SSE fan-out, rate limiting, real-time cost counters, session cache |
| **Real-time** | SSE (Server-Sent Events) | Simpler than WebSocket for one-way dashboard updates; 1-5s refresh |

## Key Dependencies

### SDK (`packages/sdk`)
- `tiktoken` - OpenAI token counting (local, fast)
- `@anthropic-ai/tokenizer` - Anthropic token counting
- `uuid` - Event/trace IDs

### Server (`apps/server`)
- `express` + `cors` + `helmet` - HTTP server with security defaults
- `drizzle-orm` + `drizzle-kit` + `pg` - PostgreSQL ORM + migrations
- `ioredis` - Redis client
- `zod` - Request validation
- `pino` - Structured logging

### Web (`apps/web`)
- `next` (v14) - Framework
- `@visx/*` - Visualization primitives (hierarchy, shape, scale, axis)
- `d3-flame-graph` - Flamegraph rendering
- `d3-sankey` - Cost flow diagrams
- `@tanstack/react-query` - Server state management
- `tailwindcss` + `shadcn/ui` - Styling + components
- `recharts` - Simple charts (bar, line, pie) where Visx is overkill

### Shared (`packages/shared`)
- `zod` - Schema definitions shared between SDK/server/web
- `typescript` - Shared type definitions

## Development Tooling

| Tool | Purpose |
|------|---------|
| **TypeScript 5.x** | Strict mode across all packages |
| **Vitest** | Unit + integration tests (fast, ESM-native, workspace support) |
| **Playwright** | E2E tests for dashboard (MVP: skip, add later) |
| **ESLint** | Linting with `@typescript-eslint` |
| **Prettier** | Code formatting |
| **lint-staged + husky** | Pre-commit hooks (lint + format) |
| **Docker Compose** | Local PostgreSQL + Redis |
| **tsx** | Dev server runner (fast TS execution) |
| **turbo** | `turbo dev`, `turbo build`, `turbo test`, `turbo lint` |

## Build & Run Commands

```bash
pnpm install            # Install all deps
turbo dev               # Start all apps in dev mode
turbo build             # Build all packages + apps
turbo test              # Run all tests
turbo lint              # Lint all packages
turbo db:push           # Push schema to DB (Drizzle)
turbo db:migrate        # Run migrations
docker compose up -d    # Start PostgreSQL + Redis locally
```

## MVP Scope Boundaries

**In scope**: SDK wrapper (OpenAI + Anthropic), event ingestion API, cost dashboard, flamegraph view, prompt bloat detection, per-feature cost breakdown.

**Deferred**: Multi-tenant auth, billing, proxy mode, custom model pricing, Playwright E2E, CI/CD pipeline, deployment infra.
