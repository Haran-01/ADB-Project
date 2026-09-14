import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { apiRoutes } from './routes/index.js';
import { healthRoutes } from './modules/health/health.routes.js';

export function authorized(token, expected) {
  if (!expected) return true;
  if (typeof token !== 'string') return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createApp(deps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: deps.env.FRONTEND_ORIGIN, methods: ['GET', 'POST'] }));
  app.use(express.json({ limit: '32kb' }));
  if (deps.env.NODE_ENV !== 'test') app.use(morgan(':method :url :status :response-time ms'));
  app.use('/api/health', healthRoutes(deps.pool, deps.graph));
  app.use('/api', (req, res, next) => {
    if (!authorized(req.get('authorization')?.replace(/^Bearer /, ''), deps.env.API_TOKEN))
      return res.status(401).json({ error: 'Unauthorized' });
    next();
  });
  app.use('/api', apiRoutes(deps));
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: 'Invalid request',
        issues: error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (error.code === 'P0002') return res.status(404).json({ error: 'Record not found' });
    if (['23503', '23505', '23514', '22023'].includes(error.code))
      return res.status(409).json({ error: 'Operation conflicts with database rules' });
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Request failed', error.code ?? error.name);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  });
  return app;
}
