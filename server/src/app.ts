import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { sessionMiddleware } from './session';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';
import { join } from 'path';
import pkg from '../package.json';

export const app = express();

// Middlewares
app.use(helmet());
// CORS: разрешить все origins, если переменная окружения не задана; иначе использовать белый список
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!allowedOrigins.length) return cb(null, true); // все origins разрешены
      if (!origin) return cb(null, true); // запросы без origin (например, curl)
      return cb(null, allowedOrigins.includes(origin));
    },
    credentials: true,
  })
);
app.use(express.json());

// Session middleware
app.use(sessionMiddleware);

// OpenAPI & Swagger UI
const openapiPath = join(__dirname, '..', 'openapi.json');
let openapiSpec: any;
try {
  openapiSpec = JSON.parse(readFileSync(openapiPath, 'utf-8'));
} catch (e) {
  openapiSpec = { openapi: '3.0.0', info: { title: 'Fantasy Draft API', version: pkg.version } };
  console.warn('[app] OpenAPI spec not found or invalid, using fallback');
}

app.get('/api/openapi.json', (_req, res) => {
  res.json(openapiSpec);
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

// Import routes
import authRouter from './routes/auth';
import draftRouter from './routes/draft';
import dataRouter from './routes/data';
import { adminRouter } from './routes/admin';

// Static playground (optional): /playground.html
app.use(express.static(join(__dirname, '..', 'public')));

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Fantasy Draft API',
    version: pkg.version,
    endpoints: {
      health: '/health',
      version: '/api/version',
      auth: '/api/auth',
      draft: '/api/draft',
      data: '/api',
    },
  });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/draft', draftRouter);
app.use('/api', dataRouter);
app.use('/api/admin', adminRouter);

// Basic routes
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/version', (_req: Request, res: Response) => {
  res.status(200).json({ version: pkg.version });
});
