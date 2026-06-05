// Shared types used across Aegis layers and the Receipt builder.

export type ProviderOutcome = 'success' | 'error' | 'canceled' | 'timeout';

export interface ProviderError {
  status?: number;
  type?: string;
  code?: string;
  message_class?: string; // L4-normalized class, e.g., 'credit_balance_too_low'
  raw_message?: string;
}

export interface ProviderTry {
  name: string; // e.g., 'anthropic/claude-sonnet-4-5'
  via: 'tf' | 'direct' | 'splunk';
  outcome: ProviderOutcome;
  error?: ProviderError;
  ttft_ms: number | null;
  total_ms: number;
  tokens?: { input: number; output: number };
}

export interface Contract {
  latency_budget_ms?: number;
  cost_budget_usd?: number;
  quality_floor?: string;
}

export type LayerFired = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';

export interface TFHealthRecord {
  reachable: boolean;
  bypass_used: boolean;
  last_heartbeat_ms?: number;
}

// AI Ops Trust Layer — every Receipt carries a posture summary for operators,
// auditors, and SOC analysts. The splunk_query field is a pre-built SPL
// expression that locates this exact request in the Splunk index.
export interface TrustPosture {
  verdict: 'trusted' | 'degraded' | 'failed';
  human_action: string;
  splunk_query: string;
  provenance: string[]; // rule IDs + layer names that shaped this response
}
