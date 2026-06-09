// Seed Splunk with realistic aegis events spanning the past hour for dashboard demo
process.env.TRUEFOUNDRY_API_KEY = 'dryrun-placeholder-not-a-real-token-12345678';
process.env.TRUEFOUNDRY_OPENAI_BASE = 'https://dryrun.local.invalid/api/llm/api/inference/openai';
process.env.TRUEFOUNDRY_VIRTUAL_MODEL = 'aegis-resilient/claude-with-fallback';
process.env.SPLUNK_HEC_URL = 'http://localhost:8088/services/collector';
process.env.SPLUNK_HEC_TOKEN = 'dryrun-placeholder-not-a-real-token';

import { emitHECEvent } from './src/aegis/splunk-audit.js';

const now = Math.floor(Date.now() / 1000);
const HOUR = 3600;

const chaosScenarios = [
  {
    target: 'anthropic',
    injected: '503',
    expected_fallback: 'openai',
    observed: 'openai responded 200 in 1.2s',
    verdict: 'PASS',
    latency_ms: 1200,
  },
  {
    target: 'openai',
    injected: 'credit_balance_too_low',
    expected_fallback: 'anthropic',
    observed: 'anthropic responded 200 in 0.9s',
    verdict: 'PASS',
    latency_ms: 900,
  },
  {
    target: 'anthropic',
    injected: '429',
    expected_fallback: 'openai',
    observed: 'openai responded 200 in 0.8s',
    verdict: 'PASS',
    latency_ms: 800,
  },
  {
    target: 'openai',
    injected: '500',
    expected_fallback: 'anthropic',
    observed: 'anthropic responded 200 in 1.1s',
    verdict: 'PASS',
    latency_ms: 1100,
  },
  {
    target: 'anthropic',
    injected: 'timeout',
    expected_fallback: 'openai',
    observed: 'openai responded 200 in 1.5s',
    verdict: 'PASS',
    latency_ms: 1500,
  },
  {
    target: 'openai',
    injected: 'invalid_request',
    expected_fallback: 'anthropic',
    observed: 'fallback chain exhausted',
    verdict: 'FAIL',
    latency_ms: 4500,
  },
  {
    target: 'anthropic',
    injected: 'overloaded',
    expected_fallback: 'openai',
    observed: 'openai responded 200 in 1.0s',
    verdict: 'PASS',
    latency_ms: 1000,
  },
  {
    target: 'openai',
    injected: 'model_deprecated',
    expected_fallback: 'anthropic',
    observed: 'anthropic responded 200 in 1.3s',
    verdict: 'PASS',
    latency_ms: 1300,
  },
];

const mcpFailovers = [
  {
    primary: 'splunk-mcp-cloud',
    primary_error: 'ECONNREFUSED',
    fallback: 'splunk-rest-shim',
    fallback_status: 200,
    latency_ms: 340,
  },
  {
    primary: 'splunk-mcp-cloud',
    primary_error: 'timeout_2s',
    fallback: 'splunk-rest-shim',
    fallback_status: 200,
    latency_ms: 220,
  },
  {
    primary: 'splunk-mcp-cloud',
    primary_error: 'tls_error',
    fallback: 'splunk-rest-shim',
    fallback_status: 200,
    latency_ms: 410,
  },
  {
    primary: 'splunk-mcp-cloud',
    primary_error: 'rate_limit',
    fallback: 'splunk-rest-shim',
    fallback_status: 200,
    latency_ms: 180,
  },
  {
    primary: 'splunk-mcp-cloud',
    primary_error: '503_unavailable',
    fallback: 'splunk-rest-shim',
    fallback_status: 200,
    latency_ms: 290,
  },
  {
    primary: 'splunk-mcp-cloud',
    primary_error: 'dns_failure',
    fallback: 'splunk-rest-shim',
    fallback_status: 200,
    latency_ms: 520,
  },
];

let drillId = 100;
let reqId = 1000;
let okCount = 0;
let failCount = 0;

// Spread events across the past 50 minutes
for (let i = 0; i < chaosScenarios.length; i++) {
  const s = chaosScenarios[i];
  const eventTime = now - (50 - i * 6) * 60; // most recent last
  const r = await emitHECEvent({
    sourcetype: 'aegis:chaos',
    time: eventTime,
    event: {
      drill_id: `d-${drillId++}`,
      mode: 'shadow',
      receipt_sig: `ed25519:${Math.random().toString(16).slice(2, 10)}`,
      ...s,
    },
  });
  if (r.ok) okCount++;
  else failCount++;
}

for (let i = 0; i < mcpFailovers.length; i++) {
  const f = mcpFailovers[i];
  const eventTime = now - (45 - i * 7) * 60;
  const r = await emitHECEvent({
    sourcetype: 'aegis:mcp-failover',
    time: eventTime,
    event: {
      request_id: `req-${reqId++}`,
      ...f,
    },
  });
  if (r.ok) okCount++;
  else failCount++;
}

console.log(
  `seeded: ok=${okCount} fail=${failCount} (${chaosScenarios.length} chaos + ${mcpFailovers.length} mcp-failover)`,
);
