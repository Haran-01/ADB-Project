import { z } from 'zod';
import { loadEnv } from '../../../scripts/lib/database.mjs';

export function getEnv(values = loadEnv()) {
  return z
    .object({
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
      PORT: z.coerce.number().int().min(1).max(65535).default(4000),
      HOST: z.string().default('127.0.0.1'),
      FRONTEND_ORIGIN: z.url().default('http://localhost:5173'),
      DATABASE_URL: z.string().min(1),
      DATABASE_LISTEN_URL: z.string().optional(),
      NEO4J_URI: z.string().min(1),
      NEO4J_USER: z.string().default('neo4j'),
      NEO4J_PASSWORD: z.string().min(1),
      NEO4J_DATABASE: z.string().default('neo4j'),
      API_TOKEN: z.string().min(24).optional(),
      WORKER_ENABLED: z.enum(['true', 'false']).default('true'),
      WORKER_POLL_MS: z.coerce.number().int().min(100).default(2000),
    })
    .passthrough()
    .superRefine((v, ctx) => {
      if ((v.NODE_ENV === 'production' || v.HOST !== '127.0.0.1') && !v.API_TOKEN)
        ctx.addIssue({
          code: 'custom',
          message: 'API_TOKEN is required for production or non-loopback binding',
          path: ['API_TOKEN'],
        });
    })
    .parse(values);
}
