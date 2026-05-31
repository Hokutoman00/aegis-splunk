// Splunk HEC audit emitter. Aegis ships structured events to Splunk's HTTP
// Event Collector so chaos drills, MCP failovers, and hedge outcomes land in
// the same index a SOC analyst is already watching. Two sourcetypes are
// reserved here so dashboards can split them cleanly:
//
//   aegis:chaos         — chaos engine outcomes (L6 scenarios)
//   aegis:mcp-failover  — MCP proxy primary→fallback events (Phase 2)
//
// HEC POST shape (per Splunk docs):
//   POST <SPLUNK_HEC_URL>/event
//   Authorization: Splunk <SPLUNK_HEC_TOKEN>
//   Content-Type: application/json
//   Body: { event: <obj|str>, sourcetype, source, time }
//
// Non-blocking: errors are swallowed so the audit pipeline cannot take down
// the request path. Returns a promise that always resolves.

import { getEnv } from '../config.js';

export type AegisSourcetype = 'aegis:chaos' | 'aegis:mcp-failover';

export interface HECEvent {
  sourcetype: AegisSourcetype;
  event: Record<string, unknown> | string;
  source?: string;
  time?: number; // epoch seconds; defaults to now
}

export interface HECEmitResult {
  attempted: boolean;
  ok: boolean;
  status?: number;
  error_class?: string;
}

// Configurable per-call timeout so a slow HEC endpoint can't stall the
// request path. Conservative default; chaos scenarios can pass shorter.
const DEFAULT_HEC_TIMEOUT_MS = 1_500;

export async function emitHECEvent(
  evt: HECEvent,
  opts?: { timeoutMs?: number },
): Promise<HECEmitResult> {
  const env = getEnv();
  // Token presence is a runtime gate (operator may rotate / un-provision it
  // without rebooting the server), so read it live from process.env rather
  // than relying on the cached env snapshot.
  const hecUrl = process.env.SPLUNK_HEC_URL || env.SPLUNK_HEC_URL;
  const hecToken = process.env.SPLUNK_HEC_TOKEN ?? env.SPLUNK_HEC_TOKEN;
  if (!hecUrl || !hecToken) {
    return { attempted: false, ok: false };
  }

  const body = JSON.stringify({
    event: evt.event,
    sourcetype: evt.sourcetype,
    source: evt.source ?? 'aegis',
    time: evt.time ?? Math.floor(Date.now() / 1000),
  });

  const url = hecUrl.endsWith('/event') ? hecUrl : `${hecUrl.replace(/\/$/, '')}/event`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_HEC_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Splunk ${hecToken}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
    return { attempted: true, ok: res.ok, status: res.status };
  } catch (err) {
    const e = err as { name?: string; message?: string };
    return {
      attempted: true,
      ok: false,
      error_class: e?.name === 'AbortError' ? 'timeout' : (e?.name ?? 'fetch_error'),
    };
  } finally {
    clearTimeout(timer);
  }
}

// Fire-and-forget convenience. Callers that don't care about HEC delivery
// (most request-path emitters) should use this so the promise can be dropped.
export function emitHECEventNoWait(evt: HECEvent, opts?: { timeoutMs?: number }): void {
  emitHECEvent(evt, opts).catch(() => {
    /* swallowed by contract */
  });
}
