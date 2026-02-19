# Phase 2a: Shared Package

## Context Links
- [Tech Stack](../../docs/tech-stack.md)
- [System Architecture](../../docs/system-architecture.md)
- [Plan Overview](./plan.md)

## Parallelization Info
- **Depends on:** Phase 1
- **Blocks:** Phase 3a (SDK), Phase 3b (Backend), Phase 4a (Dashboard)
- **Parallel with:** Phase 2b (DB Schema)

## Overview
- **Priority:** P1
- **Status:** Complete
- **Est:** 2h

Create `packages/shared` with Zod schemas, TypeScript types, model pricing constants, and utility functions shared across SDK, server, and web.

## Key Insights
- Single source of truth for event schemas validated at SDK emit AND server ingest
- Model pricing constants updated here; SDK + server both reference them
- Zod schemas auto-infer TS types (no duplication)

## Requirements
### Functional
- Zod schemas for: LLM event, batch event request, analytics query params, analytics responses
- Model pricing map (OpenAI + Anthropic + Google Gemini models with input/output per-1K-token prices)
<!-- Updated: Validation Session 1 - Added Gemini provider to pricing constants -->
- Cost calculation utility
- ID generation utility (trace IDs, span IDs)

### Non-Functional
- Zero runtime dependencies beyond `zod`
- Tree-shakeable ESM exports

## Architecture
```
packages/shared/
├── src/
│   ├── index.ts              # Re-exports all public API
│   ├── schemas/
│   │   ├── event-schema.ts   # LLM event Zod schema
│   │   └── analytics-schema.ts # Query/response schemas
│   ├── types/
│   │   └── index.ts          # Inferred types from schemas + manual types
│   ├── constants/
│   │   └── model-pricing.ts  # Pricing map per provider/model
│   └── utils/
│       ├── cost-calculator.ts # Calculate cost from tokens + model
│       └── id-generator.ts   # nanoid-based trace/span IDs
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## File Ownership (Exclusive)
All files under `packages/shared/` except `package.json` and `tsconfig.json` (stubs from Phase 1).

## Implementation Steps

### 1. Update packages/shared/package.json
```json
{
  "name": "@ai-cost-profiler/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "lint": "eslint src/"
  },
  "dependencies": {
    "zod": "^3.22.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0"
  }
}
```

### 2. tsup.config.ts
```typescript
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

### 3. src/schemas/event-schema.ts
```typescript
import { z } from 'zod';

export const llmEventSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  feature: z.string(),
  userId: z.string().optional(),
  provider: z.enum(['openai', 'anthropic']),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative().default(0),
  latencyMs: z.number().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

export const batchEventRequestSchema = z.object({
  events: z.array(llmEventSchema).min(1).max(500),
});
```

### 4. src/schemas/analytics-schema.ts
```typescript
import { z } from 'zod';

export const timeRangeSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  granularity: z.enum(['hour', 'day', 'week']).default('hour'),
});

export const costBreakdownQuerySchema = timeRangeSchema.extend({
  groupBy: z.enum(['feature', 'model', 'user']).default('feature'),
});

export const costBreakdownItemSchema = z.object({
  name: z.string(),
  totalCost: z.number(),
  totalTokens: z.number(),
  callCount: z.number(),
  avgLatency: z.number(),
});

export const flamegraphNodeSchema: z.ZodType<FlamegraphNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    value: z.number(),
    tokens: z.number().optional(),
    children: z.array(flamegraphNodeSchema).optional(),
  })
);

// Manual type for recursive schema
interface FlamegraphNode {
  name: string;
  value: number;
  tokens?: number;
  children?: FlamegraphNode[];
}

export const timeseriesPointSchema = z.object({
  timestamp: z.string(),
  cost: z.number(),
  tokens: z.number(),
  callCount: z.number(),
});

export const promptAnalysisSchema = z.object({
  eventId: z.string(),
  feature: z.string(),
  model: z.string(),
  inputTokens: z.number(),
  medianInputTokens: z.number(),
  bloatRatio: z.number(),
  redundancyScore: z.number(),
  suggestions: z.array(z.string()),
});
```

### 5. src/types/index.ts
```typescript
import { z } from 'zod';
import {
  llmEventSchema,
  batchEventRequestSchema,
} from '../schemas/event-schema.js';
import {
  costBreakdownQuerySchema,
  costBreakdownItemSchema,
  timeseriesPointSchema,
  promptAnalysisSchema,
  timeRangeSchema,
} from '../schemas/analytics-schema.js';

// Inferred types from Zod schemas
export type LlmEvent = z.infer<typeof llmEventSchema>;
export type BatchEventRequest = z.infer<typeof batchEventRequestSchema>;
export type TimeRange = z.infer<typeof timeRangeSchema>;
export type CostBreakdownQuery = z.infer<typeof costBreakdownQuerySchema>;
export type CostBreakdownItem = z.infer<typeof costBreakdownItemSchema>;
export type TimeseriesPoint = z.infer<typeof timeseriesPointSchema>;
export type PromptAnalysis = z.infer<typeof promptAnalysisSchema>;

// Manual types
export type Provider = 'openai' | 'anthropic';

export interface ModelPricing {
  provider: Provider;
  model: string;
  inputPricePer1k: number;
  outputPricePer1k: number;
}

export interface FlamegraphNode {
  name: string;
  value: number;
  tokens?: number;
  children?: FlamegraphNode[];
}

export interface SdkConfig {
  serverUrl: string;
  feature: string;
  userId?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  enabled?: boolean;
}
```

### 6. src/constants/model-pricing.ts
```typescript
import type { ModelPricing } from '../types/index.js';

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o': { provider: 'openai', model: 'gpt-4o', inputPricePer1k: 0.0025, outputPricePer1k: 0.01 },
  'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini', inputPricePer1k: 0.00015, outputPricePer1k: 0.0006 },
  'gpt-4-turbo': { provider: 'openai', model: 'gpt-4-turbo', inputPricePer1k: 0.01, outputPricePer1k: 0.03 },
  'gpt-3.5-turbo': { provider: 'openai', model: 'gpt-3.5-turbo', inputPricePer1k: 0.0005, outputPricePer1k: 0.0015 },
  'text-embedding-3-small': { provider: 'openai', model: 'text-embedding-3-small', inputPricePer1k: 0.00002, outputPricePer1k: 0 },
  'text-embedding-3-large': { provider: 'openai', model: 'text-embedding-3-large', inputPricePer1k: 0.00013, outputPricePer1k: 0 },
  // Anthropic
  'claude-3-5-sonnet-20241022': { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', inputPricePer1k: 0.003, outputPricePer1k: 0.015 },
  'claude-3-5-haiku-20241022': { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', inputPricePer1k: 0.0008, outputPricePer1k: 0.004 },
  'claude-3-opus-20240229': { provider: 'anthropic', model: 'claude-3-opus-20240229', inputPricePer1k: 0.015, outputPricePer1k: 0.075 },
  'claude-sonnet-4-20250514': { provider: 'anthropic', model: 'claude-sonnet-4-20250514', inputPricePer1k: 0.003, outputPricePer1k: 0.015 },
};
```

### 7. src/utils/cost-calculator.ts
```typescript
import { MODEL_PRICING } from '../constants/model-pricing.js';

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  const inputCost = (inputTokens / 1000) * pricing.inputPricePer1k;
  const outputCost = (outputTokens / 1000) * pricing.outputPricePer1k;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal precision
}

export function lookupPricing(model: string) {
  return MODEL_PRICING[model] ?? null;
}
```

### 8. src/utils/id-generator.ts
```typescript
import { nanoid } from 'nanoid';

export function generateTraceId(): string {
  return `tr_${nanoid(21)}`;
}

export function generateSpanId(): string {
  return `sp_${nanoid(16)}`;
}
```

### 9. src/index.ts
```typescript
// Schemas
export { llmEventSchema, batchEventRequestSchema } from './schemas/event-schema.js';
export {
  timeRangeSchema,
  costBreakdownQuerySchema,
  costBreakdownItemSchema,
  flamegraphNodeSchema,
  timeseriesPointSchema,
  promptAnalysisSchema,
} from './schemas/analytics-schema.js';

// Types
export type {
  LlmEvent, BatchEventRequest, TimeRange,
  CostBreakdownQuery, CostBreakdownItem,
  TimeseriesPoint, PromptAnalysis,
  Provider, ModelPricing, FlamegraphNode, SdkConfig,
} from './types/index.js';

// Constants
export { MODEL_PRICING } from './constants/model-pricing.js';

// Utils
export { calculateCost, lookupPricing } from './utils/cost-calculator.js';
export { generateTraceId, generateSpanId } from './utils/id-generator.js';
```

### 10. Verify
- `pnpm build --filter @ai-cost-profiler/shared`
- Confirm `dist/` output has `.js` + `.d.ts` files
- Import from another package to verify types resolve

## Todo List
- [x] Update `packages/shared/package.json` with deps
- [x] Create `tsup.config.ts`
- [x] Create `src/schemas/event-schema.ts`
- [x] Create `src/schemas/analytics-schema.ts`
- [x] Create `src/types/index.ts`
- [x] Create `src/constants/model-pricing.ts`
- [x] Create `src/utils/cost-calculator.ts`
- [x] Create `src/utils/id-generator.ts`
- [x] Create `src/index.ts` barrel
- [x] Build and verify

## Success Criteria
- Package builds with `tsup` producing ESM + DTS
- All Zod schemas validate correct data shapes
- `calculateCost('gpt-4o', 1000, 500)` returns correct value
- Types importable from `@ai-cost-profiler/shared`

## Conflict Prevention
Only Phase 2a touches `packages/shared/src/`. Phase 1 stubs only `package.json` + `tsconfig.json`.

## Risk Assessment
- **Pricing drift:** Model prices change; keep constant map easy to update
- **Zod version:** Pin to 3.22+ for `.datetime()` support

## Security
- No secrets in shared package
- Zod validation prevents malformed event injection

## Next Steps
Phase 3a (SDK) and Phase 3b (Backend API) can start once shared builds.
