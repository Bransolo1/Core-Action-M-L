"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  ExternalLink,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Clock,
  Package,
  ShoppingBag,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { IntegrationStatus, SyncLog } from "@/types/integration";

// ─── Helper: masked token display ────────────────────────────────────────────

function maskToken(token: string) {
  if (token.length <= 8) return "••••••••";
  return token.slice(0, 6) + "••••••••" + token.slice(-4);
}

// ─── Status dot ──────────────────────────────────────────────────────────────

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-300"}`}
      />
      <span
        className={`text-xs font-600 ${connected ? "text-green-700" : "text-brand-dark-gray"}`}
      >
        {connected ? "Connected" : "Not connected"}
      </span>
    </span>
  );
}

// ─── Sync Log Card ───────────────────────────────────────────────────────────

function SyncLogPanel({ log }: { log: SyncLog }) {
  return (
    <div className="rounded-sm border border-gray-100 bg-brand-gray/40 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-600 text-brand-black">Last Sync Result</span>
        <span className="font-mono text-brand-dark-gray">
          {new Date(log.timestamp).toLocaleString()} · {(log.durationMs / 1000).toFixed(1)}s
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Products added" value={log.productsImported} />
        <Stat label="Products updated" value={log.productsUpdated} />
        <Stat label="Sales rows created" value={log.salesPeriodsCreated} />
        <Stat label="Sales rows updated" value={log.salesPeriodsUpdated} />
      </div>
      {log.errors.length > 0 && (
        <div className="mt-2 space-y-1">
          {log.errors.map((e, i) => (
            <div key={i} className="flex items-start gap-1.5 text-red-600">
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="font-mono text-lg font-700 text-brand-black">{value}</div>
      <div className="text-[10px] text-brand-dark-gray">{label}</div>
    </div>
  );
}

// ─── Shopify Integration Panel ────────────────────────────────────────────────

function ShopifyPanel({
  status,
  isAdmin,
  onRefresh,
}: {
  status: IntegrationStatus["shopify"];
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(!status.connected);
  const [domain, setDomain] = useState(status.configuredViaEnv ? "" : (status.domain ?? ""));
  const [token, setToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sinceDate, setSinceDate] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; shopName?: string; error?: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; error?: string } | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/integrations/shopify/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, accessToken: token }),
      });
      const data = await res.json() as { ok: boolean; shopName?: string; error?: string };
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: "Request failed" });
    }
    setTesting(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopify: {
            domain,
            accessToken: token || undefined,
            webhookSecret: webhookSecret || undefined,
            enabled: true,
          },
        }),
      });
      onRefresh();
    } catch {
      // ignore
    }
    setSaving(false);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/integrations/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceDate: sinceDate || undefined }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      setSyncResult(data);
      if (data.ok) onRefresh();
    } catch {
      setSyncResult({ ok: false, error: "Sync request failed" });
    }
    setSyncing(false);
  }

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/shopify`
      : "/api/webhooks/shopify";

  return (
    <Card>
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between px-5 py-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#96bf48]/10">
            <ShoppingBag className="h-5 w-5 text-[#96bf48]" />
          </div>
          <div>
            <p className="font-700 text-brand-black">Shopify</p>
            <p className="text-xs text-brand-dark-gray">
              {status.domain ? status.domain : "E-commerce platform"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge connected={status.connected} />
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-brand-dark-gray" />
          ) : (
            <ChevronDown className="h-4 w-4 text-brand-dark-gray" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-5">

          {/* What syncs */}
          <div className="rounded-sm bg-blue-50 p-3 text-xs text-blue-800">
            <div className="mb-1.5 font-700">What gets imported:</div>
            <ul className="space-y-0.5">
              <li className="flex items-center gap-1.5"><Package className="h-3 w-3" /> Products — SKU, name, category, RRP price, weight</li>
              <li className="flex items-center gap-1.5"><ShoppingBag className="h-3 w-3" /> Paid orders → monthly sales periods (units sold)</li>
              <li className="flex items-center gap-1.5"><RefreshCw className="h-3 w-3" /> Real-time order webhook (keeps sales data current)</li>
            </ul>
          </div>

          {/* Credentials — hidden if configured via env */}
          {status.configuredViaEnv ? (
            <div className="flex items-center gap-2 rounded-sm bg-green-50 p-3 text-xs text-green-800">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Credentials are configured via server environment variables and cannot be edited here.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Store domain *"
                  placeholder="my-store.myshopify.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  hint="No https:// prefix needed"
                  disabled={!isAdmin}
                />
                <div className="relative">
                  <Input
                    label="Admin API access token *"
                    placeholder={status.connected ? maskToken("shpat_...") : "shpat_xxxxxxxx..."}
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    hint="Shopify Admin → Apps → Develop apps → API credentials"
                    disabled={!isAdmin}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((s) => !s)}
                    className="absolute right-3 top-7 text-brand-dark-gray hover:text-brand-black"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="relative">
                  <Input
                    label="Webhook secret (optional)"
                    placeholder={status.connected ? "••••••••" : "whsec_..."}
                    type={showSecret ? "text" : "password"}
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    hint="Used to verify incoming webhook signatures"
                    disabled={!isAdmin}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    className="absolute right-3 top-7 text-brand-dark-gray hover:text-brand-black"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Test result */}
              {testResult && (
                <div
                  className={`flex items-center gap-2 rounded-sm p-2 text-xs ${
                    testResult.ok
                      ? "bg-green-50 text-green-800"
                      : "bg-red-50 text-red-800"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {testResult.ok
                    ? `Connected to "${testResult.shopName}"`
                    : testResult.error}
                </div>
              )}

              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleTest}
                    disabled={testing || !domain || !token}
                  >
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Test Connection
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || !domain || !token}
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Save Credentials
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Sync section — only shown when connected */}
          {status.connected && (
            <>
              <div className="border-t border-gray-100 pt-4">
                <p className="mb-3 text-sm font-600 text-brand-black">Sync Data</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-48">
                    <Input
                      label="Import orders from"
                      type="date"
                      value={sinceDate}
                      onChange={(e) => setSinceDate(e.target.value)}
                      hint="Leave blank to import all history"
                    />
                  </div>
                  <Button onClick={handleSync} disabled={syncing}>
                    {syncing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {syncing ? "Syncing…" : "Sync Now"}
                  </Button>
                  {status.lastSync && (
                    <span className="flex items-center gap-1 text-xs text-brand-dark-gray">
                      <Clock className="h-3 w-3" />
                      Last synced {new Date(status.lastSync).toLocaleString()}
                    </span>
                  )}
                </div>

                {syncResult && !syncResult.ok && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
                    <XCircle className="h-3.5 w-3.5" />
                    {syncResult.error}
                  </div>
                )}
                {syncResult?.ok && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Sync complete — check results below
                  </div>
                )}
              </div>

              {status.lastSyncLog && (
                <SyncLogPanel log={status.lastSyncLog} />
              )}
            </>
          )}

          {/* Webhook setup instructions */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="h-3.5 w-3.5 text-brand-dark-gray" />
              <p className="text-xs font-600 text-brand-dark-gray uppercase tracking-wider">
                Real-time Webhook Setup
              </p>
            </div>
            <p className="mb-2 text-xs text-brand-dark-gray">
              To receive live order data as sales happen, register a webhook in your Shopify store:
            </p>
            <ol className="mb-3 list-inside list-decimal space-y-1 text-xs text-brand-dark-gray">
              <li>Go to Shopify Admin → Settings → Notifications</li>
              <li>Scroll to Webhooks → click <strong>Create webhook</strong></li>
              <li>Set Topic: <strong>orders/paid</strong></li>
              <li>Set Format: <strong>JSON</strong></li>
              <li>Set URL to your webhook endpoint below</li>
              <li>Copy the signing secret and save it as the Webhook Secret above</li>
            </ol>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-sm border border-gray-200 bg-brand-gray px-3 py-2 text-xs font-mono text-brand-black break-all">
                {webhookUrl}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(webhookUrl)}
                className="shrink-0 rounded-sm border border-gray-200 px-2 py-2 text-xs text-brand-dark-gray hover:bg-brand-gray"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Setup guide link */}
          <a
            href="https://help.shopify.com/en/manual/apps/app-types/custom-apps"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-red hover:underline"
          >
            How to create a Shopify custom app and get an Admin API token
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </Card>
  );
}

// ─── Veeqo Integration Panel ──────────────────────────────────────────────────

function VeeqoPanel({
  status,
  isAdmin,
  onRefresh,
}: {
  status: IntegrationStatus["veeqo"];
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(!status.connected);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sinceDate, setSinceDate] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; companyName?: string; error?: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; error?: string } | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/integrations/veeqo/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json() as { ok: boolean; companyName?: string; error?: string };
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: "Request failed" });
    }
    setTesting(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          veeqo: { apiKey, enabled: true },
        }),
      });
      onRefresh();
    } catch {
      // ignore
    }
    setSaving(false);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/integrations/veeqo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceDate: sinceDate || undefined }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      setSyncResult(data);
      if (data.ok) onRefresh();
    } catch {
      setSyncResult({ ok: false, error: "Sync request failed" });
    }
    setSyncing(false);
  }

  return (
    <Card>
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between px-5 py-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-blue-50">
            <Package className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="font-700 text-brand-black">Veeqo</p>
            <p className="text-xs text-brand-dark-gray">Warehouse management system</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge connected={status.connected} />
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-brand-dark-gray" />
          ) : (
            <ChevronDown className="h-4 w-4 text-brand-dark-gray" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-5">

          {/* What syncs */}
          <div className="rounded-sm bg-blue-50 p-3 text-xs text-blue-800">
            <div className="mb-1.5 font-700">What gets imported:</div>
            <ul className="space-y-0.5">
              <li className="flex items-center gap-1.5"><Package className="h-3 w-3" /> Products — SKU, name, category, sell price, cost price, weight</li>
              <li className="flex items-center gap-1.5"><ShoppingBag className="h-3 w-3" /> Dispatched orders → monthly sales periods (units sold)</li>
              <li className="flex items-center gap-1.5"><RefreshCw className="h-3 w-3" /> Cost price updates for accurate margin calculations</li>
            </ul>
          </div>

          {/* Credentials */}
          {status.configuredViaEnv ? (
            <div className="flex items-center gap-2 rounded-sm bg-green-50 p-3 text-xs text-green-800">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Credentials are configured via server environment variables and cannot be edited here.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative w-full sm:w-80">
                <Input
                  label="Veeqo API Key *"
                  placeholder={status.connected ? maskToken("xxxxxxxx") : "Your Veeqo API key"}
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  hint="Veeqo → Settings → API → Generate API Key"
                  disabled={!isAdmin}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-3 top-7 text-brand-dark-gray hover:text-brand-black"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {testResult && (
                <div
                  className={`flex items-center gap-2 rounded-sm p-2 text-xs ${
                    testResult.ok
                      ? "bg-green-50 text-green-800"
                      : "bg-red-50 text-red-800"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {testResult.ok
                    ? `Connected to "${testResult.companyName}"`
                    : testResult.error}
                </div>
              )}

              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleTest}
                    disabled={testing || !apiKey}
                  >
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Test Connection
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving || !apiKey}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Save API Key
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Sync section */}
          {status.connected && (
            <>
              <div className="border-t border-gray-100 pt-4">
                <p className="mb-3 text-sm font-600 text-brand-black">Sync Data</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-48">
                    <Input
                      label="Import orders from"
                      type="date"
                      value={sinceDate}
                      onChange={(e) => setSinceDate(e.target.value)}
                      hint="Leave blank to import all history"
                    />
                  </div>
                  <Button onClick={handleSync} disabled={syncing}>
                    {syncing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {syncing ? "Syncing…" : "Sync Now"}
                  </Button>
                  {status.lastSync && (
                    <span className="flex items-center gap-1 text-xs text-brand-dark-gray">
                      <Clock className="h-3 w-3" />
                      Last synced {new Date(status.lastSync).toLocaleString()}
                    </span>
                  )}
                </div>

                {syncResult && !syncResult.ok && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
                    <XCircle className="h-3.5 w-3.5" />
                    {syncResult.error}
                  </div>
                )}
                {syncResult?.ok && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Sync complete — check results below
                  </div>
                )}
              </div>

              {status.lastSyncLog && (
                <SyncLogPanel log={status.lastSyncLog} />
              )}
            </>
          )}

          {/* API key guide */}
          <a
            href="https://www.veeqo.com/support/integrations"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-red hover:underline"
          >
            How to generate a Veeqo API key
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations");
      if (!res.ok) throw new Error("Failed to load integration status");
      const data = (await res.json()) as IntegrationStatus;
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-brand-dark-gray" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="flex items-center gap-2 rounded-sm bg-red-50 p-4 text-sm text-red-700">
        <XCircle className="h-4 w-4" />
        {error ?? "Could not load integrations"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page intro */}
      <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-brand-dark-gray">
        <p className="font-600 text-brand-black mb-1">Connect your platforms</p>
        <p>
          Link Shopify and Veeqo to automatically populate your product catalogue,
          historical sales data, and stock levels. Once connected, run a sync to
          import existing data, then keep it current with real-time webhooks.
        </p>
        {!isAdmin && (
          <div className="mt-3 flex items-center gap-2 rounded-sm bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            You need the <strong>Admin</strong> role to add or edit integration credentials.
            Contact your administrator.
          </div>
        )}
      </div>

      <ShopifyPanel
        status={status.shopify}
        isAdmin={isAdmin}
        onRefresh={fetchStatus}
      />

      <VeeqoPanel
        status={status.veeqo}
        isAdmin={isAdmin}
        onRefresh={fetchStatus}
      />

      {/* Security note */}
      <div className="flex items-start gap-2 rounded-sm border border-gray-200 bg-white p-4 text-xs text-brand-dark-gray">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
        <div>
          <span className="font-600 text-brand-black">Security note: </span>
          API credentials saved here are stored in your database. For production deployments,
          we recommend setting <code className="rounded bg-brand-gray px-1 py-0.5">SHOPIFY_STORE_DOMAIN</code>,{" "}
          <code className="rounded bg-brand-gray px-1 py-0.5">SHOPIFY_ACCESS_TOKEN</code>, and{" "}
          <code className="rounded bg-brand-gray px-1 py-0.5">VEEQO_API_KEY</code>{" "}
          as server environment variables instead — they take priority over database values and are
          never exposed to the browser.
        </div>
      </div>
    </div>
  );
}
