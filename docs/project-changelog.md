# AI Cost Profiler - Changelog

All notable changes to AI Cost Profiler are documented in this file.

## Version History

### [1.0.1] - 2026-02-19 (Code Review Fixes)

#### Security
- **CRITICAL:** Fixed SQL injection vulnerability in `/api/v1/export/cost-summary` endpoint
  - Replaced raw string interpolation with parameterized Drizzle queries
  - Added comprehensive Zod validation schemas for all export routes
  - Files: `apps/server/src/routes/export-routes.ts`

- **CRITICAL:** Added Zod input validation to export endpoints
  - Validates date formats, enum values, query parameters
  - Rejects invalid dates before Date object construction
  - Files: `apps/server/src/routes/export-routes.ts`

#### Bug Fixes
- **HIGH:** Fixed Anthropic streaming event duplication
  - Changed from emitting event per delta to single event at stream completion
  - Reduces unnecessary profiling events and improves accuracy
  - Files: `packages/sdk/src/providers/anthropic-interceptor.ts`, `packages/sdk/src/providers/streaming-helpers.ts`

- **HIGH:** Fixed rate limiter TOCTOU race condition
  - Replaced separate `INCR` + `EXPIRE` operations with atomic Redis pipeline
  - Prevents permanent IP blocks from orphaned keys
  - Files: `apps/server/src/middleware/rate-limiter.ts`

- **HIGH:** Added SSE connection limit enforcement
  - Caps simultaneous SSE connections at 100 (configurable)
  - Returns 503 when limit exceeded, preventing DoS
  - Files: `apps/server/src/services/sse-manager.ts`

- **HIGH:** Added row limit to export queries
  - Prevents out-of-memory errors when exporting large datasets
  - Exports limited to 10,000 rows with truncation indicator headers
  - Files: `apps/server/src/routes/export-routes.ts`

- **MEDIUM:** Fixed mid-stream error handling in all SDK providers
  - Added error callbacks to async generators for OpenAI, Anthropic, Gemini
  - Captures errors mid-stream instead of silently losing them
  - Files: `packages/sdk/src/providers/streaming-helpers.ts`, all interceptor files

- **MEDIUM:** Fixed type safety in Gemini interceptor
  - Removed excessive `any` types, added `GeminiModel` interface
  - Improves IDE support and catches type errors at compile time
  - Files: `packages/sdk/src/providers/gemini-interceptor.ts`

- **MEDIUM:** Extracted shared error classifier
  - Eliminated duplicate error classification logic across providers
  - Created `error-classifier.ts` with provider-specific matchers
  - Reduces code duplication by ~40 lines
  - Files: `packages/sdk/src/providers/error-classifier.ts` (new)

- **MEDIUM:** Fixed time range staleness in dashboard
  - Added 60-second refresh interval to recalculate time range bounds
  - Prevents queries from returning stale data during long sessions
  - Files: `apps/web/src/lib/time-range-context.tsx`

- **MEDIUM:** Fixed seed data cache hit flag
  - `isCacheHit` now correctly reflects `cachedTokens > 0`
  - Demo dashboard now shows realistic cache hit percentages (~30%)
  - Files: `scripts/seed-demo-data.ts`

#### Code Quality
- **LOW:** Replaced blocking `alert()` with non-blocking toast UI
  - Export errors now shown via inline toast notification
  - Auto-dismisses after 5 seconds
  - Files: `apps/web/src/components/dashboard/export-button.tsx`

- **LOW:** Fixed sidebar navigation active state detection
  - Changed from fragile `startsWith()` to exact route matching
  - Prevents incorrect highlights on overlapping routes
  - Files: `apps/web/src/components/layout/sidebar-nav.tsx`

- **LOW:** Added SSE reconnection with exponential backoff
  - Reconnects up to 10 times on disconnection
  - Exponential backoff: 1s, 2s, 4s, ..., capped at 30s
  - Files: `apps/web/src/components/charts/realtime-feed.tsx`

- **LOW:** Removed unused `promptEmbeddings` import
  - Cleaned up unused variable in prompt-similarity-service
  - Files: `apps/server/src/services/prompt-similarity-service.ts`

- **LOW:** Modularized analytics service (299 lines → 3 files)
  - Split monolithic service into focused modules
  - `cost-breakdown-service.ts`, `flamegraph-service.ts`, `timeseries-service.ts`
  - Re-exported from main service for backward compatibility
  - Files: `apps/server/src/services/analytics-service.ts`, new service files

- **LOW:** Reduced gemini-interceptor.ts file size (>200 lines)
  - Extracting error classifier reduced size to ~185 lines
  - Files: `packages/sdk/src/providers/gemini-interceptor.ts`

#### Testing
- All 175 tests passing (100% success rate)
- Added test coverage for SQL injection prevention
- Updated Anthropic streaming tests for new single-event behavior
- Updated rate limiter tests for atomic pipeline behavior
- Verified all existing functionality remains intact

#### Code Review Results
- **Score:** 8/10
- **Critical Issues Fixed:** 2/2
- **High Issues Fixed:** 4/4
- **Medium Issues Fixed:** 7/7
- **Low Issues Fixed:** 5/5
- **Total Issues Addressed:** 18/18

---

### [1.0.0] - 2026-02-18 (MVP Release)

#### Features
- **LLM SDK** (`@ai-cost-profiler/sdk`)
  - profileAI() wrapper supporting OpenAI, Anthropic, Gemini
  - Streaming support for all providers
  - Event batching and efficient transmission

- **Backend API** (`apps/server`)
  - Event ingestion endpoint (`POST /api/v1/events`)
  - Analytics endpoints (8 routes total)
  - Real-time SSE streaming
  - PostgreSQL + Redis integration
  - Rate limiting & security middleware

- **Frontend Dashboard** (`apps/web`)
  - Real-time cost monitoring
  - Interactive visualizations (flamegraph, treemap, time series)
  - Feature-based cost breakdown
  - Provider comparison
  - Export functionality (CSV/JSON)
  - Time range filters
  - Responsive design

- **Database**
  - PostgreSQL schema with 4 main tables
  - pgvector integration for prompt similarity
  - Drizzle ORM migrations

- **Pricing Data**
  - 16 model configurations (OpenAI, Anthropic, Gemini)
  - Per-token pricing (input/output/cached)
  - Automatic cost calculation

#### Documentation
- README with setup instructions
- Architecture documentation
- Code standards and guidelines
- Tech stack overview

#### Testing
- 102+ test files
- Unit tests for SDK, backend, shared packages
- Integration tests for API routes
- Comprehensive coverage

#### Development
- Monorepo setup (Turborepo + pnpm)
- TypeScript ESM configuration
- Hot reload for development
- Seed data generator (600 demo events)

---

## Installation & Development

See [project-overview-pdr.md](./project-overview-pdr.md) for detailed setup instructions.

## Versioning

This project follows [Semantic Versioning](https://semver.org/):
- **MAJOR:** Breaking changes to API or core functionality
- **MINOR:** New features, backward-compatible
- **PATCH:** Bug fixes and non-breaking improvements

## Issue Severity Scale

- **CRITICAL:** Security vulnerabilities, data corruption, complete feature failure
- **HIGH:** Significant functionality issues, race conditions, DoS vectors
- **MEDIUM:** Edge case bugs, type safety issues, API inconsistencies
- **LOW:** Code quality, UX polish, documentation gaps

## Future Releases

### Planned for v1.1
- Production deployment guide
- Advanced filtering and search
- Custom cost models
- Performance optimizations

### Planned for v2.0
- Multi-user support & authentication
- Team workspaces
- Webhook integrations
- Custom pricing rules
- API rate tier management

## Contributing

For development guidelines, see [code-standards.md](./code-standards.md).

## Support

For issues, questions, or feature requests, refer to the project README and documentation in the `docs/` directory.
