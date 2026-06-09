// Splunk AI Assistant (SAIA) — aegis-splunk drop-in integration example
//
// Drop aegis-splunk under a Splunk AI Assistant agent by changing a single
// env var. The AI Assistant sees a standard OpenAI-compatible endpoint; it
// doesn't need to know about hedging, fallbacks, or chaos verification.
//
// Before:  SAIA → Splunk hosted models (gpt-oss-120b)
// After:   SAIA → aegis-splunk → { gpt-oss-120b (primary) ∥ foundation-ai-security (hedge) }
//                                   └ HEC audit on every recovery, visible in Splunk Search

import OpenAI from 'openai';

// ─────────────────────────────────────────────────────────────────────────────
// 1. One-line swap: point your AI Assistant's client at aegis-splunk
// ─────────────────────────────────────────────────────────────────────────────

const aegisBaseUrl = process.env.AEGIS_BASE ?? 'http://localhost:3000/v1';

// This is the only change vs. calling Splunk hosted models directly.
// All OpenAI SDK calls work unchanged.
const client = new OpenAI({
  apiKey: process.env.SPLUNK_SESSION_TOKEN ?? 'your-splunk-session-token',
  baseURL: aegisBaseUrl,
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Standard AI Assistant call — no code changes needed in your agent
// ─────────────────────────────────────────────────────────────────────────────

async function saiaAgentTurn(userMessage: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: 'gpt-oss-120b', // primary Splunk hosted model
    messages: [
      {
        role: 'system',
        content:
          'You are a SOC analyst assistant running on Splunk Enterprise. ' +
          'Help analysts investigate alerts and correlate events.',
      },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 512,
    // Aegis extension headers (optional — omit to use server defaults)
    // @ts-expect-error aegis-specific headers are passed as extra body fields
    'x-aegis-hedge': {
      hedge_after_ms: 800, // fire a hedge after 800ms if primary is slow
      hedge_model: 'foundation-ai-security', // Splunk's security-specialized model
      hedge_via: 'splunk', // route hedge through Splunk hosted models
    },
  });

  const content = response.choices[0]?.message?.content ?? '(no response)';

  // Every recovery or hedge win is automatically emitted to your Splunk index
  // as sourcetype="aegis:chaos" or sourcetype="aegis:mcp-failover".
  // Search: index=main sourcetype="aegis:*" earliest=-15m
  return content;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Foundation AI Security as primary — security-domain workloads
// ─────────────────────────────────────────────────────────────────────────────

async function securityAnalysisTurn(alertJson: string): Promise<string> {
  // For security-specific analysis, use foundation-ai-security as the primary
  // and hedge to gpt-oss-120b for general reasoning backup.
  const response = await client.chat.completions.create({
    model: 'foundation-ai-security',
    messages: [
      { role: 'system', content: 'Analyze this security alert and suggest triage steps.' },
      { role: 'user', content: alertJson },
    ],
    max_tokens: 256,
    // @ts-expect-error aegis-specific headers
    'x-aegis-hedge': {
      hedge_after_ms: 600,
      hedge_model: 'gpt-oss-120b',
      hedge_via: 'splunk',
    },
  });
  return response.choices[0]?.message?.content ?? '(no response)';
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Run both turns to verify the integration
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('aegis-splunk × SAIA integration example\n');

  console.log(
    '── Turn 1: general analyst query (gpt-oss-120b primary + foundation-ai-security hedge)',
  );
  const turn1 = await saiaAgentTurn(
    'Alert fired: 47 failed SSH logins from 192.0.2.100 in 5 minutes. What should I check first?',
  );
  console.log('Response:', turn1.slice(0, 200), '...\n');

  console.log('── Turn 2: security analysis (foundation-ai-security primary + gpt-oss-120b hedge)');
  const turn2 = await securityAnalysisTurn(
    JSON.stringify({ alert: 'brute_force', src_ip: '192.0.2.100', count: 47, window_min: 5 }),
  );
  console.log('Response:', turn2.slice(0, 200), '...\n');

  console.log('✓ Both turns completed. Check Splunk Search for aegis:* events:');
  console.log('  index=main sourcetype="aegis:*" earliest=-5m');
}

main().catch(console.error);
