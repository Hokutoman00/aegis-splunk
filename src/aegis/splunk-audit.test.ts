import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

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
  globalThis.fetch = ORIGINAL_FETCH;
});

async function loadFreshAudit(): Promise<typeof import('./splunk-audit.js')> {
  const audit: typeof import('./splunk-audit.js') = await import(
    `./splunk-audit.ts?t=${Date.now()}-${Math.random()}`
  );
  return audit;
}

describe('emitHECEvent', () => {
  test('POSTs to <HEC_URL>/event with Splunk auth header and sourcetype', async () => {
    let captured: { url: string; init?: RequestInit } | null = null;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init };
      return new Response('{"text":"Success"}', { status: 200 });
    }) as unknown as typeof fetch;

    const audit = await loadFreshAudit();
    const result = await audit.emitHECEvent({
      sourcetype: 'aegis:mcp-failover',
      event: { request_id: 'rid-1', tool_name: 'splunk_search', primary_outcome: 'http_5xx' },
    });

    expect(result.attempted).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(captured).not.toBeNull();
    const cap = captured as unknown as { url: string; init: RequestInit };
    expect(cap.url).toContain('/services/collector/event');
    const headers = cap.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Splunk test-hec-token');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(cap.init.body));
    expect(body.sourcetype).toBe('aegis:mcp-failover');
    expect(body.event.tool_name).toBe('splunk_search');
    expect(typeof body.time).toBe('number');
  });

  test('skips POST when HEC token is unset (no SPLUNK_HEC_TOKEN)', async () => {
    process.env.SPLUNK_HEC_TOKEN = '';
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const audit = await loadFreshAudit();
    const result = await audit.emitHECEvent({
      sourcetype: 'aegis:chaos',
      event: { scene: 'baseline' },
    });

    expect(result.attempted).toBe(false);
    expect(result.ok).toBe(false);
    expect(called).toBe(0);
  });

  test('swallows fetch errors (returns ok:false but does not throw)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const audit = await loadFreshAudit();
    const result = await audit.emitHECEvent({
      sourcetype: 'aegis:mcp-failover',
      event: { request_id: 'rid-err' },
    });

    expect(result.attempted).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error_class).toBeDefined();
  });

  test('emitHECEventNoWait never throws even when fetch rejects', async () => {
    globalThis.fetch = (async () => {
      throw new Error('fail');
    }) as unknown as typeof fetch;

    const audit = await loadFreshAudit();
    expect(() =>
      audit.emitHECEventNoWait({
        sourcetype: 'aegis:chaos',
        event: { scene: 'scene-3' },
      }),
    ).not.toThrow();
    // Give the swallowed catch a tick to run.
    await new Promise((res) => setTimeout(res, 5));
  });

  test('aborts on timeout (error_class: timeout)', async () => {
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const sig = init?.signal;
        if (sig) {
          sig.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        }
        // Never resolves on its own — only abort can settle it.
      });
    }) as unknown as typeof fetch;

    const audit = await loadFreshAudit();
    const result = await audit.emitHECEvent(
      { sourcetype: 'aegis:chaos', event: { scene: 'slow' } },
      { timeoutMs: 20 },
    );
    expect(result.attempted).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error_class).toBe('timeout');
  });
});
