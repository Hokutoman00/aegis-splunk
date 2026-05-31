// demo/agent-client.ts — minimal SOC agent that drives the 3-minute demo.
//
// Uses aegis-splunk as its LLM gateway (OpenAI SDK pointed at the local
// aegis server) and aegis-splunk's MCP proxy as its tool surface. One
// realistic SOC question is asked; the model streams its reasoning so the
// video can record it naturally. The MCP call to `splunk_search` is fired
// explicitly so the demo can show the REST-shim failover when the chaos
// script kills Splunk MCP at T+0:50.
//
// CLI:
//   bun run demo/agent-client.ts
//
// Env (defaults are demo-friendly):
//   AEGIS_BASE   — aegis-splunk server URL (default http://localhost:3000)
//   AEGIS_MODEL  — virtual model name to call (default: server default)

import OpenAI from 'openai';

const AEGIS_BASE = process.env.AEGIS_BASE ?? 'http://localhost:3000';
const AEGIS_MODEL = process.env.AEGIS_MODEL ?? 'aegis-resilient/claude-with-fallback';

const llm = new OpenAI({
  apiKey: 'aegis-demo',
  baseURL: `${AEGIS_BASE}/v1`,
});

const SOC_QUESTION =
  'Investigate the failed-login spike around 02:09-02:14 UTC against user admin_socops. ' +
  'Identify the source IPs and assess whether the pattern is consistent with credential ' +
  'stuffing. The 02:13:54 successful login from 203.0.113.47 — is it the attacker?';

function ts(): string {
  return new Date().toISOString();
}

function log(label: string, extra: Record<string, unknown> = {}): void {
  console.log(`[${ts()}] [agent-client] ${label} ${JSON.stringify(extra)}`);
}

async function runSplunkSearch(): Promise<unknown> {
  // Fire splunk_search through the aegis MCP proxy. During the chaos cascade
  // this call's primary will return 503 and the REST shim takes over; the
  // agent sees the same response shape either way.
  const body = {
    tool: { name: 'splunk_search', 'x-aegis-idempotent': true },
    args: {
      search:
        'search index=main sourcetype=linux_secure user=admin_socops earliest=-15m | ' +
        'stats count by srcIP, status_code | sort -count',
    },
    primary: { name: 'splunk_mcp', latency_ms: 80 },
    secondary: { name: 'splunk_rest_shim', latency_ms: 120 },
  };
  const res = await fetch(`${AEGIS_BASE}/v1/mcp/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function streamReasoning(toolResult: unknown): Promise<void> {
  const stream = await llm.chat.completions.create({
    model: AEGIS_MODEL,
    stream: true,
    messages: [
      {
        role: 'system',
        content:
          'You are a SOC analyst assistant. Be concise. When given Splunk results, name ' +
          'compromised users, list source IPs, and assess credential-stuffing likelihood ' +
          'on a 1-5 scale with one-sentence justification.',
      },
      { role: 'user', content: SOC_QUESTION },
      {
        role: 'assistant',
        content: 'Running splunk_search via MCP…',
      },
      {
        role: 'user',
        content: `splunk_search returned:\n${JSON.stringify(toolResult, null, 2)}\n\nProceed with the assessment.`,
      },
    ],
  });

  process.stdout.write('\n--- AGENT RESPONSE (streaming) ---\n');
  let totalChars = 0;
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      process.stdout.write(delta);
      totalChars += delta.length;
    }
  }
  process.stdout.write('\n--- END RESPONSE ---\n');
  log('stream_complete', { chars: totalChars });
}

async function main(): Promise<void> {
  log('agent_start', { aegis_base: AEGIS_BASE, model: AEGIS_MODEL });

  log('mcp_call_start', { tool: 'splunk_search' });
  const toolResult = await runSplunkSearch().catch((err) => {
    log('mcp_call_error', { error: (err as Error).message });
    return { ok: false, error: { message: (err as Error).message } };
  });
  log('mcp_call_complete', {
    ok: (toolResult as { ok?: boolean }).ok ?? false,
    fallback_used: (toolResult as { fallback_used?: boolean }).fallback_used ?? false,
    primary_outcome: (toolResult as { primary_outcome?: string }).primary_outcome,
  });

  await streamReasoning(toolResult);

  log('agent_complete', { result: 'investigation_done' });
}

main().catch((err) => {
  console.error('[agent-client] fatal:', err);
  process.exit(1);
});
