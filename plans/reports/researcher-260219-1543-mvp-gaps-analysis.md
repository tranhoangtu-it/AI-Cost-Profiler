# MVP Gaps Analysis: Production-Ready LLM Cost Profiler

**Date:** 2026-02-19
**Research Scope:** Features needed to move from MVP to production-ready LLM cost profiler
**Benchmarks:** Helicone, LangSmith, Portkey, OpenMeter, Langfuse

---

## Executive Summary

MVP covers core tracking (cost, tokens, latency) with good visualization. Production readiness requires: **auth/multi-tenancy**, **streaming/retry support**, **alerting**, **data retention**, **export/API**, **comparison views**.

**Effort estimate:** 80-120h additional work across 15 Must-Have + 8 Should-Have features.

---

## Must-Have Features (Production Blockers)

### 1. Authentication & Multi-Tenancy
**Gap:** MVP has no auth, single-project mode
**Needed:**
- Project-based isolation (API keys per project)
- User accounts (email/password or OAuth)
- RBAC (viewer, developer, admin roles)
- SDK: project key in `profileAI({ apiKey: '...' })`

**Effort:** 12h (auth routes, middleware, DB schema, SDK changes)

### 2. Streaming Support
**Gap:** SDK only tracks non-streaming calls
**Needed:**
- Intercept streaming responses (SSE/chunked transfer)
- Accumulate tokens across chunks
- Track TTFT (Time To First Token) + streaming latency
- Handle function calling in streaming mode

**Effort:** 8h (SDK interceptor rewrites, new event fields)

### 3. Cached Token Tracking
**Gap:** MVP counts all tokens as non-cached
**Needed:**
- Track `prompt_tokens_cached` vs `prompt_tokens_new`
- Cost calculation adjustment (cached = 10% cost for Anthropic, 50% for OpenAI)
- Dashboard: show cache hit rate per feature/prompt

**Effort:** 4h (event schema + UI)

### 4. Retry & Error Tracking
**Gap:** SDK doesn't track retries, failed calls, or error types
**Needed:**
- Count retry attempts per call
- Log error codes (rate limit, timeout, invalid request, server error)
- Cost of failed calls (still billed by some providers)
- Dashboard: error rate chart, retry patterns

**Effort:** 6h (SDK error hooks, DB schema, analytics)

### 5. Rate Limiting & Quota Management
**Gap:** Backend has no rate limits
**Needed:**
- Per-project event ingestion limits (e.g., 10k events/hour)
- Redis-based rate limiter middleware
- HTTP 429 responses with retry-after headers

**Effort:** 4h (middleware, Redis counters)

### 6. Data Retention & Archival
**Gap:** MVP stores all events indefinitely
**Needed:**
- Configurable retention (e.g., 30/90/365 days)
- Cron job to archive old events to S3/GCS
- Aggregated stats retention (keep monthly rollups forever)

**Effort:** 8h (archival service, S3 integration, cron)

### 7. Pagination & Query Performance
**Gap:** Analytics endpoints may timeout on large datasets
**Needed:**
- Cursor-based pagination (not offset/limit)
- Query optimization (indexes on `created_at`, `feature_name`, `model`)
- Materialized views for expensive aggregations

**Effort:** 6h (DB indexes, API pagination, caching)

### 8. Budget Alerts
**Gap:** No alerting mechanism
**Needed:**
- Set budget thresholds per project/feature/model (daily/weekly/monthly)
- Email/Slack/webhook notifications when exceeded
- Dashboard: budget burn rate visualization

**Effort:** 10h (alert service, notification channels, UI)

### 9. Export & API Access
**Gap:** No data export or programmatic access
**Needed:**
- CSV/JSON export for all views (date range filter)
- REST API for raw event access (with pagination)
- Webhook support for real-time event streaming

**Effort:** 6h (export endpoints, API docs)

### 10. Date Range Picker
**Gap:** Dashboard shows all-time data only
**Needed:**
- Global date picker (last 7d/30d/90d, custom range)
- Persist selection in URL query params
- All charts/tables respect date filter

**Effort:** 4h (UI component, backend filtering)

### 11. Model Comparison View
**Gap:** No side-by-side model comparison
**Needed:**
- Compare cost/latency/tokens across models for same prompts
- Similarity-based prompt grouping
- Highlight cost savings opportunities (e.g., GPT-4 → GPT-3.5 for simple prompts)

**Effort:** 8h (analytics endpoint, UI table)

### 12. Function Calling Cost
**Gap:** SDK doesn't track function/tool usage costs
**Needed:**
- Intercept function calls (OpenAI/Anthropic tool use)
- Track tool call token overhead
- Cost breakdown: base prompt + function definitions + tool outputs

**Effort:** 6h (SDK hooks, event schema)

### 13. Batch API Support
**Gap:** MVP doesn't handle batch jobs
**Needed:**
- Track batch job costs (OpenAI Batch API, Anthropic async)
- Map batch ID to feature/workflow
- Cost = discounted rate (50% off for OpenAI batch)

**Effort:** 5h (SDK batch interceptor, pricing logic)

### 14. Prompt Version Tracking
**Gap:** No prompt versioning/changelog
**Needed:**
- Detect prompt changes via embedding drift
- Tag prompts with version labels (manual or auto-generated)
- Compare cost/performance across versions

**Effort:** 7h (versioning logic, UI diff view)

### 15. Security & Compliance
**Gap:** MVP stores full prompts/responses (PII risk)
**Needed:**
- PII redaction (emails, phone numbers, SSNs)
- Option to disable prompt/response logging
- Audit logs (who viewed what data)

**Effort:** 10h (redaction service, audit trail)

---

## Should-Have Features (Competitive Parity)

### 16. Multi-Provider Fallback Tracking
**Gap:** SDK doesn't track fallback logic
**Needed:**
- Log primary/fallback provider attempts
- Cost comparison: fallback overhead vs reliability gain

**Effort:** 4h (SDK metadata, UI)

### 17. Prompt Template Library
**Gap:** No prompt reuse/sharing mechanism
**Needed:**
- Save prompts as templates (with variables)
- Cost history per template
- Share templates across projects

**Effort:** 8h (template CRUD, UI)

### 18. Team Collaboration
**Gap:** Single-user mode only
**Needed:**
- Invite teammates to projects
- Shared annotations/comments on prompts
- Slack integration for cost anomalies

**Effort:** 10h (invites, comments, integrations)

### 19. Custom Cost Models
**Gap:** Hardcoded pricing in `packages/shared`
**Needed:**
- Override default pricing (enterprise discounts, fine-tuned models)
- Upload custom pricing CSV
- Dashboard: apply custom rates retroactively

**Effort:** 5h (pricing override DB table, UI)

### 20. Latency Percentiles
**Gap:** MVP shows avg/min/max latency only
**Needed:**
- P50/P90/P95/P99 latency metrics
- Outlier detection (slow calls)

**Effort:** 3h (analytics query, UI)

### 21. Cost Forecasting
**Gap:** No predictive analytics
**Needed:**
- Linear regression on usage trends
- Predict next 7/30 days cost
- Budget alerts based on forecast

**Effort:** 6h (forecasting service, UI chart)

### 22. A/B Test Tracking
**Gap:** No experiment support
**Needed:**
- Tag events with experiment ID/variant
- Compare cost/performance across variants
- Statistical significance testing

**Effort:** 7h (experiment metadata, analytics)

### 23. SDK Auto-Update Check
**Gap:** No version management
**Needed:**
- SDK reports its version to backend
- Backend notifies if outdated (new models, pricing)

**Effort:** 2h (SDK header, backend check)

---

## Nice-to-Have Features (Differentiators)

### 24. Multi-Step Workflow Tracking
**Gap:** Events are isolated, no parent/child tracking
**Needed:**
- Trace ID for multi-step workflows (RAG, agents, chains)
- Visualize cost flow through workflow steps
- Waterfall chart for sequential calls

**Effort:** 10h (trace schema, UI)

### 25. Cost Per User/Session
**Gap:** No user-level attribution
**Needed:**
- SDK: `profileAI({ userId: '...' })`
- Dashboard: top users by cost, churn risk (high-cost users)

**Effort:** 4h (event schema, analytics)

### 26. Real-Time Cost Dashboard (Public)
**Gap:** Dashboard is private only
**Needed:**
- Shareable public URL (read-only)
- Embed widgets in docs/status pages

**Effort:** 5h (public route, iframe embed)

### 27. Cost Optimization Recommendations
**Gap:** No automated suggestions
**Needed:**
- Detect: prompt bloat, redundant calls, overpowered models
- Actionable tips (e.g., "Switch to Claude Haiku for 70% cost reduction")

**Effort:** 12h (rules engine, UI notifications)

### 28. Usage-Based Billing Integration
**Gap:** Tool doesn't help monetize AI features
**Needed:**
- Export usage data to Stripe Billing (usage records API)
- Map features to billing line items

**Effort:** 8h (Stripe integration, mapping UI)

---

## Priority Matrix

| Priority | Count | Effort | Examples |
|----------|-------|--------|----------|
| **Must-Have** | 15 | 94h | Auth, streaming, alerts, export, pagination |
| **Should-Have** | 8 | 45h | Fallback tracking, templates, team collab |
| **Nice-to-Have** | 5 | 39h | Workflows, cost-per-user, optimization recs |

**Total:** 28 features, 178h (~4-5 weeks solo, 2-3 weeks with team)

---

## Recommended Roadmap

### Phase 1: Core Production (Must-Have 1-10)
**Effort:** 68h
**Focus:** Auth, streaming, caching, retries, rate limits, retention, pagination, alerts, export, date picker

### Phase 2: Competitive Parity (Must-Have 11-15 + Should-Have 16-20)
**Effort:** 62h
**Focus:** Model comparison, function calling, batch API, versioning, security, fallback, templates, collaboration, custom pricing, latency percentiles

### Phase 3: Advanced Features (Should-Have 21-23 + Nice-to-Have 24-28)
**Effort:** 48h
**Focus:** Forecasting, A/B testing, workflows, cost-per-user, optimization recs, billing integration

---

## Unresolved Questions

1. **Deployment model:** Self-hosted only or offer SaaS version?
2. **Pricing strategy:** Open-source core + paid features, or fully open-source?
3. **OpenAI o1/o3 reasoning tokens:** How to handle non-returned reasoning token costs in MVP?
4. **Embedding model choice:** Continue OpenAI embeddings or switch to local (e.g., Sentence Transformers) for cost?
5. **Real-time constraints:** Should alerts trigger within 1 min or is 5 min acceptable?
6. **Data sovereignty:** Any GDPR/HIPAA requirements for prompt storage?
