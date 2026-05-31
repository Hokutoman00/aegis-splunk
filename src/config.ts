// Environment configuration with runtime validation.
// Bun auto-loads .env / .env.local at process start. Zod ensures the shape we depend on.

import { z } from 'zod';

const EnvSchema = z.object({
  // TrueFoundry (Criteria #1 — required)
  TRUEFOUNDRY_API_KEY: z.string().min(20),
  TRUEFOUNDRY_OPENAI_BASE: z.string().url(),
  TRUEFOUNDRY_BASE_URL: z.string().url().optional(),
  TRUEFOUNDRY_VIRTUAL_MODEL: z.string().min(1).default('aegis-resilient/claude-with-fallback'),

  // Direct provider keys (used only by L3 SPOF bypass; optional at boot)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  // Override default API base for the direct OpenAI client (e.g. Azure or proxy)
  OPENAI_DIRECT_BASE_URL: z.string().url().optional(),
  ANTHROPIC_DIRECT_BASE_URL: z.string().url().optional(),

  // Chaos toggles (Aegis 自作 L6)
  CHAOS_PRIMARY_DOWN: z.string().optional(),
  CHAOS_MCP_ERROR_RATE: z.string().optional(),
  CHAOS_REAL_RATE: z.string().default('0'),

  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Splunk hosted models + HEC (Phase 1 provider; optional at boot so existing
  // flows keep working until SPLUNK_SESSION_TOKEN is provisioned)
  SPLUNK_HOSTED_MODELS_BASE: z.string().url().default('https://localhost:8089/services/ai'),
  SPLUNK_SESSION_TOKEN: z.string().default(''),
  SPLUNK_HEC_URL: z.string().url().default('https://localhost:8088/services/collector'),
  SPLUNK_HEC_TOKEN: z.string().default(''),
  // Splunk MCP Server (Splunkbase #7931). Phase 2 MCP proxy forwards here;
  // REST shim falls back to SPLUNK_HOSTED_MODELS_BASE-derived REST endpoints.
  SPLUNK_MCP_URL: z.string().url().default('http://localhost:8089/services/mcp'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(
      `[aegis] environment validation failed:\n${issues}\n\nSee .env.example for the required shape. Copy to .env.local and fill in.`,
    );
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
