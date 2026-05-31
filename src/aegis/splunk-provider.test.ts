import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const ORIGINAL_ENV = { ...process.env };

const constructorCalls: Array<{ apiKey?: string; baseURL?: string }> = [];

mock.module('openai', () => {
  class FakeOpenAI {
    apiKey: string | undefined;
    baseURL: string | undefined;
    constructor(opts: { apiKey?: string; baseURL?: string }) {
      this.apiKey = opts.apiKey;
      this.baseURL = opts.baseURL;
      constructorCalls.push({ apiKey: opts.apiKey, baseURL: opts.baseURL });
    }
  }
  return { default: FakeOpenAI };
});

async function loadFreshModule(): Promise<typeof import('./splunk-client.js')> {
  // Bun caches module instances; force a fresh evaluation so the cached
  // singleton inside splunk-client.ts doesn't bleed across tests.
  const url = `./splunk-client.ts?t=${Date.now()}-${Math.random()}`;
  return (await import(url)) as typeof import('./splunk-client.js');
}

beforeEach(() => {
  constructorCalls.length = 0;
  process.env.SPLUNK_HOSTED_MODELS_BASE = 'https://splunk.test.example:8089/services/ai';
  process.env.SPLUNK_SESSION_TOKEN = 'test-splunk-session-token-1234567890';
  process.env.SPLUNK_HEC_URL = 'https://splunk.test.example:8088/services/collector';
  process.env.SPLUNK_HEC_TOKEN = 'test-hec-token';
  // Required by config.ts EnvSchema. Length must satisfy z.string().min(20).
  process.env.TRUEFOUNDRY_API_KEY = 'tf-test-key-abcdefghijklmnop';
  process.env.TRUEFOUNDRY_OPENAI_BASE = 'https://tf.test.example/openai';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('splunk-client', () => {
  test('getSplunkClient() returns a non-null OpenAI client', async () => {
    const mod = await loadFreshModule();
    const client = mod.getSplunkClient();
    expect(client).not.toBeNull();
    expect(client).toBeDefined();
  });

  test('base URL matches the env value', async () => {
    const mod = await loadFreshModule();
    mod.getSplunkClient();
    expect(constructorCalls.length).toBeGreaterThan(0);
    expect(constructorCalls[0]?.baseURL).toBe('https://splunk.test.example:8089/services/ai');
  });

  test('auth header would carry the configured session token', async () => {
    const mod = await loadFreshModule();
    mod.getSplunkClient();
    expect(constructorCalls[0]?.apiKey).toBe('test-splunk-session-token-1234567890');
  });

  test('exposes the expected Splunk-hosted model identifiers', async () => {
    const mod = await loadFreshModule();
    const models = mod.getSplunkModels();
    expect(models).toContain('gpt-oss-120b');
    expect(models).toContain('gpt-oss-20b');
    expect(models).toContain('foundation-ai-security');
  });

  test('Foundation AI Security convenience getter returns the security model', async () => {
    const mod = await loadFreshModule();
    expect(mod.getSplunkFoundationAIModel()).toBe('foundation-ai-security');
  });

  test('client is cached across calls (constructor only invoked once)', async () => {
    const mod = await loadFreshModule();
    const a = mod.getSplunkClient();
    const b = mod.getSplunkClient();
    expect(a).toBe(b);
    expect(constructorCalls.length).toBe(1);
  });
});
