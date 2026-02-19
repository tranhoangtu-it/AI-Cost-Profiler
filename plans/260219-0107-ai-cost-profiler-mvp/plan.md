---
title: "AI Cost Profiler MVP"
description: "Parallel-optimized implementation plan for monorepo SDK + dashboard MVP"
status: completed
priority: P1
effort: 32h
branch: main
tags: [mvp, monorepo, sdk, dashboard, analytics]
created: 2026-02-19
---

# AI Cost Profiler MVP - Implementation Plan

## Dependency Graph

```
Phase 1 (Foundation)
   |
   +---> Phase 2a (Shared Pkg) --+--> Phase 3a (SDK)
   |                              +--> Phase 3b (Backend API)
   +---> Phase 2b (DB Schema)  --+--> Phase 3b (Backend API)
   |                              |
   +------------------------------+--> Phase 4a (Dashboard Layout)
                                  +--> Phase 4b (Visualization Views)
                                       |
                                       v
                                  Phase 5 (Integration)
                                       |
                                       v
                                  Phase 6 (Testing)
```

## Execution Strategy

| Wave | Phases | Parallel? | Est. |
|------|--------|-----------|------|
| 1 | Phase 1 | Sequential | 3h |
| 2 | Phase 2a + 2b | Parallel | 3h |
| 3 | Phase 3a + 3b | Parallel | 6h |
| 4 | Phase 4a + 4b | Parallel | 8h |
| 5 | Phase 5 | Sequential | 4h |
| 6 | Phase 6 | Sequential | 4h |

## Phase Status

- [x] [Phase 1: Monorepo Foundation](./phase-01-monorepo-foundation.md)
- [x] [Phase 2a: Shared Package](./phase-02a-shared-package.md)
- [x] [Phase 2b: Database Schema](./phase-02b-database-schema.md)
- [x] [Phase 3a: SDK Package](./phase-03a-sdk-package.md)
- [x] [Phase 3b: Backend API](./phase-03b-backend-api.md)
- [x] [Phase 4a: Dashboard Layout](./phase-04a-dashboard-layout.md)
- [x] [Phase 4b: Visualization Views](./phase-04b-visualization-views.md)
- [x] [Phase 5: Integration & Wiring](./phase-05-integration-wiring.md)
- [x] [Phase 6: Testing](./phase-06-testing.md)

## File Ownership Matrix

| Phase | Owns (exclusive) |
|-------|------------------|
| 1 | Root configs: `turbo.json`, `tsconfig.base.json`, `package.json`, `.eslintrc.js`, `.prettierrc`, `docker-compose.yml`, `.gitignore`, `.env.example` |
| 2a | `packages/shared/` (all files) |
| 2b | `apps/server/src/db/` (schema, config, migrations, connection) |
| 3a | `packages/sdk/` (all files) |
| 3b | `apps/server/` except `src/db/` |
| 4a | `apps/web/` layout, components, lib, root configs |
| 4b | `apps/web/app/(dashboard)/` page files, chart components |
| 5 | `scripts/`, wiring edits (marked in phase) |
| 6 | `**/*.test.ts` across all packages |

## Validation Log

### Session 1 — 2026-02-19
**Trigger:** Initial plan creation validation
**Questions asked:** 6

#### Questions & Answers

1. **[Scope]** SDK nên hỗ trợ những LLM provider nào trong MVP?
   - Options: OpenAI + Anthropic (Recommended) | OpenAI only | OpenAI + Anthropic + Google Gemini
   - **Answer:** OpenAI + Anthropic + Google Gemini
   - **Rationale:** Adds ~2h effort to Phase 3a. Need Gemini interceptor + tokenizer.

2. **[Architecture]** Backend có cần authentication/API key cho MVP không?
   - Options: No auth for MVP (Recommended) | Simple API key auth | Project-based auth
   - **Answer:** No auth for MVP
   - **Rationale:** Local dev tool, auth deferred. Simplifies Phase 3b.

3. **[Scope]** Dashboard nên dùng mock/seed data hay yêu cầu real LLM calls để demo?
   - Options: Seed script with realistic fake data (Recommended) | Require real LLM calls | Both
   - **Answer:** Seed script with realistic fake data
   - **Rationale:** Demo without API keys. Phase 5 creates seed script.

4. **[Scope]** Prompt bloat detection implement đầy đủ trong MVP hay chỉ basic metrics?
   - Options: Basic metrics only (Recommended) | Full detection with similarity | Skip for MVP
   - **Answer:** Full detection with similarity
   - **Rationale:** Adds pgvector extension + OpenAI embeddings. Affects Phase 2b (DB) and Phase 3b (backend).

5. **[Architecture]** Dùng gì cho embedding-based prompt similarity?
   - Options: OpenAI Embeddings + pgvector (Recommended) | Local embedding model | Hash-based dedup only
   - **Answer:** OpenAI Embeddings + pgvector
   - **Rationale:** PostgreSQL pgvector for cosine similarity. Needs OpenAI API key for embedding calls.

6. **[Architecture]** Google Gemini SDK: @google/generative-ai hay @google-cloud/vertexai?
   - Options: @google/generative-ai (Recommended) | @google-cloud/vertexai | Support cả hai
   - **Answer:** Support cả hai
   - **Rationale:** Auto-detect client type. More complex interceptor but wider compatibility.

#### Confirmed Decisions
- 3 LLM providers (OpenAI, Anthropic, Gemini) — broader market coverage
- No auth in MVP — local dev tool focus
- Seed data for demo — zero API key required for dashboard demo
- Full prompt similarity with pgvector — differentiating feature
- Both Gemini SDKs supported — auto-detect pattern

#### Action Items
- [ ] Phase 2a: Add Gemini model pricing constants
- [ ] Phase 2b: Add pgvector extension, prompt_embeddings table
- [ ] Phase 3a: Add Gemini interceptor (both SDK variants), update effort to 6h
- [ ] Phase 3b: Add embedding generation service (OpenAI embeddings API call), update prompt analysis logic
- [ ] Phase 1: Add pgvector to Docker Compose postgres image

#### Impact on Phases
- Phase 1: Docker Compose needs `pgvector/pgvector:pg16` image instead of `postgres:16-alpine`
- Phase 2a: Add `google-gemini` to provider enum, add Gemini model pricing
- Phase 2b: Add `prompt_embeddings` table with vector column, enable pgvector extension in migration
- Phase 3a: Add Gemini interceptor module, support both @google/generative-ai and @google-cloud/vertexai. Effort increases from 4h to 6h
- Phase 3b: Add embedding generation in event processing pipeline (async), call OpenAI embeddings API for prompt text
