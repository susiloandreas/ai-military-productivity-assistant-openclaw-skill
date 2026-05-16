# Railway Configuration

This directory contains Railway deployment configuration.

## Procfile (Root Level)

Located in `Procfile` at repository root. Specifies:

```
web: npm run migrate && npm run build && npm start
```

**Execution order:**
1. `npm run migrate` — Runs `ts-node --esm src/utils/migrate.ts`
   - Creates 17 PostgreSQL tables
   - Inserts default user (`00000000-0000-0000-0000-000000000001`)
2. `npm run build` — Runs `tsc` (TypeScript compilation)
   - Outputs to `dist/` (set in `tsconfig.json`)
3. `npm start` — Runs `node dist/server.js`
   - Starts Express server on `PORT`

## Environment Variables

Set these in Railway dashboard (Project → Variables):

```env
DATABASE_URL=postgresql://...       # From PostgreSQL plugin
REDIS_URL=redis://...               # From Redis plugin
NODE_ENV=production                 # Enables all optimizations
IRONCLAW_SERVICE_URL=https://...    # Your Railway domain
PORT=3000                           # Optional (Railway sets automatically)
```

## No Additional Configuration Needed

Railway auto-detects `Procfile` and `package.json`, so no `nixpacks.toml` or `railway.json` needed.

If you need custom Node.js version, add `.node-version` file with version (e.g., `20.11.0`).
