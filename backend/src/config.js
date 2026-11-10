import { z } from 'zod'

const bool = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === '1' || value === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  INGEST_TOKEN: z.string().min(16),
  COOKIE_SECURE: bool.default(true),
  COOKIE_NAME: z.string().default('hidrobot_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  COMMAND_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  DEVICE_OFFLINE_MINUTES: z.coerce.number().int().positive().default(15),
  READINGS_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  ALERT_COOLDOWN_MINUTES: z.coerce.number().int().positive().default(30),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  SEED: bool.default(false),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TRUST_PROXY: bool.default(true),
  NODERED_COMMAND_URL: z.string().optional().default(''),
  NODERED_TOKEN: z.string().optional().default(''),
  NODERED_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
})

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Configuración inválida: ${detail}`)
  }
  return parsed.data
}
