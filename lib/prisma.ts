import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const client =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

// ─── SQLite JSON middleware ───────────────────────────────────────────────────
//
// SQLite (default standalone install) stores JSON as plain text.
// This middleware transparently JSON.stringify's before writes and JSON.parse's
// after reads, so no other application code needs to change.
//
// For PostgreSQL Prisma returns parsed objects natively — the isSqlite guard
// keeps this middleware from running at all in that case.

const JSON_FIELDS: Partial<Record<string, readonly string[]>> = {
  Product:                ["boxDimensions", "sizeCurve"],
  ForecastRun:            ["products", "errors"],
  PurchaseOrder:          ["lines"],
  AppSettings:            ["orderCycles", "seasonalConfigs"],
  IntegrationCredentials: ["shopifySyncLog", "veeqoSyncLog"],
};

const isSqlite = (process.env.DATABASE_URL ?? "").startsWith("file:");

if (isSqlite) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).$use(async (params: any, next: any) => {
    const fields: readonly string[] =
      params.model ? (JSON_FIELDS[params.model as string] ?? []) : [];

    // ── Stringify before write ──────────────────────────────────────────────
    if (fields.length > 0) {
      const stringifyIn = (data: Record<string, unknown>) => {
        for (const field of fields) {
          const val = data[field];
          if (val !== undefined && val !== null && typeof val !== "string") {
            data[field] = JSON.stringify(val);
          }
        }
      };

      const { action, args } = params as {
        action: string;
        args: Record<string, Record<string, unknown>>;
      };
      if ((action === "create" || action === "update") && args?.data) {
        stringifyIn(args.data);
      } else if (action === "upsert" && args) {
        if (args.create) stringifyIn(args.create);
        if (args.update) stringifyIn(args.update);
      }
    }

    const result = await next(params);

    // ── Parse after read ────────────────────────────────────────────────────
    if (fields.length > 0 && result !== null && result !== undefined) {
      const parseOut = (obj: Record<string, unknown>) => {
        for (const field of fields) {
          if (typeof obj[field] === "string") {
            try {
              obj[field] = JSON.parse(obj[field] as string);
            } catch {
              /* leave as string */
            }
          }
        }
      };

      if (Array.isArray(result)) {
        for (const row of result as Record<string, unknown>[]) parseOut(row);
      } else if (typeof result === "object") {
        parseOut(result as Record<string, unknown>);
      }
    }

    return result;
  });
}

export const prisma = client;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = client;
}
