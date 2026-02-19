# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Cost Profiler - LLM cost analysis tool. TypeScript monorepo (Turborepo + pnpm).

## Architecture

- `packages/shared` - Zod schemas, types, model pricing (16 models), cost calculator, ID generator
- `packages/sdk` - `profileAI()` wrapper for OpenAI/Anthropic (Proxy pattern), EventBatcher
- `apps/server` - Express API: event ingestion, analytics, SSE streaming (PostgreSQL + Redis)
- `apps/web` - Next.js 14 dashboard: Recharts, Visx treemap, d3-flame-graph

## Commands

```bash
docker compose up -d          # PostgreSQL + Redis
pnpm install                  # Install deps
npx turbo build               # Build all (shared → sdk → server → web)
npx turbo dev                 # Dev servers (server:3100, web:3000)
npx turbo test                # Run all tests (102 Vitest tests)
pnpm seed                     # Seed 600 demo events
pnpm test:smoke               # SDK → Server smoke test
```

## Key Patterns

- Pricing is per 1M tokens (`inputPer1M`/`outputPer1M`), NOT per 1K
- Provider enum: `'openai' | 'anthropic' | 'google-gemini'`
- API routes use `/api/v1/` prefix
- `createApp()` factory in server (not exported `app` instance)
- All `sql.raw()` usage is whitelist-guarded against SQL injection
