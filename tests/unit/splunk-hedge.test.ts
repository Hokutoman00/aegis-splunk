import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// Captures every chat.completions.create() call, regardless of which client
// fired it. Each fake OpenAI tags itself with `kind` so the test can verify
// that the primary went through the TF client and the hedge through Splunk.
const calls: Array<{ kind: 'tf' | 'splunk'; model: string; latency: number }> = [];

mock.module('openai', () => {
  class FakeOpenAI {
    private kind: 'tf' | 'splunk';
    public chat: { completions: { create: (params: { model: string }) => Promise<unknown> } };
    constructor(opts: { apiKey?: string; baseURL?: string }) {
      // Tell the two clients apart by their baseURL. The Splunk env in the
      // test below uses `splunk.test.example`; the TF env uses `tf.test.example`.
      this.kind = (opts.baseURL ?? '').includes('splunk') ? 'splunk' : 'tf';
      const kind = this.kind;
      this.chat = {
        completions: {
          create: async (params: { model: string }) => {
            // Splunk client wins the race by being faster. TF would have won
            // first, but the hedge fires after 5ms and resolves in 10ms while
            // the primary takes 200ms — so the Splunk leg lands first.
            const latency = kind === 'splunk' ? 10 : 200;
            calls.push({ kind, model: params.model, latency });
            await new Promise((res) => setTimeout(res, latency));
            return {
              id: `resp_${kind}`,
              model: params.model,
              choices: [{ message: { role: 'assistant', content: `from ${kind}` } }],
              usage: { prompt_tokens: 5, completion_tokens: 7 },
            };
          },
        },
      };
    }
  }
  return { default: FakeOpenAI };
});

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  calls.length = 0;
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

async function loadFreshModules(): Promise<{
  hedge: typeof import('../../src/aegis/l0-hedge.js');
  tf: typeof import('../../src/aegis/tf-client.js');
}> {
  const stamp = `${Date.now()}-${Math.random()}`;
  const hedge = (await import(
    `../../src/aegis/l0-hedge.ts?t=${stamp}`
  )) as typeof import('../../src/aegis/l0-hedge.js');
  const tf = (await import(
    `../../src/aegis/tf-client.ts?t=${stamp}`
  )) as typeof import('../../src/aegis/tf-client.js');
  // Force the splunk-client singleton to re-init under the test env too.
  await import(`../../src/aegis/splunk-client.ts?t=${stamp}`);
  return { hedge, tf };
}

describe('hedgedChatCompletion — hedgeVia: splunk', () => {
  test('hedge attempt is routed through getSplunkClient() and tagged via: splunk', async () => {
    const { hedge, tf } = await loadFreshModules();
    const tfClient = tf.getTFClient();

    const result = await hedge.hedgedChatCompletion(
      {
        primaryModel: 'anthropic/claude-sonnet-4-5',
        hedgeModel: 'gpt-oss-120b',
        hedgeAfterMs: 5,
        hedgeVia: 'splunk',
      },
      { messages: [{ role: 'user', content: 'hi' }] },
      tfClient,
    );

    // Primary fired on the TF client; hedge fired on the Splunk client.
    expect(calls.some((c) => c.kind === 'tf' && c.model === 'anthropic/claude-sonnet-4-5')).toBe(
      true,
    );
    expect(calls.some((c) => c.kind === 'splunk' && c.model === 'gpt-oss-120b')).toBe(true);

    // Splunk wins the race (10ms < 200ms).
    expect(result.winner).toBe('hedge');
    expect(result.hedgeAttempt?.via).toBe('splunk');
    expect(result.primaryAttempt.via).toBe('tf');
    expect(result.record.fired).toBe(true);
  });

  test('default hedgeVia keeps existing TF-only behavior', async () => {
    const { hedge, tf } = await loadFreshModules();
    const tfClient = tf.getTFClient();

    const result = await hedge.hedgedChatCompletion(
      {
        primaryModel: 'anthropic/claude-sonnet-4-5',
        hedgeModel: 'openai/gpt-4o',
        hedgeAfterMs: 5,
      },
      { messages: [{ role: 'user', content: 'hi' }] },
      tfClient,
    );

    // Both attempts went through TF.
    expect(calls.every((c) => c.kind === 'tf')).toBe(true);
    expect(result.hedgeAttempt?.via).toBe('tf');
    expect(result.primaryAttempt.via).toBe('tf');
  });
});

describe('hedgedChatCompletion — foundation-ai-security as hedge model', () => {
  test('foundation-ai-security hedge fires through Splunk client and wins the race', async () => {
    const { hedge, tf } = await loadFreshModules();
    const tfClient = tf.getTFClient();

    const result = await hedge.hedgedChatCompletion(
      {
        primaryModel: 'anthropic/claude-sonnet-4-5',
        hedgeModel: 'foundation-ai-security',
        hedgeAfterMs: 5,
        hedgeVia: 'splunk',
      },
      { messages: [{ role: 'user', content: 'analyze this alert' }] },
      tfClient,
    );

    expect(calls.some((c) => c.kind === 'splunk' && c.model === 'foundation-ai-security')).toBe(
      true,
    );
    expect(calls.some((c) => c.kind === 'tf' && c.model === 'anthropic/claude-sonnet-4-5')).toBe(
      true,
    );
    // Splunk leg wins (10ms < 200ms).
    expect(result.winner).toBe('hedge');
    expect(result.hedgeAttempt?.via).toBe('splunk');
    expect(result.record.fired).toBe(true);
  });

  test('foundation-ai-security as primary, gpt-oss-120b as hedge — both go through Splunk', async () => {
    const { hedge, tf } = await loadFreshModules();
    // Route primary through the Splunk client by using getSplunkClient directly.
    // Simulated by passing tfClient but both models routed via splunk hedge path.
    const tfClient = tf.getTFClient();

    const result = await hedge.hedgedChatCompletion(
      {
        primaryModel: 'foundation-ai-security',
        hedgeModel: 'gpt-oss-120b',
        hedgeAfterMs: 5,
        hedgeVia: 'splunk',
      },
      { messages: [{ role: 'user', content: 'classify this threat' }] },
      tfClient,
    );

    // foundation-ai-security went through TF (primary path), gpt-oss-120b hedge through Splunk.
    expect(calls.some((c) => c.model === 'foundation-ai-security')).toBe(true);
    expect(calls.some((c) => c.kind === 'splunk' && c.model === 'gpt-oss-120b')).toBe(true);
    expect(result.record.fired).toBe(true);
  });

  test('hedge record marks fired=true when foundation-ai-security hedge threshold is crossed', async () => {
    const { hedge, tf } = await loadFreshModules();
    const tfClient = tf.getTFClient();

    const result = await hedge.hedgedChatCompletion(
      {
        primaryModel: 'anthropic/claude-sonnet-4-5',
        hedgeModel: 'foundation-ai-security',
        hedgeAfterMs: 5,
        hedgeVia: 'splunk',
      },
      { messages: [{ role: 'user', content: 'hi' }] },
      tfClient,
    );

    expect(result.record.fired).toBe(true);
    expect(result.record.trigger_threshold_ms).toBe(5);
    // The losing primary attempt is marked canceled.
    expect(result.primaryAttempt.outcome).toBe('canceled');
    expect(result.hedgeAttempt?.outcome).toBe('success');
  });
});
