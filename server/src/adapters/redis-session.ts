/**
 * Redis Session Store Adapter
 * 
 * DISABLED BY DEFAULT - Requires Redis server
 * 
 * To enable:
 * 1. Install: npm i connect-redis redis
 * 2. Set env: USE_REDIS_SESSION=1, REDIS_URL=redis://localhost:6379
 * 3. Uncomment code below and import in app.ts
 */

/*
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

export async function createRedisSessionStore() {
  const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  redisClient.on('error', (err) => console.error('[Redis Session] Error:', err));
  redisClient.on('connect', () => console.log('[Redis Session] Connected'));

  await redisClient.connect();

  return new RedisStore({
    client: redisClient,
    prefix: 'draft:session:',
    ttl: 7 * 24 * 60 * 60, // 7 days
  });
}

export const sessionMiddleware = session({
  store: await createRedisSessionStore(),
  secret: process.env.SESSION_SECRET || 'fantasy-draft-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});
*/

// Placeholder export for type safety
export const USE_REDIS_SESSION = process.env.USE_REDIS_SESSION === '1';
