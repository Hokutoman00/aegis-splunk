import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { forwardMCPCall } from './splunk-proxy.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.TRUEFOUNDRY_API_KEY = 'tf-test-key-abcdefghijklmnop';
  process.env.TRUEFOUNDRY_OPENAI_BASE = 'https://tf.test.example/openai';
  process.env.SPLUNK_HOSTED_MODELS_BASE = 'https://splunk.test.example:8089/services/ai';
  process.env.SPLUNK_SESSION_TOKEN = 'test-splunk-session-token-1234567890';
  process.env.SPLUNK_HEC_URL = 'https://splunk.test.example:8088/services/collector';
  process.env.SPLUNK_HEC_TOKEN = 'test-hec-token';
  process.env.SPLUNK_MCP_URL = 'http://localhost:8089/services/mcp';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('forwardMCPCall', () => {
  test('primary success returns data without firing fallback', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return jsonResponse({ events: [{ _raw: 'ok' }] });
    }) as unknown as typeof fetch;

    const res = await forwardMCPCall(
      { tool_name: 'splunk_search', args: { search: 'index=main' } },
      { fetchImpl },
    );

    expect(res.ok).toBe(true);
    expect(res.primary_outcome).toBe('success');
    expect(res.fallback_used).toBe(false);
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain('localhost:8089/services/mcp');
  });

  test('primary 503 → REST shim fallback path is exercised', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('/services/mcp')) {
        return new Response('upstream busy', { status: 503 });
      }
      if (u.includes('/services/search/jobs')) {
        return jsonResponse({ results: [{ host: 'web-01' }] });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const res = await forwardMCPCall(
      { tool_name: 'splunk_search', args: { search: 'index=main' } },
      { fetchImpl },
    );

    expect(res.primary_outcome).toBe('http_5xx');
    expect(res.fallback_used).toBe(true);
    expect(res.ok).toBe(true);
    expect(calls.some((c) => c.includes('/services/mcp'))).toBe(true);
    expect(calls.some((c) => c.includes('/services/search/jobs'))).toBe(true);
  });

  test('malformed JSON from primary triggers fallback', async () => {
    const fetchImpl = (async (url: string) => {
      const u = String(url);
      if (u.includes('/services/mcp')) {
        return new Response('not json at all', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return jsonResponse({ results: [] });
    }) as unknown as typeof fetch;

    const res = await forwardMCPCall(
      { tool_name: 'splunk_search', args: { search: 'index=_internal' } },
      { fetchImpl },
    );

    expect(res.primary_outcome).toBe('malformed_json');
    expect(res.fallback_used).toBe(true);
    expect(res.ok).toBe(true);
  });

  test('REST shim does not handle unknown tools — returns primary error', async () => {
    const fetchImpl = (async () =>
      new Response('boom', { status: 503 })) as unknown as typeof fetch;

    const res = await forwardMCPCall({ tool_name: 'splunk_indexes', args: {} }, { fetchImpl });

    expect(res.primary_outcome).toBe('http_5xx');
    expect(res.fallback_used).toBe(false);
    expect(res.ok).toBe(false);
  });

  test('request_id is preserved when supplied', async () => {
    const fetchImpl = (async () => jsonResponse({ ok: 1 })) as unknown as typeof fetch;
    const res = await forwardMCPCall(
      { tool_name: 'splunk_search', args: { search: '...' }, request_id: 'rid-abc' },
      { fetchImpl },
    );
    expect(res.request_id).toBe('rid-abc');
  });
});
