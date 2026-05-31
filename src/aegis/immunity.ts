// Adaptive immunity for chaos engineering — the deeper structural layer.
//
// Borrowed from biological immune systems. The current chaos engine is a
// stateless round-robin scheduler (l6-chaos.ts). This module adds four
// state-bearing organs so chaos drills become learning events rather than
// repeated experiments:
//
//   1. AntibodyCatalog       — versioned store of failure signatures seen
//   2. TCellMemory           — past reclassifications with confidence
//   3. InoculationScheduler  — picks next drill by expected information gain
//   4. AutoimmuneGuard       — kill-switch if drills cause more harm than they prevent
//
// The fourth organ (AutoimmuneGuard) was surfaced by multi-view synthesis:
// biology's borrowed metaphor warns about self-attack (autoimmune disease).
// Three concrete realizations of "chaos as immunity" all missed it; the
// blind-spot detection step added it as a non-negotiable design constraint.

import { createHash } from 'node:crypto';
import type { ProviderError } from './types.js';

// ─────────────────────────────────────────────────────────────────────────
// 1. AntibodyCatalog — failure-signature memory
// ─────────────────────────────────────────────────────────────────────────

export interface FailureSignature {
  /** Stable hash of (target, error_class, http_status, message_pattern). */
  sig_id: string;
  target: string; // e.g. 'anthropic/claude-sonnet-4-5'
  http_status: number | undefined;
  error_class: string; // e.g. 'credit_balance_too_low', 'rate_limit', 'context_overflow'
  message_pattern: string; // normalized message prefix (first 80 chars, lower)
  first_seen_iso: string;
  last_seen_iso: string;
  drill_count: number;
}

function signatureHash(target: string, status: number | undefined, errClass: string, msgPattern: string): string {
  return createHash('sha256')
    .update(`${target}|${status ?? 'na'}|${errClass}|${msgPattern}`)
    .digest('hex')
    .slice(0, 16);
}

function normalizeMessage(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, ' ').slice(0, 80).trim();
}

export function buildSignature(target: string, err: ProviderError, errClass: string): FailureSignature {
  const msgPattern = normalizeMessage(err.raw_message ?? '');
  const now = new Date().toISOString();
  return {
    sig_id: signatureHash(target, err.status, errClass, msgPattern),
    target,
    http_status: err.status,
    error_class: errClass,
    message_pattern: msgPattern,
    first_seen_iso: now,
    last_seen_iso: now,
    drill_count: 1,
  };
}

export class AntibodyCatalog {
  private catalog = new Map<string, FailureSignature>();

  /** Record a drill outcome. Returns whether this signature was already known. */
  record(sig: FailureSignature): { wasKnown: boolean; entry: FailureSignature } {
    const existing = this.catalog.get(sig.sig_id);
    if (existing) {
      existing.last_seen_iso = sig.first_seen_iso;
      existing.drill_count += 1;
      return { wasKnown: true, entry: existing };
    }
    this.catalog.set(sig.sig_id, sig);
    return { wasKnown: false, entry: sig };
  }

  /** Is this signature in the catalog (and seen within `recencySec`)? */
  isKnown(sigId: string, recencySec: number): boolean {
    const entry = this.catalog.get(sigId);
    if (!entry) return false;
    const ageSec = (Date.now() - new Date(entry.last_seen_iso).getTime()) / 1000;
    return ageSec <= recencySec;
  }

  /** Coverage = number of distinct signatures. Higher = more failure-modes inoculated. */
  coverage(): number {
    return this.catalog.size;
  }

  /** Full snapshot for HEC emission. */
  snapshot(): FailureSignature[] {
    return Array.from(this.catalog.values());
  }

  /** Reset (test helper). */
  reset(): void {
    this.catalog.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 2. TCellMemory — reclassification memory with confidence
// ─────────────────────────────────────────────────────────────────────────

export interface TCellMemoryEntry {
  sig_id: string;
  error_class: string;
  fallback_eligible: boolean;
  confidence: number; // [0, 1] — fraction of hits where classification held
  hits: number;
  misses: number;
}

export class TCellMemory {
  private memory = new Map<string, TCellMemoryEntry>();

  /** Look up a prior classification for this signature. Returns undefined if unseen. */
  recall(sigId: string): TCellMemoryEntry | undefined {
    return this.memory.get(sigId);
  }

  /** Record a classification outcome. Hit = classification matched; Miss = it didn't. */
  remember(sigId: string, errorClass: string, fallbackEligible: boolean, hit: boolean): TCellMemoryEntry {
    let entry = this.memory.get(sigId);
    if (!entry) {
      entry = {
        sig_id: sigId,
        error_class: errorClass,
        fallback_eligible: fallbackEligible,
        confidence: hit ? 1 : 0,
        hits: hit ? 1 : 0,
        misses: hit ? 0 : 1,
      };
      this.memory.set(sigId, entry);
      return entry;
    }
    if (hit) entry.hits += 1;
    else entry.misses += 1;
    entry.confidence = entry.hits / (entry.hits + entry.misses);
    return entry;
  }

  reset(): void {
    this.memory.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3. InoculationScheduler — priority sampling by expected information gain
// ─────────────────────────────────────────────────────────────────────────

export interface DrillCandidate<S> {
  scenario: S;
  sig_id: string;
}

export interface SchedulerWeights {
  /** Hours after which a known signature's "freshness" decays to half. */
  recency_halflife_hours: number;
  /** Multiplier for unknown (= zero-knowledge) scenarios. */
  novelty_boost: number;
}

const DEFAULT_WEIGHTS: SchedulerWeights = {
  recency_halflife_hours: 6,
  novelty_boost: 4,
};

/**
 * Pick the next drill candidate by expected information gain.
 *
 * Score formula:
 *   - unknown signature: novelty_boost (high — we learn the most)
 *   - known signature:   2^(-age_hours / halflife) (low — repetition is waste)
 *
 * Returns the highest-scoring candidate (deterministic argmax, not random sample,
 * so tests are stable). Tie-break by candidate order.
 */
export function pickNextDrill<S>(
  candidates: DrillCandidate<S>[],
  catalog: AntibodyCatalog,
  weights: SchedulerWeights = DEFAULT_WEIGHTS,
): { picked: DrillCandidate<S>; score: number; novel: boolean } | undefined {
  if (candidates.length === 0) return undefined;
  const now = Date.now();
  let best: { c: DrillCandidate<S>; score: number; novel: boolean } | undefined;
  for (const candidate of candidates) {
    const snap = catalog.snapshot().find((e) => e.sig_id === candidate.sig_id);
    let score: number;
    let novel: boolean;
    if (!snap) {
      score = weights.novelty_boost;
      novel = true;
    } else {
      // Inverse-freshness: a just-drilled scenario scores near 0 (low priority,
      // we just learned about it), a long-stale scenario approaches 1 (high
      // priority, our knowledge has decayed). Always strictly below novelty_boost
      // so any unknown candidate wins over any known one.
      const ageHours = (now - new Date(snap.last_seen_iso).getTime()) / (3600 * 1000);
      score = 1 - 2 ** (-ageHours / weights.recency_halflife_hours);
      novel = false;
    }
    if (!best || score > best.score) {
      best = { c: candidate, score, novel };
    }
  }
  if (!best) return undefined;
  return { picked: best.c, score: best.score, novel: best.novel };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. AutoimmuneGuard — kill-switch when drills cause more harm than they prevent
// ─────────────────────────────────────────────────────────────────────────
//
// Surfaced via multi-view synthesis blind-spot detection: biology warns of
// autoimmune disease. The aegis analogue is a chaos drill that triggers a
// real outage the system can't recover from, harming the user more than the
// hypothetical future failure being inoculated against.

export interface ImpactRecord {
  drill_id: string;
  prevented_seconds: number; // estimated downtime avoided in subsequent recovery
  caused_seconds: number; // any actual downtime the drill itself caused
  timestamp: string;
}

export interface AutoimmuneStatus {
  enabled: boolean; // false = killed-switch tripped, drills paused
  net_seconds_helped: number; // sum prevented − sum caused over window
  recent_drills: number;
  reason_disabled?: string;
}

export class AutoimmuneGuard {
  private records: ImpactRecord[] = [];
  private enabled = true;
  private reason?: string;
  /** Window over which to evaluate net impact (drills older than this dropped). */
  private windowSec: number;
  /** Trip threshold: if net_helped < this many seconds, disable. */
  private tripBelow: number;

  constructor(opts?: { windowSec?: number; tripBelow?: number }) {
    this.windowSec = opts?.windowSec ?? 6 * 3600; // 6 hours
    this.tripBelow = opts?.tripBelow ?? -60; // net causing > 60s harm → disable
  }

  record(impact: ImpactRecord): void {
    this.records.push(impact);
    this.purgeOld();
    this.evaluate();
  }

  /** Should the chaos engine attempt the next drill? */
  isEnabled(): boolean {
    return this.enabled;
  }

  status(): AutoimmuneStatus {
    const helped = this.records.reduce(
      (acc, r) => acc + (r.prevented_seconds - r.caused_seconds),
      0,
    );
    return {
      enabled: this.enabled,
      net_seconds_helped: helped,
      recent_drills: this.records.length,
      reason_disabled: this.reason,
    };
  }

  /** Manual re-enable (after operator review). */
  reset(): void {
    this.records = [];
    this.enabled = true;
    this.reason = undefined;
  }

  private purgeOld(): void {
    const cutoff = Date.now() - this.windowSec * 1000;
    this.records = this.records.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
  }

  private evaluate(): void {
    const helped = this.records.reduce(
      (acc, r) => acc + (r.prevented_seconds - r.caused_seconds),
      0,
    );
    if (helped < this.tripBelow) {
      this.enabled = false;
      this.reason = `net impact ${helped.toFixed(1)}s over ${this.records.length} recent drills (threshold ${this.tripBelow}s)`;
    }
  }
}
