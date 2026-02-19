---
title: "AI Cost Profiler v1.0 Complete"
description: "MVP to production-ready upgrade with streaming, Gemini, pagination, testing"
status: completed
priority: P1
effort: 48h
branch: main
tags: [v1, production-ready, streaming, gemini, testing, pagination]
created: 2026-02-19
---

# AI Cost Profiler v1.0 - Complete Implementation Plan

## Dependency Graph

```
Phase 1 (SDK Complete)
   |
   +---> Phase 2 (Backend Enhancements)
   |          |
   +----------+---> Phase 3 (Dashboard Polish)
                         |
                         v
                    Phase 4 (Testing & Seed)
```

## Execution Strategy

| Wave | Phases | Parallel? | Est. |
|------|--------|-----------|------|
| 1 | Phase 1: SDK Complete | Sequential | 14h |
| 2 | Phase 2 + Phase 3 | **Parallel** | 16h |
| 3 | Phase 4: Testing & Seed | Sequential | 18h |

**Total:** 48h (3 parallel phases reduce wall time from 48h to ~34h)

## Phase Status

- [x] [Phase 1: SDK Complete](./phase-01-sdk-complete.md) - Gemini, streaming, errors, caching
- [x] [Phase 2: Backend Enhancements](./phase-02-backend-enhancements.md) - Pagination, rate limit, similarity, export
- [x] [Phase 3: Dashboard Polish](./phase-03-dashboard-polish.md) - Date picker wiring, export UI, model comparison
- [x] [Phase 4: Testing & Seed](./phase-04-testing-seed.md) - Frontend tests, improved seed, integration tests

## File Ownership Matrix

| Phase | Owns (exclusive) |
|-------|------------------|
| 1 | `packages/sdk/`, `packages/shared/src/constants/model-pricing.ts`, `packages/shared/src/schemas/event-schema.ts` |
| 2 | `apps/server/` (all API routes, middleware, services), DB schema updates |
| 3 | `apps/web/` (pages, components, hooks), UI-only changes |
| 4 | `**/*.test.ts`, `**/*.test.tsx`, `scripts/seed-data.ts`, integration test files |

## Key Improvements Over MVP

### SDK Package
- ✅ Gemini interceptor (both @google/generative-ai + @google-cloud/vertexai)
- ✅ Streaming support (OpenAI, Anthropic, Gemini)
- ✅ Error/retry tracking
- ✅ Cached token detection (OpenAI, Anthropic)
- ✅ Gemini pricing constants

### Backend API
- ✅ Cursor-based pagination
- ✅ Rate limiting middleware (Redis)
- ✅ Prompt similarity endpoint (pgvector embeddings)
- ✅ CSV/JSON export endpoints
- ✅ Query performance (indexes, optimized queries)

### Dashboard
- ✅ Date picker wired to all views
- ✅ Model comparison table
- ✅ Export buttons (CSV/JSON)
- ✅ Cached token metrics
- ✅ Error rate charts
- ✅ Improved tooltips and loading states

### Testing
- ✅ Frontend unit tests (Vitest + Testing Library)
- ✅ SDK integration tests (mocked HTTP)
- ✅ Improved seed data (all 3 providers, realistic patterns)

## MVP Gaps Addressed

| Gap | Solution | Phase |
|-----|----------|-------|
| Gemini interceptor throws "unsupported" | Real implementation for both SDK variants | 1 |
| No streaming support | Wrap async iterators for all 3 providers | 1 |
| Date picker not wired | Connect useTimeRange to analytics API calls | 3 |
| Hardcoded `similarPrompts: []` | pgvector cosine similarity queries | 2 |
| No pagination | Cursor-based pagination + limit params | 2 |
| No rate limiting | Redis-based rate limiter middleware | 2 |
| No data export | CSV/JSON endpoints + UI download buttons | 2, 3 |
| No error tracking | SDK captures failed calls, retries, error codes | 1 |
| Missing Gemini pricing | Add to model-pricing.ts constants | 1 |
| No frontend tests | Vitest test suite for components/hooks | 4 |

## Success Criteria

### SDK
- [ ] All 3 providers support streaming + non-streaming
- [ ] Error events captured with retry count
- [ ] Cached tokens reduce calculated cost
- [ ] Gemini pricing matches official rates
- [ ] Unit test coverage >90%

### Backend
- [ ] Pagination works for >10k events
- [ ] Rate limiter blocks after threshold
- [ ] Prompt similarity returns real cosine scores
- [ ] Export endpoints stream large datasets
- [ ] Query latency <500ms (95th percentile)

### Frontend
- [ ] Date picker filters all dashboard views
- [ ] Model comparison shows cost/latency side-by-side
- [ ] Export buttons download valid CSV/JSON
- [ ] Charts render without errors
- [ ] Unit test coverage >80%

### Integration
- [ ] Seed script populates realistic demo data
- [ ] All dashboard views load with seed data
- [ ] Real-time SSE updates trigger chart refreshes

## Known Limitations (Deferred to v1.1+)

- Authentication/multi-tenancy (deferred per MVP validation)
- Budget alerts and forecasting
- Data retention policies
- Batch API support
- Function calling cost tracking
- Prompt versioning

## Unresolved Questions

1. **Gemini streaming token lag:** Final `usageMetadata` only available after full stream consumption - acceptable UX trade-off?
2. **Rate limit threshold:** Default to 10k events/hour or make configurable?
3. **Pagination cursor format:** Use base64 encoded timestamp+id or opaque UUID?
4. **Export file size limits:** Max 100k rows per export or stream indefinitely?
5. **Seed data coverage:** Include function calling examples or defer to v1.1?
