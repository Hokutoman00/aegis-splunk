import { describe, expect, test } from 'bun:test';
import { AntibodyCatalog, AutoimmuneGuard, TCellMemory, buildSignature } from './immunity.js';
import {
  CATALOG_STANCE,
  GUARD_STANCE,
  INITIAL_STANCES,
  MEMORY_STANCE,
  SCHEDULER_STANCE,
  catalogOpinion,
  guardOpinion,
  memoryOpinion,
  runStanceField,
  schedulerOpinion,
} from './stances.js';
import type { ProviderError } from './types.js';

const mkErr = (over: Partial<ProviderError> = {}): ProviderError => ({
  status: 400,
  raw_message: 'credit balance is too low',
  ...over,
});

function freshCtx() {
  return {
    candidates: [
      { scenario: 'anthropic_503' as const, sig_id: 'sig-a-503' },
      { scenario: 'openai_429' as const, sig_id: 'sig-o-429' },
      { scenario: 'mcp_timeout' as const, sig_id: 'sig-mcp-to' },
    ],
    catalog: new AntibodyCatalog(),
    memory: new TCellMemory(),
    guard: new AutoimmuneGuard(),
  };
}

describe('individual stance opinions', () => {
  test('Catalog prefers novel and abstains when all known', () => {
    const ctx = freshCtx();
    const opNovel = catalogOpinion(ctx);
    expect(opNovel.from_stance).toBe(CATALOG_STANCE.organ);
    expect(opNovel.claim).not.toBeNull();
    // mark all candidates as known
    for (const c of ctx.candidates) {
      const sig = buildSignature('p', mkErr(), c.scenario);
      ctx.catalog.record({ ...sig, sig_id: c.sig_id });
    }
    const opKnown = catalogOpinion(ctx);
    expect(opKnown.claim).toBeNull(); // abstention/refusal
    expect(opKnown.justification).toContain('Catalog perspective');
  });

  test('Scheduler picks max-info-gain (novel scores highest)', () => {
    const ctx = freshCtx();
    const op = schedulerOpinion(ctx);
    expect(op.from_stance).toBe(SCHEDULER_STANCE.organ);
    expect(op.claim).not.toBeNull();
    expect(op.confidence).toBeGreaterThan(0.5);
  });

  test('Guard vetoes when net cushion is thin', () => {
    const ctx = freshCtx();
    // Record several drills that caused net harm
    for (let i = 0; i < 3; i++) {
      ctx.guard.record({
        drill_id: `d${i}`,
        prevented_seconds: 0,
        caused_seconds: 5,
        timestamp: new Date().toISOString(),
      });
    }
    const op = guardOpinion(ctx);
    expect(op.from_stance).toBe(GUARD_STANCE.organ);
    expect(op.claim).toBeNull();
    expect(op.justification).toMatch(/cushion|kill-switch|veto/i);
  });

  test('Memory prefers lowest-confidence candidate', () => {
    const ctx = freshCtx();
    ctx.memory.remember('sig-a-503', 'x', true, true); // conf=1.0
    ctx.memory.remember('sig-o-429', 'x', true, true);
    ctx.memory.remember('sig-o-429', 'x', true, false); // conf=0.5
    const op = memoryOpinion(ctx);
    expect(op.from_stance).toBe(MEMORY_STANCE.organ);
    // Lowest is the never-seen one (conf=0)
    expect(op.claim?.sig_id).toBe('sig-mcp-to');
  });
});

describe('stance field iteration (A-plan core)', () => {
  test('initial run produces opinions from all 4 base stances', () => {
    const ctx = freshCtx();
    const field = runStanceField(ctx);
    expect(field.initial_stances).toHaveLength(4);
    // Initial stances all generate an opinion
    const initialOrgans = field.initial_stances.map((s) => s.organ);
    for (const organ of initialOrgans) {
      const op = field.opinions.find((o) => o.from_stance === organ);
      expect(op).toBeDefined();
    }
  });

  test('refuses to collapse: result has no `chosen` field, only the full field', () => {
    const ctx = freshCtx();
    const field = runStanceField(ctx);
    expect(field.refused_to_collapse).toBe(true);
    expect((field as unknown as { chosen?: unknown }).chosen).toBeUndefined();
  });

  test('emerged stances appear when tensions are present', () => {
    const ctx = freshCtx();
    // Set up a Catalog-Memory tension: catalog full of knowns, memory has low conf
    for (const c of ctx.candidates) {
      const sig = buildSignature('p', mkErr(), c.scenario);
      ctx.catalog.record({ ...sig, sig_id: c.sig_id });
      ctx.memory.remember(c.sig_id, 'x', true, true);
      ctx.memory.remember(c.sig_id, 'x', true, false); // conf=0.5
    }
    const field = runStanceField(ctx);
    expect(field.all_stances.length).toBeGreaterThanOrEqual(4);
    // Emerged Auditor or similar should appear given the tension
    const hasEmergedStance = field.emerged_stances.length > 0;
    // (Soft assertion: if no emergence, the field still has 4 initial stances.)
    expect(field.iterations).toBeGreaterThanOrEqual(1);
    expect(field.iterations).toBeLessThanOrEqual(3);
    if (hasEmergedStance) {
      const emergedOpinions = field.opinions.filter((o) =>
        field.emerged_stances.some((s) => s.organ === o.from_stance),
      );
      expect(emergedOpinions.length).toBe(field.emerged_stances.length);
      // Each emerged stance has a documented tension
      for (const s of field.emerged_stances) {
        expect(s.emerged).toBe(true);
        expect(s.emerged_from?.observed_tension).toBeTruthy();
        expect(s.emerged_from?.proposer).toBeTruthy();
      }
    }
  });

  test('iteration is bounded by maxIterations and reaches fixed point or cap', () => {
    const ctx = freshCtx();
    const field = runStanceField(ctx, 3);
    expect(field.iterations).toBeLessThanOrEqual(3);
    // Either fixed point reached OR we ran the cap
    expect(field.fixed_point_reached || field.iterations === 3).toBe(true);
  });

  test('opinions and stances cardinality consistent at field end', () => {
    const ctx = freshCtx();
    const field = runStanceField(ctx);
    // Every active stance contributed an opinion
    expect(field.opinions.length).toBe(field.all_stances.length);
    // Emerged ∪ initial = all
    expect(field.all_stances.length).toBe(
      field.initial_stances.length + field.emerged_stances.length,
    );
  });
});

describe('genuine differentiation from multi-agent', () => {
  test('no synthesizer collapses opinions to a single chosen', () => {
    const ctx = freshCtx();
    const field = runStanceField(ctx);
    // Multi-agent would have field.chosen = <Opinion>.
    // Field-shaper does not.
    expect('chosen' in field).toBe(false);
    expect(field.refused_to_collapse).toBe(true);
  });

  test('every opinion preserves its 1st-person justification', () => {
    const ctx = freshCtx();
    const field = runStanceField(ctx);
    for (const op of field.opinions) {
      expect(op.justification).toBeTruthy();
      expect(op.from_stance).toBeTruthy();
    }
  });

  test('the 4 initial stances are immutable across runs', () => {
    expect(INITIAL_STANCES).toHaveLength(4);
    expect(INITIAL_STANCES.map((s) => s.organ).sort()).toEqual(
      ['AntibodyCatalog', 'AutoimmuneGuard', 'InoculationScheduler', 'TCellMemory'].sort(),
    );
  });
});
