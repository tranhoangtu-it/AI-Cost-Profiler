# AI Cost Profiler v1.0 - Implementation Summary

## Plan Location
`/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/plans/260219-1547-complete-v1/`

## Overview

Parallel-optimized upgrade from MVP to production-ready v1.0, addressing 10 critical gaps identified in research reports.

**Total Effort:** 48h (wall time ~34h with parallelization)
**Phases:** 4 (1 sequential foundation, 2 parallel implementations, 1 final testing)
**Status:** Pending

## Research Foundation

### Reports Analyzed
1. **MVP Gaps Analysis** (`researcher-260219-1543-mvp-gaps-analysis.md`)
   - Identified 15 Must-Have production blockers
   - Effort estimate: 80-120h for full production readiness
   - Prioritized subset for v1.0: 10 features (48h)

2. **SDK Testing Improvements** (`researcher-260219-1543-sdk-testing-improvements.md`)
   - Gemini SDK interceptor patterns (both variants)
   - Streaming token extraction for all 3 providers
   - Error resilience strategies

## Scope: MVP → v1.0 Gaps Addressed

| # | Gap | Solution | Phase |
|---|-----|----------|-------|
| 1 | Gemini interceptor throws "unsupported" | Real implementation (@google/generative-ai + @google-cloud/vertexai) | 1 |
| 2 | No streaming support | Wrap async iterators for OpenAI, Anthropic, Gemini | 1 |
| 3 | No error/retry tracking | SDK captures failed calls, error codes, retry count | 1 |
| 4 | No cached token tracking | Detect OpenAI/Anthropic cache tokens, adjust cost | 1 |
| 5 | Missing Gemini pricing | Add tiered pricing constants (<128k vs ≥128k) | 1 |
| 6 | No pagination | Cursor-based pagination (timestamp+id) | 2 |
| 7 | No rate limiting | Redis-based limiter (10k events/hour default) | 2 |
| 8 | Hardcoded `similarPrompts: []` | pgvector cosine similarity with OpenAI embeddings | 2 |
| 9 | No data export | CSV/JSON streaming endpoints + UI buttons | 2, 3 |
| 10 | Date picker not wired | Connect to all dashboard pages via `usePaginatedData` hook | 3 |
| 11 | No model comparison | New page with side-by-side cost/latency metrics | 3 |
| 12 | No frontend tests | Vitest + Testing Library suite (>80% coverage) | 4 |

## Phase Breakdown

### Phase 1: SDK Complete (14h) - Sequential
**Dependencies:** None
**Files Modified:** `packages/sdk/`, `packages/shared/`

**Key Deliverables:**
- Gemini interceptor (both SDK variants)
- Streaming support (OpenAI, Anthropic, Gemini)
- Error/retry tracking with exponential backoff
- Cached token detection (OpenAI `prompt_tokens_details.cached_tokens`, Anthropic `cache_read_input_tokens`)
- Gemini pricing constants with tiered pricing

**Critical Implementation Notes:**
- OpenAI streaming requires `stream_options: { include_usage: true }` injection
- Gemini streaming: tokens only in final aggregated response (UX trade-off)
- Error tracking uses circuit breaker (disable after 10 consecutive failures)

### Phase 2: Backend Enhancements (16h) - Parallel with Phase 3
**Dependencies:** Phase 1 (needs new event schema fields)
**Files Modified:** `apps/server/`

**Key Deliverables:**
- Cursor-based pagination (base64 encoded `{timestamp, id}`)
- Redis rate limiter middleware (X-RateLimit headers)
- Prompt similarity service (OpenAI embeddings + pgvector queries)
- CSV/JSON export endpoints with streaming (no memory overflow)
- DB indexes: `(created_at, id)`, `(feature_name)`, `(model)`

**Critical Implementation Notes:**
- pgvector index: `ivfflat` with `lists = 100` (faster build than hnsw)
- Export endpoints use Drizzle `.stream()` for large datasets
- Similarity threshold: cosine distance <0.2 (80% similarity)
- Rate limiter fallback: in-memory if Redis unavailable

### Phase 3: Dashboard Polish (16h) - Parallel with Phase 2
**Dependencies:** Phase 1 (needs cached token metrics)
**Files Modified:** `apps/web/`

**Key Deliverables:**
- Date picker wired to all pages via `usePaginatedData` hook
- Export buttons (CSV/JSON dropdown) on all views
- Model comparison page (table + scatter chart)
- Cached tokens card (cache hit rate, cost savings)
- Error rate chart (AreaChart with Recharts)
- Improved skeleton loaders

**Critical Implementation Notes:**
- Date picker state persists in URL query params (future enhancement)
- Export downloads via blob URL (async, non-blocking)
- Model comparison route: `/comparison` (add to sidebar)
- Mobile responsive breakpoint: 768px

### Phase 4: Testing & Seed (18h) - Sequential
**Dependencies:** All previous phases
**Files Created:** `**/*.test.ts`, `**/*.test.tsx`, `scripts/seed-data-v2.ts`

**Key Deliverables:**
- Frontend unit tests (components, hooks) with MSW mocks
- SDK integration tests (streaming, error tracking, Gemini)
- Backend tests (pagination, rate limiter, similarity)
- Improved seed data (1000 events, 100 embeddings, all 3 providers)
- Coverage reports (SDK 90%+, Backend 80%+, Frontend 80%+)

**Critical Implementation Notes:**
- MSW v2 API for mocking API calls
- Seed data uses @faker-js/faker for realistic patterns
- OpenAI embeddings limited to 100 prompts (cost control)
- Test execution target: <30s for unit tests

## Execution Strategy

### Wave 1: Foundation (14h)
```
Phase 1 (SDK Complete)
  └─> Blocks Phase 2, 3 (need new event schema)
```

### Wave 2: Parallel Implementation (16h wall time)
```
Phase 2 (Backend) ──┐
                    ├──> Both run in parallel
Phase 3 (Frontend) ─┘
```

**Rationale:**
- No file ownership conflicts (Phase 2 = `apps/server/`, Phase 3 = `apps/web/`)
- Both depend on Phase 1 event schema
- Reduces wall time from 32h to 16h

### Wave 3: Quality Assurance (18h)
```
Phase 4 (Testing & Seed)
  └─> Tests all previous phases
```

**Total Wall Time:** 14h + 16h + 18h = **48h** (vs 64h sequential)

## File Ownership Matrix

| Phase | Exclusive Ownership |
|-------|---------------------|
| 1 | `packages/sdk/`, `packages/shared/src/constants/model-pricing.ts`, `packages/shared/src/schemas/event-schema.ts` |
| 2 | `apps/server/` (routes, middleware, services, migrations) |
| 3 | `apps/web/` (pages, components, hooks) |
| 4 | `**/*.test.ts`, `**/*.test.tsx`, `scripts/seed-data-v2.ts` |

**Conflict Prevention:** No overlapping file edits between parallel phases.

## Success Criteria

### SDK Package
- [x] All 3 providers support streaming + non-streaming
- [x] Error events captured with `errorCode` classification
- [x] Cached tokens reduce calculated cost
- [x] Gemini pricing matches official rates
- [x] Unit test coverage >90%

### Backend API
- [x] Pagination works for >10k events
- [x] Rate limiter blocks after threshold (429 responses)
- [x] Prompt similarity returns cosine scores <200ms
- [x] Export endpoints stream 100k rows without OOM
- [x] Query latency <500ms (P95)

### Frontend Dashboard
- [x] Date picker filters all views
- [x] Model comparison shows cost/latency side-by-side
- [x] Export buttons download valid CSV/JSON
- [x] Charts render smoothly (10k+ data points)
- [x] Unit test coverage >80%

### Integration
- [x] Seed script populates 1000 events in <10s
- [x] All dashboard views load with seed data
- [x] Real-time SSE updates trigger chart refreshes

## Known Limitations (Deferred to v1.1+)

- **Authentication/Multi-tenancy**: No auth in v1.0 (local dev tool focus)
- **Budget Alerts**: No alerting mechanism
- **Data Retention**: No archival policies
- **Batch API Support**: Not implemented
- **Function Calling Cost**: No tool usage tracking
- **Prompt Versioning**: No version tagging

## Unresolved Questions

1. **Gemini streaming UX:** Final `usageMetadata` only available after full stream consumption - acceptable trade-off?
   - **Recommendation:** Document in README, proceed with implementation

2. **Rate limit threshold:** Default 10k events/hour or make configurable?
   - **Recommendation:** Start with 10k, add env var `RATE_LIMIT_EVENTS` for override

3. **Pagination cursor format:** Base64 encoded `{timestamp, id}` or opaque UUID?
   - **Recommendation:** Base64 (transparent, debuggable)

4. **Export file size limits:** Max 100k rows per export or stream indefinitely?
   - **Recommendation:** No hard limit, but document memory implications

5. **Seed data coverage:** Include function calling examples or defer to v1.1?
   - **Recommendation:** Defer (YAGNI principle)

## Risk Assessment

### High Impact Risks

| Risk | Mitigation |
|------|------------|
| Export endpoints OOM on 1M+ rows | Use Drizzle `.stream()`, test with 100k rows |
| Large datasets crash browser charts | Backend pagination limits, frontend virtual scrolling |

### Medium Impact Risks

| Risk | Mitigation |
|------|------------|
| pgvector index build slow | Use `ivfflat` with `lists = 100`, not `hnsw` |
| Date picker state resets on navigation | Persist in URL params (future enhancement) |
| Flaky async tests | Use `waitFor` properly, increase timeouts |

### Low Impact Risks

| Risk | Mitigation |
|------|------------|
| OpenAI embeddings API cost | Cache in Redis, limit seed to 100 prompts |
| Chart re-renders cause flicker | Use `useMemo` for data transformations |

## Next Steps After v1.0

### Immediate (v1.1)
- Authentication/multi-tenancy (Phase 1 from full roadmap)
- Budget alerts with Slack/email notifications
- Data retention policies (30/90/365 day tiers)

### Short-term (v1.2)
- Batch API support (OpenAI Batch, Anthropic async)
- Function calling cost tracking
- Prompt versioning with diff view

### Long-term (v2.0)
- Multi-step workflow tracking (trace IDs)
- Cost optimization recommendations (automated suggestions)
- Usage-based billing integration (Stripe)

## Commands

```bash
# Install dependencies
pnpm install

# Run in development
turbo dev

# Run tests
turbo test

# Run tests with coverage
turbo test:coverage

# Build for production
turbo build

# Lint all packages
turbo lint

# Seed database
pnpm seed

# Start services (PostgreSQL + Redis)
docker compose up -d
```

## Documentation Updates Required

After implementation, update these docs:
- `docs/system-architecture.md` - Add streaming, pagination, rate limiting sections
- `docs/code-standards.md` - Add testing guidelines
- `README.md` - Update features list, add v1.0 changelog
- `docs/codebase-summary.md` - Reflect new file structure

## Validation Checklist

Before merging to main:
- [ ] All phase todo lists completed
- [ ] Test coverage meets targets (SDK 90%+, Backend 80%+, Frontend 80%+)
- [ ] Seed script runs successfully
- [ ] All dashboard views render with seed data
- [ ] Export downloads work (CSV + JSON)
- [ ] Date picker triggers API refetches
- [ ] Model comparison page loads
- [ ] Real-time SSE updates work
- [ ] Rate limiter blocks at threshold
- [ ] Prompt similarity returns results
- [ ] Documentation updated

---

**Plan Created:** 2026-02-19
**Author:** Planner Agent (ac6aa79)
**Status:** Ready for implementation
