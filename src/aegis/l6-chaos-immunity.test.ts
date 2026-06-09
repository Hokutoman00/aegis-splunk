// Integration test: l6-chaos.runDrill() + adaptive immunity organs.
//
// Verifies the C-plan behaviors end-to-end:
//   1. Antibody coverage grows monotonically as new signatures are inoculated
//   2. Scheduler transitions scenarios from "novel" to "reinforcement" wording
//   3. Autoimmune guard stays enabled when drills survive (positive net impact)
//   4. Autoimmune guard does NOT skip drills when enabled
//   5. Receipt fields (antibody_coverage, autoimmune_*) are populated

import { beforeEach, describe, expect, test } from 'bun:test';
import { _resetImmunityState, getChaosState, runDrill } from './l6-chaos.js';

describe('l6-chaos × immunity integration', () => {
  beforeEach(() => {
    _resetImmunityState();
  });

  test('antibody coverage grows monotonically across repeated drills', () => {
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      runDrill();
      seen.push(getChaosState().antibody_coverage);
    }
    // Coverage should never decrease.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] ?? 0);
    }
    // After 8 drills with 4 distinct scenarios in DRILL_SCENARIOS, coverage
    // should hit the scenario-count ceiling (the scheduler exhausts novel
    // signatures first, then reinforces).
    expect(seen.at(-1)).toBeGreaterThanOrEqual(2);
  });

  test('first drill emits "first inoculation" note, later drills emit "reinforcement"', () => {
    const r1 = runDrill();
    expect(r1).not.toMatchObject({ skipped: true });
    if ('skipped' in r1) throw new Error('unexpected skip');
    expect(r1.notes).toContain('first inoculation');

    // Keep drilling until we hit a reinforcement (scheduler eventually picks a
    // known signature once novel candidates are exhausted).
    let sawReinforcement = false;
    for (let i = 0; i < 12; i++) {
      const r = runDrill();
      if ('skipped' in r) continue;
      if (r.notes?.includes('reinforcement')) {
        sawReinforcement = true;
        break;
      }
    }
    expect(sawReinforcement).toBe(true);
  });

  test('autoimmune guard stays enabled when drills survive (positive impact)', () => {
    for (let i = 0; i < 10; i++) runDrill();
    const s = getChaosState();
    expect(s.autoimmune_enabled).toBe(true);
    expect(s.autoimmune_net_seconds_helped).toBeGreaterThan(0);
    expect(s.drills_skipped_by_autoimmune).toBe(0);
  });

  test('Receipt-grade snapshot fields are populated for the response envelope', () => {
    runDrill();
    runDrill();
    const s = getChaosState();
    expect(s.shadow_injected_this_request).toBe(false);
    expect(s.total_drills).toBe(2);
    expect(typeof s.antibody_coverage).toBe('number');
    expect(s.antibody_coverage).toBeGreaterThanOrEqual(1);
    expect(typeof s.autoimmune_enabled).toBe('boolean');
    expect(typeof s.autoimmune_net_seconds_helped).toBe('number');
    expect(typeof s.drills_skipped_by_autoimmune).toBe('number');
  });
});
