import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { io as Client, Socket } from 'socket.io-client';
import { startServer, stopServer } from '../index';
import { dataStore } from '../dataStore';

let port: number;

describe('Reconnect grace flow', () => {
  beforeAll(async () => {
    // Speed up test by shrinking grace period
    process.env.RECONNECT_GRACE_MS = '1000';
    port = await startServer(0);
  });

  afterAll(async () => {
    await stopServer();
    delete process.env.RECONNECT_GRACE_MS;
  });

  afterEach(() => {
    dataStore.resetDraft();
  });

  it('pauses on disconnect of active user, emits reconnect_wait, and autopicks after grace timeout', async () => {
    const url = `http://localhost:${port}`;
    const u1: Socket = Client(url, { transports: ['websocket'] });
    const u2: Socket = Client(url, { transports: ['websocket'] });

    // connect both
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout connect u1')), 5000);
        u1.on('connect', () => { clearTimeout(t); resolve(); });
        u1.on('connect_error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout connect u2')), 5000);
        u2.on('connect', () => { clearTimeout(t); resolve(); });
        u2.on('connect_error', reject);
      }),
    ]);

    const roomId = `reconnect-room-${Math.random().toString(36).slice(2)}`;

    // join room as two users
    u1.emit('draft:join', { roomId, userId: 'u1' });
    u2.emit('draft:join', { roomId, userId: 'u2' });

    // wait for initial state after start
    const state1 = new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting start state')), 5000);
      u1.once('draft:state', (st) => { clearTimeout(t); resolve(st); });
    });

    u1.emit('draft:start', { roomId, pickOrder: ['u1', 'u2'], timerSec: 10 });
    const st1 = await state1;
    expect(st1.started).toBe(true);
    expect(st1.activeUserId).toBe('u1');

    // Expect reconnect_wait after u1 disconnects while active
    const waitEvent = new Promise<{ roomId: string; userId: string; graceMs: number }>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting reconnect_wait')), 5000);
      u2.once('draft:reconnect_wait', (payload) => { clearTimeout(t); resolve(payload); });
    });

    u1.disconnect();
    const waitPayload = await waitEvent;
    expect(waitPayload.roomId).toBe(roomId);
    expect(waitPayload.userId).toBe('u1');
    expect(waitPayload.graceMs).toBeGreaterThan(0);

    // After grace, expect an autopick broadcast
    const auto = await new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting draft:autopick')), 5000);
      u2.once('draft:autopick', (p) => { clearTimeout(t); resolve(p); });
    });

    expect(auto.roomId).toBe(roomId);
    expect(auto.pick.userId).toBe('u1');

    u2.disconnect();
  });
});
