# Phase 1: Monorepo Foundation

## Context Links
- [Tech Stack](../../docs/tech-stack.md)
- [System Architecture](../../docs/system-architecture.md)
- [Plan Overview](./plan.md)

## Parallelization Info
- **Depends on:** Nothing (first phase)
- **Blocks:** All subsequent phases
- **Parallel with:** None

## Overview
- **Priority:** P1 (Critical path)
- **Status:** Complete
- **Est:** 3h

Bootstrap Turborepo + pnpm workspace monorepo with shared TypeScript config, Docker Compose for Postgres + Redis, linting, and root scripts.

## Key Insights
- pnpm workspaces + Turborepo give caching, parallel builds, dependency graph
- Strict TypeScript from day 1; shared `tsconfig.base.json` extended by each pkg
- Docker Compose for local Postgres + Redis only (no app containers for dev)

## Requirements
### Functional
- `pnpm install` installs all workspace deps
- `turbo dev` starts all apps
- `turbo build` builds all packages
- `docker compose up -d` starts Postgres + Redis

### Non-Functional
- TypeScript strict mode across all packages
- ESLint + Prettier consistent formatting

## Architecture
```
ai-cost-profiler/
├── apps/
│   ├── web/          (created empty, populated in Phase 4)
│   └── server/       (created empty, populated in Phase 2b/3b)
├── packages/
│   ├── sdk/          (created empty, populated in Phase 3a)
│   └── shared/       (created empty, populated in Phase 2a)
├── turbo.json
├── package.json
├── tsconfig.base.json
├── .eslintrc.js
├── .prettierrc
├── docker-compose.yml
├── .gitignore
├── .env.example
└── .npmrc
```

## File Ownership (Exclusive)
```
turbo.json
package.json (root)
tsconfig.base.json
.eslintrc.js
.prettierrc
.npmrc
docker-compose.yml
.gitignore (update existing)
.env.example
apps/web/package.json         (stub only)
apps/web/tsconfig.json        (stub only)
apps/server/package.json      (stub only)
apps/server/tsconfig.json     (stub only)
packages/sdk/package.json     (stub only)
packages/sdk/tsconfig.json    (stub only)
packages/shared/package.json  (stub only)
packages/shared/tsconfig.json (stub only)
```

## Implementation Steps

### 1. Root package.json
```json
{
  "name": "ai-cost-profiler",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "format": "prettier --write \"**/*.{ts,tsx,js,json,md}\"",
    "db:push": "turbo db:push",
    "db:migrate": "turbo db:migrate"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "eslint": "^8.57.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "prettier": "^3.2.0"
  },
  "packageManager": "pnpm@9.0.0",
  "engines": { "node": ">=20" }
}
```

### 2. pnpm-workspace.yaml
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 3. .npmrc
```
auto-install-peers=true
strict-peer-dependencies=false
```

### 4. turbo.json
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["build"]
    },
    "db:push": { "cache": false },
    "db:migrate": { "cache": false }
  }
}
```

### 5. tsconfig.base.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "exclude": ["node_modules", "dist"]
}
```

### 6. .eslintrc.js
```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  ignorePatterns: ['node_modules/', 'dist/', '.next/'],
};
```

### 7. .prettierrc
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### 8. docker-compose.yml
```yaml
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg16  # pgvector extension for prompt similarity
    <!-- Updated: Validation Session 1 - pgvector for prompt similarity -->
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: profiler
      POSTGRES_PASSWORD: profiler_dev
      POSTGRES_DB: ai_cost_profiler
    volumes:
      - pgdata:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
volumes:
  pgdata:
```

### 9. .env.example
```
DATABASE_URL=postgresql://profiler:profiler_dev@localhost:5432/ai_cost_profiler
REDIS_URL=redis://localhost:6379
PORT=3100
NODE_ENV=development
```

### 10. .gitignore (update)
Add: `node_modules/`, `dist/`, `.next/`, `.turbo/`, `.env`, `*.tsbuildinfo`

### 11. Stub package.json for each workspace
Each gets minimal `package.json` with name, version, correct `main`/`types` fields, and extends `tsconfig.base.json`.

Workspace names:
- `@ai-cost-profiler/web`
- `@ai-cost-profiler/server`
- `@ai-cost-profiler/sdk`
- `@ai-cost-profiler/shared`

### 12. Verify
- Run `pnpm install`
- Run `turbo build` (should succeed with empty packages)
- Run `docker compose up -d` and verify Postgres + Redis connections

## Todo List
- [x] Create root `package.json` with workspace scripts
- [x] Create `pnpm-workspace.yaml`
- [x] Create `.npmrc`
- [x] Create `turbo.json`
- [x] Create `tsconfig.base.json`
- [x] Create `.eslintrc.js`
- [x] Create `.prettierrc`
- [x] Create `docker-compose.yml`
- [x] Create `.env.example`
- [x] Update `.gitignore`
- [x] Create stub `package.json` + `tsconfig.json` for all 4 workspaces
- [x] Run `pnpm install` + verify
- [x] Run `docker compose up -d` + verify connections

## Success Criteria
- `pnpm install` completes without errors
- `turbo build` runs (no-op) successfully
- `docker compose up -d` starts Postgres (port 5432) + Redis (port 6379)
- TypeScript strict mode active in all packages

## Conflict Prevention
Phase 1 creates ONLY root configs and stub workspace files. No `src/` files created. Later phases own all source code.

## Risk Assessment
- **pnpm version mismatch:** Pin in `packageManager` field
- **Docker port conflicts:** Use standard ports; user can override via `.env`

## Security
- `.env` in `.gitignore` (never committed)
- Docker Compose for dev only; no production credentials

## Next Steps
After completion, Phase 2a and Phase 2b can start in parallel.
