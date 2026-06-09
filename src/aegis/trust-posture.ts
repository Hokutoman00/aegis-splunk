// AI Ops Trust Layer.
//
// Aegis already proves that the agent recovered. The trust posture turns that
// recovery evidence into a human-facing operating decision: continue, watch,
// degrade, or halt. This is the Grand Prize concept extension: Splunk is not
// just where failures are logged; it is where the operator roots trust in the
// AI system's next move.

import type { L6ChaosRecord } from './l6-chaos.js';
import type { StanceFieldResult } from './stances.js';

export type TrustPostureLevel = 'trusted' | 'watch' | 'degraded' | 'halt';

export interface TrustEvidence {
  source: 'chaos' | 'immunity' | 'stance_field';
  signal: string;
  value: string | number | boolean | null;
}

export interface TrustPosture {
  level: TrustPostureLevel;
  score: number;
  human_gate: 'continue' | 'watch' | 'approve_degraded' | 'stop_and_review';
  operator_next_action: string;
  rationale: string[];
  evidence: TrustEvidence[];
}

interface TrustInput {
  chaos: L6ChaosRecord;
  stanceField?: Pick<
    StanceFieldResult<unknown>,
    'refused_to_collapse' | 'emerged_stances' | 'opinions' | 'fixed_point_reached'
  >;
}

export function buildTrustPosture(input: TrustInput): TrustPosture {
  const { chaos, stanceField } = input;
  const evidence = collectEvidence(chaos, stanceField);
  const rationale: string[] = [];
  let score = 100;

  if (chaos.total_drills === 0) {
    score -= 35;
    rationale.push('No chaos drill has run in this process; trust is not fresh.');
  }

  if (!chaos.autoimmune_enabled) {
    score -= 45;
    rationale.push('Autoimmune guard disabled drills after net-harm accounting.');
  }

  if (chaos.last_chaos_survival?.outcome === 'failed') {
    score -= 40;
    rationale.push('The latest chaos drill failed; recovery claim needs operator review.');
  }

  if (chaos.last_chaos_survival && chaos.last_chaos_survival.seconds_ago > 300) {
    score -= 15;
    rationale.push('Latest survival evidence is older than five minutes.');
  }

  if (chaos.total_drills >= 3 && chaos.survival_rate < 0.8) {
    score -= 25;
    rationale.push('Recent survival rate is below the safe operating threshold.');
  }

  if (chaos.antibody_coverage < 2) {
    score -= 10;
    rationale.push('Antibody coverage is still shallow; more failure classes need inoculation.');
  }

  if (stanceField && !stanceField.refused_to_collapse) {
    score -= 10;
    rationale.push('Stance field collapsed to a single answer; operator choice was not preserved.');
  }

  if (stanceField && stanceField.opinions.length < 4) {
    score -= 8;
    rationale.push('Fewer than four base stances contributed to the trust field.');
  }

  score = clamp(score, 0, 100);

  const level = postureLevel(score, chaos);
  if (rationale.length === 0) {
    rationale.push(
      'Fresh chaos survival, active autoimmune guard, and multi-stance evidence agree.',
    );
  }

  return {
    level,
    score,
    human_gate: humanGate(level),
    operator_next_action: nextAction(level),
    rationale,
    evidence,
  };
}

function collectEvidence(
  chaos: L6ChaosRecord,
  stanceField: TrustInput['stanceField'],
): TrustEvidence[] {
  return [
    { source: 'chaos', signal: 'total_drills', value: chaos.total_drills },
    { source: 'chaos', signal: 'survival_rate', value: chaos.survival_rate },
    {
      source: 'chaos',
      signal: 'last_outcome',
      value: chaos.last_chaos_survival?.outcome ?? null,
    },
    { source: 'immunity', signal: 'antibody_coverage', value: chaos.antibody_coverage },
    { source: 'immunity', signal: 'autoimmune_enabled', value: chaos.autoimmune_enabled },
    {
      source: 'stance_field',
      signal: 'refused_to_collapse',
      value: stanceField?.refused_to_collapse ?? null,
    },
    {
      source: 'stance_field',
      signal: 'emerged_stance_count',
      value: stanceField?.emerged_stances.length ?? null,
    },
  ];
}

function postureLevel(score: number, chaos: L6ChaosRecord): TrustPostureLevel {
  if (!chaos.autoimmune_enabled || chaos.last_chaos_survival?.outcome === 'failed') return 'halt';
  if (score >= 90) return 'trusted';
  if (score >= 70) return 'watch';
  return 'degraded';
}

function humanGate(level: TrustPostureLevel): TrustPosture['human_gate'] {
  switch (level) {
    case 'trusted':
      return 'continue';
    case 'watch':
      return 'watch';
    case 'degraded':
      return 'approve_degraded';
    case 'halt':
      return 'stop_and_review';
  }
}

function nextAction(level: TrustPostureLevel): string {
  switch (level) {
    case 'trusted':
      return 'Continue the investigation; show the receipt and Splunk recovery trace beside the answer.';
    case 'watch':
      return 'Keep the analyst in the loop and run another shadow drill before approving automation.';
    case 'degraded':
      return 'Allow read-only investigation only; require human approval before remediation.';
    case 'halt':
      return 'Stop autonomous action and review the failed recovery path in Splunk.';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
