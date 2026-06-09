import { describe, expect, test } from 'bun:test';
import {
  AntibodyCatalog,
  AutoimmuneGuard,
  TCellMemory,
  buildSignature,
  pickNextDrill,
} from './immunity.js';
import type { ProviderError } from './types.js';

const mkErr = (over: Partial<ProviderError> = {}): ProviderError => ({
  status: 400,
  raw_message: 'credit balance is too low',
  ...over,
});

describe('AntibodyCatalog', () => {
  test('records new signature and reports unknown -> known transition', () => {
    const cat = new AntibodyCatalog();
    const sig = buildSignature('anthropic/claude-sonnet-4-5', mkErr(), 'credit_balance_too_low');
    expect(cat.coverage()).toBe(0);
    const first = cat.record(sig);
    expect(first.wasKnown).toBe(false);
    expect(cat.coverage()).toBe(1);
    const second = cat.record(
      buildSignature('anthropic/claude-sonnet-4-5', mkErr(), 'credit_balance_too_low'),
    );
    expect(second.wasKnown).toBe(true);
    expect(cat.coverage()).toBe(1); // still 1 distinct
    expect(second.entry.drill_count).toBe(2);
  });

  test('different targets produce different signatures', () => {
    const cat = new AntibodyCatalog();
    cat.record(buildSignature('anthropic/claude-sonnet-4-5', mkErr(), 'credit_balance_too_low'));
    cat.record(buildSignature('openai/gpt-4', mkErr(), 'credit_balance_too_low'));
    expect(cat.coverage()).toBe(2);
  });

  test('isKnown honors recency window', () => {
    const cat = new AntibodyCatalog();
    const sig = buildSignature('a', mkErr(), 'x');
    cat.record(sig);
    expect(cat.isKnown(sig.sig_id, 60)).toBe(true);
    // simulate old: poke the entry's last_seen
    const snap = cat.snapshot();
    const entry = snap[0];
    if (!entry) throw new Error('expected signature snapshot entry');
    entry.last_seen_iso = new Date(Date.now() - 120_000).toISOString();
    expect(cat.isKnown(sig.sig_id, 60)).toBe(false);
    expect(cat.isKnown(sig.sig_id, 300)).toBe(true);
  });
});

describe('TCellMemory', () => {
  test('first remember creates entry with confidence 1 on hit', () => {
    const mem = new TCellMemory();
    const entry = mem.remember('sig1', 'credit_balance_too_low', true, true);
    expect(entry.confidence).toBe(1);
    expect(entry.hits).toBe(1);
    expect(entry.misses).toBe(0);
    expect(mem.recall('sig1')?.fallback_eligible).toBe(true);
  });

  test('confidence updates on mixed hits and misses', () => {
    const mem = new TCellMemory();
    mem.remember('sig2', 'x', true, true);
    mem.remember('sig2', 'x', true, true);
    mem.remember('sig2', 'x', true, false);
    const entry = mem.recall('sig2');
    expect(entry?.hits).toBe(2);
    expect(entry?.misses).toBe(1);
    expect(entry?.confidence).toBeCloseTo(2 / 3, 4);
  });

  test('recall returns undefined for unseen sig', () => {
    const mem = new TCellMemory();
    expect(mem.recall('nope')).toBeUndefined();
  });
});

describe('InoculationScheduler (pickNextDrill)', () => {
  test('returns undefined for empty candidates', () => {
    const cat = new AntibodyCatalog();
    expect(pickNextDrill([], cat)).toBeUndefined();
  });

  test('prefers unknown signature over known', () => {
    const cat = new AntibodyCatalog();
    const sigA = buildSignature('a', mkErr(), 'cls');
    cat.record(sigA);
    const candidates = [
      { scenario: 'A_known', sig_id: sigA.sig_id },
      { scenario: 'B_unknown', sig_id: 'never-seen' },
    ];
    const picked = pickNextDrill(candidates, cat);
    expect(picked?.picked.scenario).toBe('B_unknown');
    expect(picked?.novel).toBe(true);
  });

  test('among known, prefers stale (older) over fresh', () => {
    const cat = new AntibodyCatalog();
    const sigStale = buildSignature('a', mkErr(), 'cls-stale');
    const sigFresh = buildSignature('b', mkErr(), 'cls-fresh');
    cat.record(sigStale);
    cat.record(sigFresh);
    // age sigStale by 100 hours
    const staleEntry = cat.snapshot().find((e) => e.sig_id === sigStale.sig_id);
    if (!staleEntry) throw new Error('expected stale signature snapshot entry');
    staleEntry.last_seen_iso = new Date(Date.now() - 100 * 3600 * 1000).toISOString();
    const candidates = [
      { scenario: 'stale', sig_id: sigStale.sig_id },
      { scenario: 'fresh', sig_id: sigFresh.sig_id },
    ];
    const picked = pickNextDrill(candidates, cat);
    expect(picked?.picked.scenario).toBe('stale');
    expect(picked?.novel).toBe(false);
  });

  test('all-known scheduler still picks deterministically (argmax)', () => {
    const cat = new AntibodyCatalog();
    const sig1 = buildSignature('a', mkErr(), 'one');
    const sig2 = buildSignature('b', mkErr(), 'two');
    cat.record(sig1);
    cat.record(sig2);
    const candidates = [
      { scenario: 'one', sig_id: sig1.sig_id },
      { scenario: 'two', sig_id: sig2.sig_id },
    ];
    const a = pickNextDrill(candidates, cat);
    const b = pickNextDrill(candidates, cat);
    // Deterministic: same input → same output
    expect(a?.picked.scenario).toBe(b?.picked.scenario);
  });
});

describe('AutoimmuneGuard', () => {
  test('starts enabled, stays enabled while drills help more than hurt', () => {
    const g = new AutoimmuneGuard({ tripBelow: -60 });
    g.record({
      drill_id: 'd1',
      prevented_seconds: 30,
      caused_seconds: 0,
      timestamp: new Date().toISOString(),
    });
    g.record({
      drill_id: 'd2',
      prevented_seconds: 45,
      caused_seconds: 5,
      timestamp: new Date().toISOString(),
    });
    expect(g.isEnabled()).toBe(true);
    expect(g.status().net_seconds_helped).toBe(70);
  });

  test('trips kill-switch when drills cause more harm than they prevent', () => {
    const g = new AutoimmuneGuard({ tripBelow: -60 });
    g.record({
      drill_id: 'd1',
      prevented_seconds: 5,
      caused_seconds: 80,
      timestamp: new Date().toISOString(),
    });
    expect(g.isEnabled()).toBe(false);
    expect(g.status().reason_disabled).toContain('net impact');
  });

  test('purges old records outside window', () => {
    const g = new AutoimmuneGuard({ windowSec: 60, tripBelow: -60 });
    const oldTs = new Date(Date.now() - 120_000).toISOString();
    g.record({ drill_id: 'old', prevented_seconds: 0, caused_seconds: 200, timestamp: oldTs });
    // The old record itself triggered evaluation, but inside record() purgeOld
    // runs first. Whether it trips depends on whether the old record itself
    // survives purge. Old record's timestamp is < cutoff → purged → net = 0.
    expect(g.isEnabled()).toBe(true);
  });

  test('reset() re-enables after a trip', () => {
    const g = new AutoimmuneGuard({ tripBelow: -10 });
    g.record({
      drill_id: 'x',
      prevented_seconds: 0,
      caused_seconds: 50,
      timestamp: new Date().toISOString(),
    });
    expect(g.isEnabled()).toBe(false);
    g.reset();
    expect(g.isEnabled()).toBe(true);
    expect(g.status().recent_drills).toBe(0);
  });
});

describe('integration — catalog + scheduler + memory + autoimmune', () => {
  test('blind-spot detection: scheduler picks unknown, catalog learns, autoimmune watches', () => {
    const cat = new AntibodyCatalog();
    const mem = new TCellMemory();
    const guard = new AutoimmuneGuard();
    const scenarios = [
      { scenario: 'anthropic_503', sig_id: 'sig-anthropic-503' },
      { scenario: 'openai_429', sig_id: 'sig-openai-429' },
      { scenario: 'splunk_mcp_timeout', sig_id: 'sig-mcp-timeout' },
    ];
    // First pick — all unknown, picks first (tie-break by order)
    const first = pickNextDrill(scenarios, cat);
    expect(first?.novel).toBe(true);
    expect(first?.picked.scenario).toBe('anthropic_503');
    // Simulate drill success: record signature + memory + impact
    const sig = buildSignature('anthropic', mkErr({ status: 503 }), 'service_unavailable');
    cat.record({ ...sig, sig_id: 'sig-anthropic-503' });
    mem.remember('sig-anthropic-503', 'service_unavailable', true, true);
    guard.record({
      drill_id: 'd1',
      prevented_seconds: 20,
      caused_seconds: 0,
      timestamp: new Date().toISOString(),
    });
    // Next pick — should now prefer one of the still-unknown
    const second = pickNextDrill(scenarios, cat);
    expect(second?.novel).toBe(true);
    expect(['openai_429', 'splunk_mcp_timeout']).toContain(second?.picked.scenario ?? '');
    expect(guard.isEnabled()).toBe(true);
    expect(cat.coverage()).toBe(1);
    expect(mem.recall('sig-anthropic-503')?.confidence).toBe(1);
  });
});
