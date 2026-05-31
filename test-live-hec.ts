// Local: verify emitHECEvent against live Splunk Enterprise (deleteable)
process.env.TRUEFOUNDRY_API_KEY = 'dryrun-placeholder-not-a-real-token-12345678';
process.env.TRUEFOUNDRY_OPENAI_BASE = 'https://dryrun.local.invalid/api/llm/api/inference/openai';
process.env.TRUEFOUNDRY_VIRTUAL_MODEL = 'aegis-resilient/claude-with-fallback';
process.env.SPLUNK_HEC_URL = 'http://localhost:8088/services/collector';
process.env.SPLUNK_HEC_TOKEN = '744ed749-c3c9-4416-ba98-259b33fef705';

import { emitHECEvent } from './src/aegis/splunk-audit.js';

const events = [
  { sourcetype: 'aegis:chaos' as const, event: { drill_id: 'd-001', target: 'anthropic', mode: 'shadow', injected: '503', expected_fallback: 'openai', observed: 'openai responded 200 in 1.2s', verdict: 'PASS', receipt_sig: 'ed25519:7f3a' } },
  { sourcetype: 'aegis:chaos' as const, event: { drill_id: 'd-002', target: 'openai', mode: 'shadow', injected: 'credit_balance_too_low', expected_fallback: 'anthropic', observed: 'anthropic responded 200 in 0.9s', verdict: 'PASS', receipt_sig: 'ed25519:8a4b' } },
  { sourcetype: 'aegis:mcp-failover' as const, event: { request_id: 'req-9f1', primary: 'splunk-mcp-cloud', primary_error: 'ECONNREFUSED', fallback: 'splunk-rest-shim', fallback_status: 200, latency_ms: 340 } },
];

for (const evt of events) {
  const r = await emitHECEvent(evt);
  console.log(`[${evt.sourcetype}] attempted=${r.attempted} ok=${r.ok} status=${r.status ?? '-'} error=${r.error_class ?? '-'}`);
}
