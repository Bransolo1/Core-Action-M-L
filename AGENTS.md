# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

This is a **Next.js 14** app with **PostgreSQL** (via Prisma ORM) and **NextAuth.js** authentication.

| Service | How to run |
|---------|-----------|
| PostgreSQL 16 | `sudo docker run -d --name coreaction-db -p 5432:5432 -e POSTGRES_DB=coreaction_ml -e POSTGRES_USER=coreaction -e POSTGRES_PASSWORD=changeme postgres:16-alpine` |
| Next.js dev server | `npm run dev` (port 3000) |

### Key commands

See `package.json` scripts and `CLAUDE.md` for full details. Summary:

- **Dev server**: `npm run dev`
- **Lint**: `npm run lint`
- **Type check**: `npm run type-check`
- **Unit tests**: `npm run test` (Vitest)
- **DB push**: `DATABASE_URL=postgresql://coreaction:changeme@localhost:5432/coreaction_ml npx prisma db push`
- **DB seed**: `DATABASE_URL=postgresql://coreaction:changeme@localhost:5432/coreaction_ml npm run db:seed`

### Important gotchas

1. **`next.config.ts` is incompatible with Next.js 14.2**: The repo ships `next.config.ts` but Next.js 14.2 only supports `.js`/`.mjs`. A `next.config.mjs` must exist alongside it for both `npm run dev` and `npm run build` to work. The `.mjs` file mirrors the `.ts` config but uses `experimental.serverComponentsExternalPackages` (the Next.js 14 name) instead of the top-level `serverExternalPackages` (Next.js 15+).

2. **Prisma CLI does not read `.env.local`**: You must export `DATABASE_URL` explicitly when running Prisma commands (e.g. `db:push`, `db:seed`, `prisma generate`).

3. **Docker compose `db` service has no port mapping**: The `docker-compose.yml` `db` service does not expose port 5432 to the host. For local dev, run PostgreSQL directly with `docker run -p 5432:5432 ...` or add a `ports` mapping.

4. **ESLint config references `@typescript-eslint/no-unused-vars` rule** which is not provided by the installed packages. Both `npm run lint` and `npm run build` fail due to this pre-existing issue. `npm run type-check` passes cleanly.

5. **Vitest picks up Playwright e2e tests**: The `vitest.config.ts` does not exclude the `e2e/` directory, causing Playwright tests to fail when collected by Vitest. The 15 unit tests in `lib/__tests__/` all pass.

6. **Default seed credentials**: `admin@ridecore.pro` / `CoreAction2026!`

7. **`.env.local` setup**: Copy `.env.local.example` to `.env.local`. Required vars: `DATABASE_URL`, `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`), `NEXTAUTH_URL=http://localhost:3000`. `ANTHROPIC_API_KEY` is optional (only for AI suggestions feature).

8. **Docker daemon in cloud VM**: Requires `fuse-overlayfs` storage driver and `iptables-legacy`. Start with `sudo dockerd &>/tmp/dockerd.log &`.
