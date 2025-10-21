/**
 * Redis Socket.IO Adapter
 * 
 * DISABLED BY DEFAULT - Requires Redis server
 * 
 * Enables horizontal scaling of Socket.IO across multiple server instances.
 * All instances share the same draft state through Redis pub/sub.
 * 
 * To enable:
 * 1. Install: npm i @socket.io/redis-adapter redis
 * 2. Set env: USE_REDIS_SOCKET=1, REDIS_URL=redis://localhost:6379
 * 3. Uncomment code below and use in index.ts
 */

/*
import { Server as IOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export async function setupRedisAdapter(io: IOServer) {
  const pubClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });
  
  const subClient = pubClient.duplicate();

  await Promise.all([
    pubClient.connect(),
    subClient.connect(),
  ]);

  io.adapter(createAdapter(pubClient, subClient));

  pubClient.on('error', (err) => console.error('[Redis Socket.IO pub] Error:', err));
  subClient.on('error', (err) => console.error('[Redis Socket.IO sub] Error:', err));

  console.log('[Socket.IO] Redis adapter enabled - multi-instance ready');

  return { pubClient, subClient };
}
*/

// Placeholder export for type safety
export const USE_REDIS_SOCKET = process.env.USE_REDIS_SOCKET === '1';
