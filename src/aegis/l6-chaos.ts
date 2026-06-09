// L6 — continuous self-chaos (shadow drill).
//
// Aegis periodically tests its own resilience by simulating the failure modes
// it claims to handle, and records the outcome of each drill. The result is
// surfaced in every response Receipt as `last_chaos_survival`, giving any
// auditor a freshness signal: "Aegis last survived a chaos drill 47s ago."
//
// v0 — synthetic drills (no Toxiproxy yet). Each scenario constructs a
// representative error and verifies that classifyError() routes it. v1 will
// replace synthetic drills with Toxiproxy-injected real HTTP failures and
// run the full /v1/chat/completions path in a shadow request.

import {
  AntibodyCatalog,
  AutoimmuneGuard,
  type DrillCandidate,
  TCellMemory,
  buildSignature,
  pickNextDrill,
} from './immunity.js';
import { classifyError } from './l4-semantic.js';
import { emitHECEvent } from './splunk-audit.js';
import { type StanceFieldResult, runStanceField } from './stances.js';
import { buildTrustPosture } from './trust-posture.js';
import type { ProviderError } from './types.js';

export type ChaosOutcomeKind = 'survived' | 'degraded' | 'failed';

export interface ChaosOutcome {
  timestamp: string; // ISO 8601
  seconds_ago: number; // computed on read
  toxic: string;
  outcome: ChaosOutcomeKind;
  notes?: string;
}

interface DrillScenario {
  toxic: string;
  providerName: string;
  error: ProviderError;
}

const DRILL_SCENARIOS: DrillScenario[] = [
  {
    toxic: 'anthropic_400_credit_balance',
    providerName: 'anthropic/claude-sonnet-4-5',
    error: {
      status: 400,
      type: 'invalid_request_error',
      raw_message:
        'anthropic error: Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing.',
    },
  },
  {
    toxic: 'openai_429_quota',
    providerName: 'openai/gpt-4.1-mini',
    error: {
      status: 429,
      code: 'insufficient_quota',
      raw_message: 'openai error: You exceeded your current quota.',
    },
  },
  {
    toxic: 'context_overflow',
    providerName: 'anthropic/claude-haiku-4-5',
    error: { status: 400, raw_message: 'context length too long for this model' },
  },
  {
    toxic: 'model_deprecation',
    providerName: 'openai/legacy-gpt-3',
    error: { status: 404, raw_message: 'model has been deprecated and is no longer available' },
  },
];

// Module-level state. Singleton lifetime = process lifetime. Crash → reset.
const state = {
  last: undefined as ChaosOutcome | undefined,
  totalDrills: 0,
  survivedDrills: 0,
  skippedByAutoimmune: 0,
  intervalHandle: undefined as ReturnType<typeof setInterval> | undefined,
  // Adaptive immunity organs (see immunity.ts).
  catalog: new AntibodyCatalog(),
  memory: new TCellMemory(),
  guard: new AutoimmuneGuard(),
};

function scenarioSignatureId(s: DrillScenario): string {
  return buildSignature(s.providerName, s.error, s.toxic).sig_id;
}

export function runDrill(): ChaosOutcome | { skipped: true; reason: string } {
  // 1. Autoimmune kill-switch: if recent drills caused more harm than they
  //    prevented, skip until operator resets the guard.
  if (!state.guard.isEnabled()) {
    state.skippedByAutoimmune += 1;
    return {
      skipped: true,
      reason: state.guard.status().reason_disabled ?? 'autoimmune kill-switch active',
    };
  }

  // 2. Inoculation scheduler: pick the highest-EIG scenario rather than
  //    round-robin. Unknown signatures dominate; among known, the stalest wins.
  const candidates: DrillCandidate<DrillScenario>[] = DRILL_SCENARIOS.map((scenario) => ({
    scenario,
    sig_id: scenarioSignatureId(scenario),
  }));
  const pick = pickNextDrill(candidates, state.catalog);
  if (!pick) throw new Error('drill scenario list is empty');
  const scenario = pick.picked.scenario;

  // 3. Run the drill: classify and decide outcome.
  const match = classifyError(scenario.error, scenario.providerName);
  const outcome: ChaosOutcomeKind = match ? 'survived' : 'failed';

  // 4. Antibody catalog: record this failure signature for future EIG calc.
  const sig = buildSignature(scenario.providerName, scenario.error, scenario.toxic);
  state.catalog.record(sig);

  // 5. T-cell memory: remember the reclassification outcome with confidence.
  state.memory.remember(sig.sig_id, scenario.toxic, !!match, !!match);

  // 6. Autoimmune accounting: a "survived" drill prevents future downtime
  //    (estimated 30s), a "failed" drill suggests our recovery path is broken
  //    and may itself cause harm if exercised in real traffic (estimated 10s).
  state.guard.record({
    drill_id: sig.sig_id,
    prevented_seconds: outcome === 'survived' ? 30 : 0,
    caused_seconds: outcome === 'failed' ? 10 : 0,
    timestamp: new Date().toISOString(),
  });

  const result: ChaosOutcome = {
    timestamp: new Date().toISOString(),
    seconds_ago: 0,
    toxic: scenario.toxic,
    outcome,
    notes: match
      ? `classified as ${match.message_class}, action=${match.action_taken}; ${pick.novel ? 'first inoculation' : 'reinforcement (stale)'}`
      : 'no L4 rule matched — would surface to L5 graceful degradation',
  };
  state.last = result;
  state.totalDrills += 1;
  if (outcome === 'survived') state.survivedDrills += 1;
  return result;
}

export function startChaosScheduler(intervalMs = 30_000): void {
  if (state.intervalHandle) return;
  runDrill(); // fire one immediately so first response has a fresh survival
  state.intervalHandle = setInterval(() => {
    try {
      runDrill();
    } catch (e) {
      console.error('[l6-chaos] drill failed:', e);
    }
  }, intervalMs);
}

export function stopChaosScheduler(): void {
  if (state.intervalHandle) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = undefined;
  }
}

export interface L6ChaosRecord {
  shadow_injected_this_request: boolean;
  last_chaos_survival: ChaosOutcome | null;
  total_drills: number;
  survival_rate: number; // 0..1
  // Adaptive-immunity reporting (so the Receipt can include the immune snapshot).
  antibody_coverage: number; // distinct failure signatures inoculated
  autoimmune_enabled: boolean;
  autoimmune_net_seconds_helped: number;
  drills_skipped_by_autoimmune: number;
}

/**
 * Build the stance field for the current set of drill candidates. The result is
 * the field of opinions from the 4 base stances PLUS any stances that emerged
 * during the iteration. There is no collapse to a chosen claim — the Receipt
 * consumer (SOC analyst, Splunk dashboard, hackathon judge) chooses their own
 * rooting from the field.
 *
 * This is the A-plan deepening: emergent, non-enumerable stance multiplicity.
 */
export function buildStanceField(): StanceFieldResult<{ scenario: DrillScenario; sig_id: string }> {
  const candidates = DRILL_SCENARIOS.map((scenario) => ({
    scenario,
    sig_id: buildSignature(scenario.providerName, scenario.error, scenario.toxic).sig_id,
  }));
  return runStanceField({
    candidates,
    catalog: state.catalog,
    memory: state.memory,
    guard: state.guard,
  });
}

export function getChaosState(): L6ChaosRecord {
  const last = state.last;
  let lastWithDelta: ChaosOutcome | null = null;
  if (last) {
    const secondsAgo = Math.max(0, Math.floor((Date.now() - Date.parse(last.timestamp)) / 1000));
    lastWithDelta = { ...last, seconds_ago: secondsAgo };
  }
  const autoStatus = state.guard.status();
  return {
    shadow_injected_this_request: false, // v1 will set this true for the 1% shadow path
    last_chaos_survival: lastWithDelta,
    total_drills: state.totalDrills,
    survival_rate: state.totalDrills > 0 ? state.survivedDrills / state.totalDrills : 0,
    antibody_coverage: state.catalog.coverage(),
    autoimmune_enabled: autoStatus.enabled,
    autoimmune_net_seconds_helped: autoStatus.net_seconds_helped,
    drills_skipped_by_autoimmune: state.skippedByAutoimmune,
  };
}

/**
 * Run a drill and emit a structured HEC event including the immunity snapshot.
 *
 * Non-blocking: HEC errors are swallowed by emitHECEvent so a slow Splunk
 * cannot stall the chaos loop. The event includes the adaptive-immunity
 * fields (catalog coverage, novelty, autoimmune status) so judges can search
 * `sourcetype="aegis:chaos" antibody_coverage>0` on the live dashboard.
 */
export async function runDrillAndEmit(): Promise<ChaosOutcome | { skipped: true; reason: string }> {
  const result = runDrill();
  const cstate = getChaosState();
  if ('skipped' in result) {
    await emitHECEvent({
      sourcetype: 'aegis:chaos',
      event: {
        event_kind: 'drill_skipped_by_autoimmune',
        reason: result.reason,
        autoimmune_enabled: cstate.autoimmune_enabled,
        autoimmune_net_seconds_helped: cstate.autoimmune_net_seconds_helped,
        drills_skipped_by_autoimmune: cstate.drills_skipped_by_autoimmune,
        antibody_coverage: cstate.antibody_coverage,
        timestamp: new Date().toISOString(),
      },
    });
    return result;
  }
  // Build the stance field — refused-to-collapse multi-viewpoint output.
  const field = buildStanceField();
  const trustPosture = buildTrustPosture({ chaos: cstate, stanceField: field });
  await emitHECEvent({
    sourcetype: 'aegis:chaos',
    event: {
      event_kind: 'drill',
      toxic: result.toxic,
      outcome: result.outcome,
      notes: result.notes,
      antibody_coverage: cstate.antibody_coverage,
      autoimmune_enabled: cstate.autoimmune_enabled,
      autoimmune_net_seconds_helped: cstate.autoimmune_net_seconds_helped,
      drills_skipped_by_autoimmune: cstate.drills_skipped_by_autoimmune,
      total_drills: cstate.total_drills,
      survival_rate: cstate.survival_rate,
      trust_posture: trustPosture,
      // Stance field — the multi-viewpoint offering. No `chosen`; consumers root themselves.
      stance_field: {
        refused_to_collapse: field.refused_to_collapse,
        initial_stance_count: field.initial_stances.length,
        emerged_stance_count: field.emerged_stances.length,
        iterations: field.iterations,
        fixed_point_reached: field.fixed_point_reached,
        emerged_stances: field.emerged_stances.map((s) => ({
          organ: s.organ,
          identity: s.identity,
          proposed_by: s.emerged_from?.proposer,
          observed_tension: s.emerged_from?.observed_tension,
        })),
        opinions: field.opinions.map((o) => ({
          from_stance: o.from_stance,
          claim_present: o.claim !== null,
          justification: o.justification,
          confidence: o.confidence,
        })),
      },
      timestamp: result.timestamp,
    },
  });
  return result;
}

/** Test-only: reset all immunity state. */
export function _resetImmunityState(): void {
  state.catalog.reset();
  state.memory.reset();
  state.guard.reset();
  state.last = undefined;
  state.totalDrills = 0;
  state.survivedDrills = 0;
  state.skippedByAutoimmune = 0;
}
