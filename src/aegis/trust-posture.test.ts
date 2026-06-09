import { describe, expect, test } from 'bun:test';
import type { L6ChaosRecord } from './l6-chaos.js';
import { buildTrustPosture } from './trust-posture.js';

const freshChaos = (overrides: Partial<L6ChaosRecord> = {}): L6ChaosRecord => ({
  shadow_injected_this_request: false,
  last_chaos_survival: {
    timestamp: new Date().toISOString(),
    seconds_ago: 20,
    toxic: 'anthropic_400_credit_balance',
    outcome: 'survived',
    notes: 'classified as credit_balance_too_low',
  },
  total_drills: 6,
  survival_rate: 1,
  antibody_coverage: 4,
  autoimmune_enabled: true,
  autoimmune_net_seconds_helped: 180,
  drills_skipped_by_autoimmune: 0,
  ...overrides,
});

const stanceField = {
  refused_to_collapse: true as const,
  fixed_point_reached: true,
  emerged_stances: [
    {
      organ: 'Historian',
      identity: 'I hold the long view.',
      values: [],
      fears: [],
      voice: 'historian',
      weight: 0.5,
    },
  ],
  opinions: [
    {
      from_stance: 'AntibodyCatalog',
      decision_target: 'next_drill',
      claim: null,
      justification: 'catalog',
      confidence: 0.8,
    },
    {
      from_stance: 'InoculationScheduler',
      decision_target: 'next_drill',
      claim: null,
      justification: 'scheduler',
      confidence: 0.8,
    },
    {
      from_stance: 'AutoimmuneGuard',
      decision_target: 'next_drill',
      claim: null,
      justification: 'guard',
      confidence: 0.8,
    },
    {
      from_stance: 'TCellMemory',
      decision_target: 'next_drill',
      claim: null,
      justification: 'memory',
      confidence: 0.8,
    },
  ],
};

describe('buildTrustPosture', () => {
  test('returns trusted when fresh chaos, immunity, and stance evidence agree', () => {
    const posture = buildTrustPosture({ chaos: freshChaos(), stanceField });
    expect(posture.level).toBe('trusted');
    expect(posture.score).toBeGreaterThanOrEqual(90);
    expect(posture.human_gate).toBe('continue');
    expect(posture.operator_next_action).toContain('Continue');
  });

  test('halts when the latest chaos drill failed', () => {
    const posture = buildTrustPosture({
      chaos: freshChaos({
        last_chaos_survival: {
          timestamp: new Date().toISOString(),
          seconds_ago: 5,
          toxic: 'splunk_mcp_timeout',
          outcome: 'failed',
        },
      }),
      stanceField,
    });
    expect(posture.level).toBe('halt');
    expect(posture.human_gate).toBe('stop_and_review');
    expect(posture.rationale.join(' ')).toContain('failed');
  });

  test('degrades when no chaos drill has run', () => {
    const posture = buildTrustPosture({
      chaos: freshChaos({ total_drills: 0, survival_rate: 0, last_chaos_survival: null }),
      stanceField,
    });
    expect(posture.level).toBe('degraded');
    expect(posture.human_gate).toBe('approve_degraded');
  });

  test('watches when survival evidence is old but not broken', () => {
    const posture = buildTrustPosture({
      chaos: freshChaos({
        last_chaos_survival: {
          timestamp: new Date(Date.now() - 600_000).toISOString(),
          seconds_ago: 600,
          toxic: 'openai_429_quota',
          outcome: 'survived',
        },
      }),
      stanceField,
    });
    expect(posture.level).toBe('watch');
    expect(posture.operator_next_action).toContain('shadow drill');
  });

  test('preserves evidence for Splunk dashboards and judge replay', () => {
    const posture = buildTrustPosture({ chaos: freshChaos(), stanceField });
    expect(posture.evidence.some((e) => e.signal === 'antibody_coverage')).toBe(true);
    expect(posture.evidence.some((e) => e.signal === 'refused_to_collapse')).toBe(true);
  });
});
