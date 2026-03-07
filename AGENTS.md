# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

This is a **Next.js 14** app with **SQLite** (via Prisma ORM) and **NextAuth.js** authentication. No Docker or external database required.

| Service | How to run |
|---------|-----------|
| Next.js dev server | `npm run dev` (port 3000) |
| Database | SQLite file at `data/coreaction.db` (auto-created by Prisma) |

### Key commands

See `package.json` scripts and `CLAUDE.md` for full details.

- **Dev server**: `npm run dev`
- **Lint**: `npm run lint`
- **Type check**: `npm run type-check`
- **Unit tests**: `npm run test` (Vitest, 73 tests)
- **DB push**: `npx prisma db push` (reads `DATABASE_URL` from `.env.local`)
- **DB seed**: `npm run db:seed`

### Environment setup

The `.env.local` file should contain:
```
DATABASE_URL=file:./data/coreaction.db
NEXTAUTH_SECRET=<random-base64>
NEXTAUTH_URL=http://localhost:3000
```

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

Default login: `admin@ridecore.pro` / `CoreAction2026!`

### Important gotchas

1. **SQLite JSON fields are stored as String**: Prisma 5.x doesn't support the `Json` type with SQLite. All structured data (boxDimensions, sizeCurve, forecast products, PO lines, settings arrays) is serialised with `JSON.stringify` on write and `JSON.parse` on read in `/api/sync/route.ts`.

2. **Prisma CLI reads `.env` but not `.env.local`**: Next.js loads `.env.local` at runtime, but Prisma CLI only reads `.env`. If running Prisma commands manually, either create a `.env` file or pass `DATABASE_URL` as an environment variable.

3. **Config file**: The project uses `next.config.mjs` (not `.ts`). Next.js 14.2 does not support TypeScript config files.

4. **Vitest excludes `e2e/`**: The `vitest.config.ts` excludes the `e2e/` directory to prevent Playwright tests from being collected by Vitest.

5. **InventorySnapshot is auto-updated**: When a sales period is saved (manually or via CSV import), the product's `InventorySnapshot.quantityOnHand` is set to the `closingStock` value. Reorder points are set via the Product edit form.

6. **State sync**: The app uses a dual persistence model — localStorage (immediate) + POST `/api/sync` (debounced 1.5s). On load, GET `/api/sync` hydrates from the database; if empty, falls back to localStorage.
