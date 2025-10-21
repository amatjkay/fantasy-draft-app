import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { io as Client, Socket } from 'socket.io-client';
import { startServer, stopServer } from '../index';
import { dataStore } from '../dataStore';

let port: number;

describe('WebSocket (Socket.IO)', () => {
  beforeAll(async () => {
    // Запускаем сервер на свободном порту (0)
    port = await startServer(0);
  });

  afterAll(async () => {
    await stopServer();
  });

  // Изоляция: сбрасываем драфт-состояние между тестами
  afterEach(() => {
    dataStore.resetDraft();
  });

  it('connects and receives connected event, handles ping/pong', async () => {
    const url = `http://localhost:${port}`;
    const client: Socket = Client(url, { transports: ['websocket'] });

    const connected = await new Promise<{ ok: boolean }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting connected')), 5000);
      client.on('connected', (payload: { ok: boolean }) => {
        clearTimeout(timer);
        resolve(payload);
      });
      client.on('connect_error', reject);
    });

    expect(connected.ok).toBe(true);

    const ponged = await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting pong')), 5000);
      client.once('pong', () => {
        clearTimeout(timer);
        resolve();
      });
      client.emit('ping');
    });

    expect(ponged).toBeUndefined();

    client.disconnect();
  });

  it('multiple clients: presence and shared state', async () => {
    const url = `http://localhost:${port}`;
    const c1: Socket = Client(url, { transports: ['websocket'] });
    const c2: Socket = Client(url, { transports: ['websocket'] });

    // Подключение обоих клиентов
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout connect c1')), 5000);
        c1.on('connect', () => { clearTimeout(t); resolve(); });
        c1.on('connect_error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout connect c2')), 5000);
        c2.on('connect', () => { clearTimeout(t); resolve(); });
        c2.on('connect_error', reject);
      })
    ]);

    const roomId = `presence-room-${Math.random().toString(36).slice(2)}`;
    const u1 = 'u-pres-1';
    const u2 = 'u-pres-2';

    // Ожидание presence для обоих клиентов
    const p1 = new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout presence c1')), 5000);
      c1.on('draft:presence', (payload: any) => {
        if (payload.roomId === roomId && payload.count >= 2) {
          clearTimeout(t);
          resolve(payload);
        }
      });
    });
    const p2 = new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout presence c2')), 5000);
      c2.on('draft:presence', (payload: any) => {
        if (payload.roomId === roomId && payload.count >= 2) {
          clearTimeout(t);
          resolve(payload);
        }
      });
    });

    c1.emit('draft:join', { roomId, userId: u1 });
    c2.emit('draft:join', { roomId, userId: u2 });

    const pr1 = await p1;
    const pr2 = await p2;
    expect(pr1.users).toEqual(expect.arrayContaining([u1, u2]));
    expect(pr2.users).toEqual(expect.arrayContaining([u1, u2]));

    // Запуск драфта и проверка, что оба получают состояние
    const state1 = new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout state c1')), 5000);
      c1.once('draft:state', (st: any) => { clearTimeout(t); resolve(st); });
    });
    const state2 = new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout state c2')), 5000);
      c2.once('draft:state', (st: any) => { clearTimeout(t); resolve(st); });
    });
    c1.emit('draft:start', { roomId, pickOrder: [u1, u2], timerSec: 30 });
    const s1 = await state1;
    const s2 = await state2;
    expect(s1.started).toBe(true);
    expect(s2.started).toBe(true);
    expect(s1.activeUserId).toBe(u1);
    expect(s2.activeUserId).toBe(u1);

    // Пик первым клиентом, второй должен получить обновление
    const afterPickC2 = new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout state after pick c2')), 5000);
      c2.once('draft:state', (st: any) => { clearTimeout(t); resolve(st); });
    });
    c1.emit('draft:pick', { roomId, userId: u1, playerId: 'player-1' });
    const s2b = await afterPickC2;
    expect(s2b.pickIndex).toBe(1);
    expect(s2b.picks[0]).toMatchObject({ userId: u1, playerId: 'player-1' });

    // Ожидание обновления presence после отключения второго клиента
    const presenceAfterLeave = new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout presence after leave')), 5000);
      c1.once('draft:presence', (payload: any) => { clearTimeout(t); resolve(payload); });
    });
    c2.disconnect();
    const prAfter = await presenceAfterLeave;
    expect(prAfter.count).toBe(1);
    expect(prAfter.users).toEqual(expect.arrayContaining([u1]));

    c1.disconnect();
  });

  it('draft start and pick flow', async () => {
    const url = `http://localhost:${port}`;
    const client: Socket = Client(url, { transports: ['websocket'] });

    // Ждём подключения
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting connect')), 5000);
      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('connect_error', reject);
    });

    const roomId = 'room-1';
    const pickOrder = ['u1', 'u2'];
    const timerSec = 30;

    // Запускаем драфт
    const state1 = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting draft:state start')), 5000);
      client.once('draft:state', (payload: any) => {
        clearTimeout(timer);
        resolve(payload);
      });
      client.emit('draft:start', { roomId, pickOrder, timerSec });
    });

    expect(state1.started).toBe(true);
    expect(state1.roomId).toBe(roomId);
    expect(state1.activeUserId).toBe(pickOrder[0]);
    expect(state1.pickIndex).toBe(0);

    // Совершаем пик первым пользователем (используем реальный player ID из players.json)
    const state2 = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting draft:state after pick')), 5000);
      client.once('draft:state', (payload: any) => {
        clearTimeout(timer);
        resolve(payload);
      });
      client.emit('draft:pick', { roomId, userId: 'u1', playerId: 'player-1' });
    });

    expect(state2.pickIndex).toBe(1);
    expect(state2.picks.length).toBe(1);
    expect(state2.picks[0]).toMatchObject({ userId: 'u1', playerId: 'player-1' });
    expect(state2.activeUserId).toBe(pickOrder[1]);

    client.disconnect();
  });

  it('receives timer tick events and autopick on expiration', async () => {
    const url = `http://localhost:${port}`;
    const client: Socket = Client(url, { transports: ['websocket'] });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting connect')), 5000);
      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('connect_error', reject);
    });

    const roomId = 'timer-room';
    const pickOrder = ['u1'];
    const timerSec = 2; // 2 секунды для теста

    // Запускаем драфт с коротким таймером
    await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting draft:state')), 5000);
      client.once('draft:state', (payload: any) => {
        clearTimeout(timer);
        resolve(payload);
      });
      client.emit('draft:start', { roomId, pickOrder, timerSec });
    });

    // Ждём tick-события
    const timerEvent = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting draft:timer')), 5000);
      client.once('draft:timer', (payload: any) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

    expect(timerEvent.roomId).toBe(roomId);
    expect(timerEvent.timerRemainingMs).toBeDefined();
    expect(timerEvent.activeUserId).toBe('u1');

    // Ждём автопик при истечении таймера (2 секунды + запас)
    const autopickEvent = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting draft:autopick')), 5000);
      client.once('draft:autopick', (payload: any) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

    expect(autopickEvent.roomId).toBe(roomId);
    expect(autopickEvent.pick).toBeDefined();
    expect(autopickEvent.pick.userId).toBe('u1');
    // Автопик выбирает топ-игрока из доступных в dataStore
    expect(autopickEvent.pick.playerId).toMatch(/^player-\d+$/);

    client.disconnect();
  }, 10000); // увеличенный timeout для теста
});
