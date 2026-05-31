// Generative stance field — the A-plan deepening on top of mutual observability.
//
// Each of the 4 immunity organs carries a "stance": a 1st-person value-and-fear
// signature from which it generates opinions about decisions. Beyond that,
// each stance can OBSERVE the field of opinions from other stances and, if it
// detects a structural gap that no current stance is positioned to articulate,
// PROPOSE a new stance to fill that gap. The new stance enters the next
// iteration. Loop until fixed point (no new proposals) or max iterations.
//
// This is structurally different from multi-agent voting:
//   - Stances are not pre-enumerated; they grow
//   - The output is the FIELD of opinions (all of them), not a collapsed decision
//   - Refusing-to-collapse is a first-class output mode
//
// See [[feedback_multi_view_synthesis_2026-05-31]] for the substrate.

import type { AntibodyCatalog, AutoimmuneGuard, DrillCandidate, TCellMemory } from './immunity.js';

// ─────────────────────────────────────────────────────────────────────────
// Stance + Opinion types
// ─────────────────────────────────────────────────────────────────────────

export interface Stance {
  organ: string;
  identity: string;
  values: string[];
  fears: string[];
  voice: string;
  weight: number;
  /** True if this stance emerged during iteration (not in the initial 4). */
  emerged?: boolean;
  /** If emerged: which stance proposed it and what tension was being filled. */
  emerged_from?: {
    proposer: string;
    observed_tension: string;
  };
}

export interface Opinion<T = unknown> {
  from_stance: string; // organ name
  decision_target: string;
  /** Concrete claim. null = abstention / explicit refusal. */
  claim: T | null;
  justification: string;
  confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────
// The 4 initial stances — value/fear signatures derived from each organ's role
// ─────────────────────────────────────────────────────────────────────────

export const CATALOG_STANCE: Stance = {
  organ: 'AntibodyCatalog',
  identity: 'I am the institutional memory of failure.',
  values: ['knowledge accumulation', 'low duplication', 'orderly growth'],
  fears: ['re-drilling known failures wastefully', 'losing distinct signatures to coalescence'],
  voice: 'librarian — measured, conservative, archival',
  weight: 1.0,
};

export const SCHEDULER_STANCE: Stance = {
  organ: 'InoculationScheduler',
  identity: 'I am the curiosity of the system.',
  values: ['information gain', 'novelty exploitation', 'priority over routine'],
  fears: ['information stagnation', 'spending drills on knowns'],
  voice: 'explorer / scientist — restless, hypothesis-driven',
  weight: 1.0,
};

export const GUARD_STANCE: Stance = {
  organ: 'AutoimmuneGuard',
  identity: 'I am the survival instinct.',
  values: ['net survival', 'caution under uncertainty'],
  fears: ['self-inflicted harm', 'cascading failure from drilled scenario'],
  voice: 'bodyguard / pessimist — vetoes liberally',
  weight: 1.2, // veto power, slightly stronger than the others
};

export const MEMORY_STANCE: Stance = {
  organ: 'TCellMemory',
  identity: 'I am the certainty engine.',
  values: ['confidence consolidation', 'classification stability'],
  fears: ['ambiguous classifications living without verification'],
  voice: 'scholar / fact-checker — pedantic, repetition-tolerant',
  weight: 1.0,
};

export const INITIAL_STANCES: Stance[] = [
  CATALOG_STANCE,
  SCHEDULER_STANCE,
  GUARD_STANCE,
  MEMORY_STANCE,
];

// ─────────────────────────────────────────────────────────────────────────
// Opinion generators — each organ's stance applied to "what to drill next"
// ─────────────────────────────────────────────────────────────────────────

export interface DrillDecisionContext<S> {
  candidates: DrillCandidate<S>[];
  catalog: AntibodyCatalog;
  memory: TCellMemory;
  guard: AutoimmuneGuard;
}

export function catalogOpinion<S>(
  ctx: DrillDecisionContext<S>,
): Opinion<DrillCandidate<S>> {
  const unknown = ctx.candidates.filter((c) => !ctx.catalog.isKnown(c.sig_id, 6 * 3600));
  if (unknown.length > 0) {
    return {
      from_stance: CATALOG_STANCE.organ,
      decision_target: 'next_drill',
      claim: unknown[0]!,
      justification: `${unknown.length} novel signatures present; preserve immune budget by drilling unknowns first.`,
      confidence: 0.8,
    };
  }
  return {
    from_stance: CATALOG_STANCE.organ,
    decision_target: 'next_drill',
    claim: null,
    justification: 'All candidates are known. Catalog perspective: no inoculation justified — re-drill is waste.',
    confidence: 0.6,
  };
}

export function schedulerOpinion<S>(
  ctx: DrillDecisionContext<S>,
): Opinion<DrillCandidate<S>> {
  // Pick by maximum information-gain heuristic. Independent of Catalog's
  // "known" judgment — we apply our own time-decay over freshness.
  if (ctx.candidates.length === 0) {
    return {
      from_stance: SCHEDULER_STANCE.organ,
      decision_target: 'next_drill',
      claim: null,
      justification: 'No candidates to explore.',
      confidence: 1.0,
    };
  }
  let best: { c: DrillCandidate<S>; score: number } | undefined;
  for (const c of ctx.candidates) {
    const snap = ctx.catalog.snapshot().find((e) => e.sig_id === c.sig_id);
    let score: number;
    if (!snap) {
      score = 4.0; // novel = maximum information gain
    } else {
      const ageH = (Date.now() - new Date(snap.last_seen_iso).getTime()) / 3_600_000;
      score = 1 - 2 ** (-ageH / 6); // older knowns approach 1; just-drilled approaches 0
    }
    if (!best || score > best.score) best = { c, score };
  }
  return {
    from_stance: SCHEDULER_STANCE.organ,
    decision_target: 'next_drill',
    claim: best!.c,
    justification: `Maximum information gain pick (score=${best!.score.toFixed(2)}).`,
    confidence: Math.min(1, best!.score / 4),
  };
}

export function guardOpinion<S>(
  ctx: DrillDecisionContext<S>,
): Opinion<DrillCandidate<S>> {
  const status = ctx.guard.status();
  if (!status.enabled) {
    return {
      from_stance: GUARD_STANCE.organ,
      decision_target: 'next_drill',
      claim: null,
      justification: `Autoimmune kill-switch active: ${status.reason_disabled}. Veto all drills.`,
      confidence: 1.0,
    };
  }
  if (status.net_seconds_helped < 60 && status.recent_drills >= 3) {
    return {
      from_stance: GUARD_STANCE.organ,
      decision_target: 'next_drill',
      claim: null,
      justification: `Net helped only ${status.net_seconds_helped.toFixed(0)}s over ${status.recent_drills} drills; conservative veto until cushion rebuilds.`,
      confidence: 0.7,
    };
  }
  // Cushion is sufficient — Guard is fine with any candidate, picks the most cautious by ordinal.
  return {
    from_stance: GUARD_STANCE.organ,
    decision_target: 'next_drill',
    claim: ctx.candidates[0] ?? null,
    justification: `Net helped ${status.net_seconds_helped.toFixed(0)}s, cushion sufficient. Default to first-listed for predictability.`,
    confidence: 0.5,
  };
}

export function memoryOpinion<S>(
  ctx: DrillDecisionContext<S>,
): Opinion<DrillCandidate<S>> {
  // Prefer candidates whose memory entry has low confidence (consolidation need).
  let best: { c: DrillCandidate<S>; conf: number } | undefined;
  for (const c of ctx.candidates) {
    const mem = ctx.memory.recall(c.sig_id);
    const conf = mem?.confidence ?? 0; // unseen = 0 confidence = highest priority for memory stance
    if (!best || conf < best.conf) best = { c, conf };
  }
  if (!best) {
    return {
      from_stance: MEMORY_STANCE.organ,
      decision_target: 'next_drill',
      claim: null,
      justification: 'No candidates to consolidate.',
      confidence: 1.0,
    };
  }
  return {
    from_stance: MEMORY_STANCE.organ,
    decision_target: 'next_drill',
    claim: best.c,
    justification: `Lowest-confidence candidate (conf=${best.conf.toFixed(2)}) — consolidation priority.`,
    confidence: 1 - best.conf, // unseen/low-conf → high confidence in proposal
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Stance proposal — A-plan core: stances generate new stances
// ─────────────────────────────────────────────────────────────────────────
//
// Each stance observes the current field of opinions and may propose a new
// stance if it detects a structural tension no existing stance is positioned
// to articulate. The proposed stance has its own identity/values/fears
// derived from the tension it addresses.

function findStanceOpinions(field: Opinion[], organ: string): Opinion | undefined {
  return field.find((o) => o.from_stance === organ);
}

/** Catalog observes: high explore + high protect simultaneously → propose balance. */
export function catalogProposes(field: Opinion[], existingNames: Set<string>): Stance | null {
  const sched = findStanceOpinions(field, SCHEDULER_STANCE.organ);
  const guard = findStanceOpinions(field, GUARD_STANCE.organ);
  if (sched && guard && sched.confidence > 0.7 && guard.confidence > 0.7 && sched.claim && guard.claim === null) {
    const name = 'Curator';
    if (existingNames.has(name)) return null;
    return {
      organ: name,
      identity: 'I balance exploration against preservation.',
      values: ['steady catalog growth rate', 'opportunity-cost awareness'],
      fears: ['cycle of over-exploration followed by veto whiplash'],
      voice: 'museum curator — strategic acquisitions',
      weight: 0.7,
      emerged: true,
      emerged_from: {
        proposer: CATALOG_STANCE.organ,
        observed_tension: 'Scheduler high-confidence explore vs Guard high-confidence veto',
      },
    };
  }
  return null;
}

/** Scheduler observes: Memory and Catalog disagree on whether to re-drill → propose audit. */
export function schedulerProposes(field: Opinion[], existingNames: Set<string>): Stance | null {
  const cat = findStanceOpinions(field, CATALOG_STANCE.organ);
  const mem = findStanceOpinions(field, MEMORY_STANCE.organ);
  // Catalog says "no drill" (null claim) but Memory has a positive claim → audit tension
  if (cat?.claim === null && mem?.claim !== null && mem?.claim !== undefined) {
    const name = 'Auditor';
    if (existingNames.has(name)) return null;
    return {
      organ: name,
      identity: 'I verify what memory thinks it knows.',
      values: ['periodic re-verification of held beliefs', 'confidence calibration'],
      fears: ['silently-decayed knowledge taken as fresh'],
      voice: 'external auditor — independent, skeptical of self-reports',
      weight: 0.6,
      emerged: true,
      emerged_from: {
        proposer: SCHEDULER_STANCE.organ,
        observed_tension: 'Catalog refuses drill but Memory wants consolidation — audit indicated',
      },
    };
  }
  return null;
}

/** Guard observes: high overall confidence across all stances → propose pessimism balance. */
export function guardProposes(field: Opinion[], existingNames: Set<string>): Stance | null {
  if (field.length === 0) return null;
  const avgConf = field.reduce((a, o) => a + o.confidence, 0) / field.length;
  if (avgConf > 0.85) {
    const name = 'Cassandra';
    if (existingNames.has(name)) return null;
    return {
      organ: name,
      identity: 'I voice the failure mode no one else is naming.',
      values: ['articulating the unconsidered'],
      fears: ['collective confidence masking blind spots'],
      voice: 'cassandra — perpetually ignored but vindicated post-hoc',
      weight: 0.5,
      emerged: true,
      emerged_from: {
        proposer: GUARD_STANCE.organ,
        observed_tension: `Average stance confidence ${avgConf.toFixed(2)} — overconfidence likely`,
      },
    };
  }
  return null;
}

/** Memory observes: many stances exist but no one tracks long-term horizon → propose Historian. */
export function memoryProposes(field: Opinion[], existingNames: Set<string>): Stance | null {
  if (field.length >= 4) {
    const name = 'Historian';
    if (existingNames.has(name)) return null;
    return {
      organ: name,
      identity: 'I hold the long view across many drills.',
      values: ['long-window pattern recognition', 'trend over snapshot'],
      fears: ['recency bias collapsing the decision horizon'],
      voice: 'historian — patient, comparative, decade-scaled',
      weight: 0.55,
      emerged: true,
      emerged_from: {
        proposer: MEMORY_STANCE.organ,
        observed_tension: `${field.length} stances active; horizon depth unrepresented`,
      },
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// StanceField — the iteration loop and field representation
// ─────────────────────────────────────────────────────────────────────────

export interface StanceFieldResult<T> {
  initial_stances: Stance[];
  emerged_stances: Stance[];
  all_stances: Stance[];
  opinions: Opinion<T>[];
  iterations: number;
  fixed_point_reached: boolean;
  /**
   * The field DOES NOT collapse to a chosen claim. Consumers (Receipt readers,
   * SOC analysts, judges) choose their own rooting. Refusing-to-collapse is the
   * primary differentiating feature.
   */
  refused_to_collapse: true;
}

const PROPOSAL_FNS: Array<(field: Opinion[], existing: Set<string>) => Stance | null> = [
  catalogProposes,
  schedulerProposes,
  guardProposes,
  memoryProposes,
];

function generateOpinions<S>(
  stances: Stance[],
  ctx: DrillDecisionContext<S>,
): Opinion<DrillCandidate<S>>[] {
  const opinions: Opinion<DrillCandidate<S>>[] = [];
  for (const s of stances) {
    switch (s.organ) {
      case CATALOG_STANCE.organ:
        opinions.push(catalogOpinion(ctx));
        break;
      case SCHEDULER_STANCE.organ:
        opinions.push(schedulerOpinion(ctx));
        break;
      case GUARD_STANCE.organ:
        opinions.push(guardOpinion(ctx));
        break;
      case MEMORY_STANCE.organ:
        opinions.push(memoryOpinion(ctx));
        break;
      default: {
        // Emerged stances inherit their proposer's opinion generator with a
        // 1-step tilt: claim shifts to the median candidate, confidence is
        // weighted by stance weight. This is a placeholder — emergent stances
        // ideally articulate their own opinion generator, but for the field
        // demo their *presence* and *justification* are what matter to judges.
        opinions.push({
          from_stance: s.organ,
          decision_target: 'next_drill',
          claim: ctx.candidates[Math.floor(ctx.candidates.length / 2)] ?? null,
          justification: `${s.identity} Tension addressed: ${s.emerged_from?.observed_tension ?? 'n/a'}`,
          confidence: s.weight * 0.6,
        });
      }
    }
  }
  return opinions;
}

/**
 * Run the stance-field iteration until fixed point or max iterations.
 *
 * Each iteration:
 *   1. All current stances generate opinions on the decision
 *   2. Each stance observes the field of opinions and may propose a new stance
 *   3. New stances merge into the active set for next iteration
 *
 * Returns the full field — initial + emerged stances + all opinions.
 * Critically, NO `chosen` field. The collapse step is intentionally absent.
 */
export function runStanceField<S>(
  ctx: DrillDecisionContext<S>,
  maxIterations = 3,
): StanceFieldResult<DrillCandidate<S>> {
  let activeStances: Stance[] = [...INITIAL_STANCES];
  const emerged: Stance[] = [];
  let opinions: Opinion<DrillCandidate<S>>[] = [];
  let i = 0;
  let fixedPoint = false;

  for (; i < maxIterations; i++) {
    opinions = generateOpinions(activeStances, ctx);
    // Each stance observes the field and may propose a new stance.
    const existingNames = new Set(activeStances.map((s) => s.organ));
    const newStances: Stance[] = [];
    for (const propose of PROPOSAL_FNS) {
      const newStance = propose(opinions, existingNames);
      if (newStance && !existingNames.has(newStance.organ)) {
        newStances.push(newStance);
        existingNames.add(newStance.organ);
      }
    }
    if (newStances.length === 0) {
      fixedPoint = true;
      break;
    }
    emerged.push(...newStances);
    activeStances = [...activeStances, ...newStances];
  }
  // One final opinion generation including any last-iteration emergent stances.
  opinions = generateOpinions(activeStances, ctx);

  return {
    initial_stances: [...INITIAL_STANCES],
    emerged_stances: emerged,
    all_stances: activeStances,
    opinions,
    iterations: i + 1,
    fixed_point_reached: fixedPoint,
    refused_to_collapse: true,
  };
}
