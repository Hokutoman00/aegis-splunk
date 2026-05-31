// Splunk MCP proxy with REST-backed fallback.
//
// Forwards MCP tool calls to the upstream Splunk MCP Server (Splunkbase #7931)
// at SPLUNK_MCP_URL. If the primary path fails (timeout / 5xx / malformed
// JSON), Aegis falls back to a REST shim that talks directly to the Splunk
// REST API. The shim today supports one tool — `splunk_search` mapped to
// /services/search/jobs — so the demo (Scene 3 in the agent's Splunk plan)
// can still return data when the MCP server itself is unhealthy.
//
// TODO Phase 3+:
//   - splunk_indexes (GET /services/data/indexes)
//   - splunk_saved_searches (GET /services/saved/searches)
//   - splunk_users (GET /services/authentication/users)
//   - splunk_kvstore_lookup (GET /servicesNS/.../storage/collections/data/...)
//   - splunk_alert_actions (GET /services/alerts/alert_actions)
// Each new shim handler needs its own request/response mapping in restShimDispatch().

import { ulid } from 'ulid';
import { emitHECEventNoWait } from '../aegis/splunk-audit.js';
import { getEnv } from '../config.js';

export interface MCPProxyRequest {
  tool_name: string;
  args: Record<string, unknown>;
  request_id?: string;
}

export interface MCPProxyResponse {
  ok: boolean;
  data?: unknown;
  error?: { message: string; code?: string; status?: number };
  request_id: string;
  primary_outcome: 'success' | 'timeout' | 'http_5xx' | 'malformed_json' | 'network_error';
  fallback_used: boolean;
  latency_ms: number;
}

export interface SplunkProxyConfig {
  primaryTimeoutMs?: number; // default 5000
  fallbackEnabled?: boolean; // default true
  fetchImpl?: typeof fetch; // injectable for tests
}

const DEFAULT_PRIMARY_TIMEOUT_MS = 5_000;

export async function forwardMCPCall(
  req: MCPProxyRequest,
  config: SplunkProxyConfig = {},
): Promise<MCPProxyResponse> {
  const env = getEnv();
  const request_id = req.request_id ?? ulid();
  const start = Date.now();
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.primaryTimeoutMs ?? DEFAULT_PRIMARY_TIMEOUT_MS;
  const fallbackEnabled = config.fallbackEnabled ?? true;

  const primary = await callPrimary(env.SPLUNK_MCP_URL, req, fetchImpl, timeoutMs);

  if (primary.outcome === 'success') {
    const latency_ms = Date.now() - start;
    emitAudit({
      request_id,
      tool_name: req.tool_name,
      primary_outcome: 'success',
      fallback_used: false,
      latency_ms,
    });
    return {
      ok: true,
      data: primary.data,
      request_id,
      primary_outcome: 'success',
      fallback_used: false,
      latency_ms,
    };
  }

  // Primary failed. Try the REST shim if it can handle this tool.
  if (!fallbackEnabled || !restShimSupports(req.tool_name)) {
    const latency_ms = Date.now() - start;
    emitAudit({
      request_id,
      tool_name: req.tool_name,
      primary_outcome: primary.outcome,
      fallback_used: false,
      latency_ms,
      error_class: primary.outcome,
    });
    return {
      ok: false,
      error: primary.error,
      request_id,
      primary_outcome: primary.outcome,
      fallback_used: false,
      latency_ms,
    };
  }

  const fallback = await restShimDispatch(req, env, fetchImpl, timeoutMs);
  const latency_ms = Date.now() - start;
  emitAudit({
    request_id,
    tool_name: req.tool_name,
    primary_outcome: primary.outcome,
    fallback_used: true,
    latency_ms,
    error_class: primary.outcome,
  });
  return {
    ok: fallback.ok,
    data: fallback.data,
    error: fallback.error,
    request_id,
    primary_outcome: primary.outcome,
    fallback_used: true,
    latency_ms,
  };
}

interface PrimaryOutcome {
  outcome: 'success' | 'timeout' | 'http_5xx' | 'malformed_json' | 'network_error';
  data?: unknown;
  error?: { message: string; code?: string; status?: number };
}

async function callPrimary(
  url: string,
  req: MCPProxyRequest,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<PrimaryOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: req.tool_name, args: req.args }),
      signal: controller.signal,
    });
    if (res.status >= 500) {
      return {
        outcome: 'http_5xx',
        error: { message: `upstream ${res.status}`, status: res.status },
      };
    }
    try {
      const data = await res.json();
      if (!res.ok) {
        return {
          outcome: 'http_5xx',
          error: { message: `upstream ${res.status}`, status: res.status },
        };
      }
      return { outcome: 'success', data };
    } catch (_jsonErr) {
      return { outcome: 'malformed_json', error: { message: 'malformed JSON from upstream' } };
    }
  } catch (err) {
    const e = err as { name?: string; message?: string };
    if (e?.name === 'AbortError') {
      return { outcome: 'timeout', error: { message: 'primary timeout', code: 'timeout' } };
    }
    return {
      outcome: 'network_error',
      error: { message: e?.message ?? 'network error', code: e?.name },
    };
  } finally {
    clearTimeout(timer);
  }
}

// === REST shim ===
// Currently handles one tool. New tools added here per the TODO list above.

function restShimSupports(tool_name: string): boolean {
  return tool_name === 'splunk_search';
}

async function restShimDispatch(
  req: MCPProxyRequest,
  env: ReturnType<typeof getEnv>,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ ok: boolean; data?: unknown; error?: { message: string; status?: number } }> {
  if (req.tool_name === 'splunk_search') {
    return restSearch(req.args, env, fetchImpl, timeoutMs);
  }
  return { ok: false, error: { message: `REST shim does not support ${req.tool_name}` } };
}

async function restSearch(
  args: Record<string, unknown>,
  env: ReturnType<typeof getEnv>,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ ok: boolean; data?: unknown; error?: { message: string; status?: number } }> {
  // Splunk REST: POST /services/search/jobs with `search=<SPL>` + `exec_mode=oneshot`
  // returns the result inline (no job polling). Adequate for the demo path.
  const base = env.SPLUNK_HOSTED_MODELS_BASE.replace(/\/services\/ai\/?$/, '');
  const url = `${base}/services/search/jobs?output_mode=json`;
  const search = String(args.search ?? args.query ?? '');
  if (!search) {
    return { ok: false, error: { message: 'splunk_search requires `search` or `query` arg' } };
  }
  const form = new URLSearchParams({ search, exec_mode: 'oneshot', output_mode: 'json' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SPLUNK_SESSION_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: { message: `splunk rest ${res.status}`, status: res.status } };
    }
    try {
      const data = await res.json();
      return { ok: true, data };
    } catch {
      return { ok: false, error: { message: 'malformed JSON from splunk REST' } };
    }
  } catch (err) {
    const e = err as { name?: string; message?: string };
    return { ok: false, error: { message: e?.message ?? 'rest shim network error' } };
  } finally {
    clearTimeout(timer);
  }
}

// === Audit ===

interface AuditFields extends Record<string, unknown> {
  request_id: string;
  tool_name: string;
  primary_outcome: string;
  fallback_used: boolean;
  latency_ms: number;
  error_class?: string;
}

function emitAudit(fields: AuditFields): void {
  // Console first — guaranteed visibility in the demo log.
  console.log(`[aegis.mcp-failover] ${JSON.stringify(fields)}`);
  // HEC second — best-effort, non-blocking, errors swallowed.
  emitHECEventNoWait({
    sourcetype: 'aegis:mcp-failover',
    event: fields,
    source: 'aegis:splunk-proxy',
  });
}
