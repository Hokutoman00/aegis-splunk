// demo/chaos-script.ts — deterministic outage cascade for the 3-minute demo.
//
// Plays the SOC P1 scenario beat-for-beat against a running aegis-splunk
// server. Each step flips a chaos toggle (env var) AND emits a structured
// HEC event so the Splunk dashboard reflects the cascade in real time. The
// timings line up with SCENARIO.md so the video edit only needs the
// narration dubbed over a single take.
//
// CLI:
//   bun run demo/chaos-script.ts --scenario soc-p1
//
// Exit codes:
//   0 — scenario completed (HEC may or may not have been reachable)
//   2 — bad CLI args
//   3 — HEC was configured but unreachable (scenario still runs to completion;
//       exit is deferred so the video can finish)

import { emitHECEvent } from '../src/aegis/splunk-audit.js';
import { getEnv } from '../src/config.js';

interface Step {
  at_seconds: number;
  label: string;
  action: () => Promise<void> | void;
}

const env = getEnv();

const scenarioArg = process.argv.find((a) => a.startsWith('--scenario='))?.split('=')[1] ??
  (process.argv.includes('--scenario') ? process.argv[process.argv.indexOf('--scenario') + 1] : undefined);

if (!scenarioArg) {
  console.error('usage: bun run demo/chaos-script.ts --scenario soc-p1');
  process.exit(2);
}
if (scenarioArg !== 'soc-p1') {
  console.error(`unknown scenario: ${scenarioArg}. supported: soc-p1`);
  process.exit(2);
}

let hecUnreachable = false;

async function emit(event: Record<string, unknown>, sourcetype: 'aegis:chaos' | 'aegis:mcp-failover' = 'aegis:chaos'): Promise<void> {
  const result = await emitHECEvent({ sourcetype, event, source: 'aegis:chaos-script' });
  if (result.attempted && !result.ok) hecUnreachable = true;
}

function ts(): string {
  return new Date().toISOString();
}

function log(label: string, extra: Record<string, unknown> = {}): void {
  console.log(`[${ts()}] [chaos-script] ${label} ${JSON.stringify(extra)}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// SOC P1 cascade. Times are cumulative seconds from script start. They line up
// with demo/SCENARIO.md so the video doesn't need post cuts.
const steps: Step[] = [
  {
    at_seconds: 0,
    label: 'cascade_start',
    action: async () => {
      log('cascade_start', { scenario: 'soc-p1', target_total_seconds: 100 });
      await emit({ event: 'cascade_start', scenario: 'soc-p1', narrator_beat: 'T+0:00' });
    },
  },
  {
    at_seconds: 20,
    label: 'inject_anthropic_429',
    action: async () => {
      process.env.CHAOS_PRIMARY_DOWN = 'anthropic';
      log('inject_anthropic_429', { toxic: 'anthropic_429', primary: 'anthropic/claude-sonnet-4-5' });
      await emit({
        event: 'chaos_inject',
        toxic: 'anthropic_429',
        target: 'anthropic/claude-sonnet-4-5',
        expected_recovery_layer: 'L0',
        narrator_beat: 'T+0:55',
      });
    },
  },
  {
    at_seconds: 50,
    label: 'inject_splunk_mcp_503',
    action: async () => {
      process.env.CHAOS_MCP_ERROR_RATE = '1.0';
      log('inject_splunk_mcp_503', { toxic: 'splunk_mcp_503', target: 'splunk_mcp_server' });
      await emit(
        {
          event: 'chaos_inject',
          toxic: 'splunk_mcp_503',
          target: 'splunk_mcp_server',
          expected_recovery_path: 'rest_shim',
          tool_name: 'splunk_search',
          narrator_beat: 'T+1:00',
        },
        'aegis:mcp-failover',
      );
    },
  },
  {
    at_seconds: 80,
    label: 'restore_all',
    action: async () => {
      delete process.env.CHAOS_PRIMARY_DOWN;
      process.env.CHAOS_MCP_ERROR_RATE = '0';
      log('restore_all', { primary: 'restored', mcp: 'restored' });
      await emit({
        event: 'chaos_restore',
        targets: ['anthropic/claude-sonnet-4-5', 'splunk_mcp_server'],
        narrator_beat: 'T+1:30',
      });
    },
  },
  {
    at_seconds: 90,
    label: 'cascade_end',
    action: async () => {
      log('cascade_end', { hec_unreachable: hecUnreachable });
      await emit({
        event: 'cascade_end',
        scenario: 'soc-p1',
        hec_unreachable: hecUnreachable,
        narrator_beat: 'T+2:50',
      });
    },
  },
];

async function main(): Promise<number> {
  log('script_start', {
    scenario: scenarioArg,
    splunk_hec_url: env.SPLUNK_HEC_URL,
    splunk_hec_configured: Boolean(env.SPLUNK_HEC_TOKEN),
  });
  const startedAt = Date.now();
  for (const step of steps) {
    const targetAt = startedAt + step.at_seconds * 1000;
    const wait = targetAt - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      await step.action();
    } catch (err) {
      const e = err as { message?: string };
      console.error(`[chaos-script] step ${step.label} threw:`, e?.message ?? err);
    }
  }
  log('script_complete', { elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000) });
  return hecUnreachable && env.SPLUNK_HEC_TOKEN ? 3 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[chaos-script] fatal:', err);
    process.exit(1);
  });
