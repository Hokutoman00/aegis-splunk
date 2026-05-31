// Splunk hosted-models client. The Splunk AI Assistant exposes a set of
// hosted LLMs (gpt-oss-120b, gpt-oss-20b, foundation-ai-security) over an
// OpenAI-compatible chat-completions surface on the Splunk Cloud / Enterprise
// management port. Aegis treats this as a peer of the TrueFoundry-fronted
// provider chain so the hedge / fallback layers can target Splunk-hosted
// models the same way they target Anthropic / OpenAI / Gemini.
//
// Auth uses Splunk's REST bearer token (session token issued by
// /services/auth/login or a long-lived service account token).

import OpenAI from 'openai';
import { getEnv } from '../config.js';

let cachedClient: OpenAI | null = null;

export function getSplunkClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const env = getEnv();
  cachedClient = new OpenAI({
    apiKey: env.SPLUNK_SESSION_TOKEN,
    baseURL: env.SPLUNK_HOSTED_MODELS_BASE,
    // Splunk REST auth: `Authorization: Bearer <token>`. OpenAI SDK already
    // sends the apiKey as a bearer header, so no custom header override needed.
  });
  return cachedClient;
}

export function getSplunkModels(): string[] {
  return ['gpt-oss-120b', 'gpt-oss-20b', 'foundation-ai-security'];
}

export function getSplunkFoundationAIModel(): string {
  return 'foundation-ai-security';
}

// Reset hook for tests. Not part of the runtime surface.
export function __resetSplunkClientForTest(): void {
  cachedClient = null;
}
