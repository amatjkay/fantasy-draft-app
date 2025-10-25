import { createServer } from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import { app } from './app';
import { draftManager } from './draftManager';
import { DraftTimerManager } from './draftTimer';
import { dataStore } from './dataStore';
import { setIO } from './ioBus';
import { getDraftRepository } from './persistence/repository';
import type { DraftRoomRecord, DraftPickRecord } from './persistence/types';
import { sessionMiddleware } from './session';
import { logger } from './utils/logger';
import { LobbyManager } from './lobby';
import { seedAdmin } from './seedAdmin';
import { startPositionsUpdater } from './services/positionsUpdater';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const httpServer = createServer(app);

const allowedSocketOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const io = new IOServer(httpServer, {
  cors: {
    origin: allowedSocketOrigins,
    credentials: true,
  },
});

// Use singleton draftManager (shared with REST API)
const timerManager = new DraftTimerManager(io, draftManager);
const lobbyManager = new LobbyManager();
const userSocketMap = new Map<string, { userId: string, roomId: string }>(); // socket.id -> { userId, roomId }
setIO(io);

// Share express-session with Socket.IO
io.engine.use((req: any, res: any, next: any) => sessionMiddleware(req, res, next));

// Restore rooms and picks from persistence on startup (best-effort)
function restoreFromRepository() {
  try {
    const repo = getDraftRepository();
    const rooms = repo.listRooms();
    const players = dataStore.getPlayersMap();
    const teams = dataStore.getTeamsMap();
    rooms.forEach((r) => {
      const room = draftManager.getOrCreate({
        roomId: r.roomId,
        pickOrder: r.pickOrder,
        timerSec: r.timerSec,
        snakeDraft: r.snakeDraft,
      });
      // Ensure teams exist
      r.pickOrder.forEach((uid) => {
        if (!dataStore.getTeam(uid)) {
          dataStore.createTeam(uid, `Team ${uid}`, 'default-logo', 1);
        }
      });
      // Start and replay picks
      room.start();
      const picks = repo.listPicks(r.roomId);
      picks
        .sort((a, b) => a.pickIndex - b.pickIndex)
        .forEach((p) => {
          try {
            room.makePick(p.userId, p.playerId, players, teams, p.autopick);
          } catch (e) {
            // ignore replay errors (e.g., already applied)
          }
        });
      logger.draft.restored(r.roomId, picks.length);
    });
  } catch (e) {
    logger.warn('server', 'restoreFromRepository failed or skipped', { error: e instanceof Error ? e.message : String(e) });
  }
}

// Seed admin user on startup
seedAdmin().catch(err => console.error('[Seed] Failed to create admin:', err));

// Start positions updater (eligiblePositions) on an interval
startPositionsUpdater();

// Presence tracking: roomId -> set of userIds
const roomPresence = new Map<string, Set<string>>();
// socket.id -> list of memberships to cleanup on disconnect
const socketMemberships = new Map<string, Array<{ roomId: string; userId?: string }>>();

// Reconnect grace timers: roomId -> { userId, timeout }
const reconnectTimers = new Map<string, { userId: string; timeout: NodeJS.Timeout }>();
function getGraceMs() {
  const v = process.env.RECONNECT_GRACE_MS;
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 60 * 1000;
}

function isGlobalAdmin(userId?: string): boolean {
  if (!userId) return false;
  try {
    const u = dataStore.getUser(userId);
    return (u?.role === 'admin');
  } catch {
    return false;
  }
}

function isLobbyAdminOrGlobal(roomId: string, userId?: string): boolean {
  if (!userId) return false;
  if (isGlobalAdmin(userId)) return true;
  const lobby = lobbyManager.getLobby(roomId);
  return lobby?.adminId === userId;
}

function broadcastPresence(roomId: string) {
  const users = Array.from(roomPresence.get(roomId) ?? []);
  io.to(roomId).emit('draft:presence', { roomId, users, count: users.length });
}

io.on('connection', (socket: Socket) => {
  // Простое событие для проверки соединения
  socket.emit('connected', { ok: true });

  socket.on('ping', () => {
    socket.emit('pong');
  });

  // Присоединение к комнате драфта
  socket.on('draft:join', ({ roomId, userId }: { roomId: string; userId?: string }) => {
    if (!roomId) return;
    socket.join(roomId);
    // Track presence if userId provided
    const sessUserId = (socket.request as any)?.session?.userId as string | undefined;
    const effectiveUserId = sessUserId || userId;
    if (effectiveUserId) {
      const set = roomPresence.get(roomId) ?? new Set<string>();
      set.add(effectiveUserId);
      roomPresence.set(roomId, set);
      const list = socketMemberships.get(socket.id) ?? [];
      list.push({ roomId, userId: effectiveUserId });
      socketMemberships.set(socket.id, list);
      broadcastPresence(roomId);
    }
    const room = draftManager.get(roomId);
    if (room) {
      const state = room.getState();
      socket.emit('draft:state', state);
    }

    // If this user had a pending reconnect grace, cancel and resume
    const pending = reconnectTimers.get(roomId);
    if (pending && effectiveUserId && pending.userId === effectiveUserId) {
      clearTimeout(pending.timeout);
      reconnectTimers.delete(roomId);
      const r = draftManager.get(roomId);
      if (r) {
        r.resume();
        io.to(roomId).emit('player:reconnected', { roomId, userId: effectiveUserId });
        io.to(roomId).emit('draft:state', r.getState());
      }
    }
  });

  // Запуск драфта
  socket.on(
    'draft:start',
    ({ roomId, pickOrder, timerSec }: { roomId: string; pickOrder: string[]; timerSec?: number }) => {
      try {
        // Присоединиться к комнате для получения broadcast-событий
        socket.join(roomId);

        // Создать команды для всех пользователей, если еще не созданы
        pickOrder.forEach((userId) => {
          if (!dataStore.getTeam(userId)) {
            dataStore.createTeam(userId, `Team ${userId}`, 'default-logo', 1);
          }
        });

        const room = draftManager.getOrCreate({
          roomId,
          pickOrder,
          timerSec: timerSec ?? 60,
          snakeDraft: true,
        });
        room.start();
        io.to(roomId).emit('draft:state', room.getState());
        // Persist room (best-effort)
        try {
          const repo = getDraftRepository();
          const rec: DraftRoomRecord = {
            roomId,
            timerSec: room.getState().timerSec,
            snakeDraft: true,
            createdAt: Date.now(),
            pickOrder,
          };
          repo.saveRoom(rec);
        } catch {}
      } catch (err: any) {
        socket.emit('draft:error', { message: err?.message ?? 'draft:start failed' });
      }
    }
  );

  // Текущие состояние по запросу
  socket.on('draft:state', ({ roomId }: { roomId: string }) => {
    try {
      const room = draftManager.get(roomId);
      if (!room) throw new Error('Room not found');
      socket.emit('draft:state', room.getState());
    } catch (err: any) {
      socket.emit('draft:error', { message: err?.message ?? 'draft:state failed' });
    }
  });

  // Совершение пика
  socket.on('draft:pick', (data: { roomId: string; userId?: string; playerId: string }) => {
    const { roomId, playerId, userId } = data;
    console.log('[Socket draft:pick] Received:', { roomId, playerId, userId });
    
    const room = draftManager.get(roomId);
    if (!room) {
      console.error('[Socket draft:pick] Room not found:', roomId);
      socket.emit('draft:error', { message: 'Room not found' });
      return;
    }

    try {
      const sessUserId = (socket.request as any)?.session?.userId as string | undefined;
      const effectiveUserId = sessUserId || userId;
      
      if (!effectiveUserId) {
        console.error('[Socket draft:pick] No userId available');
        socket.emit('draft:error', { message: 'User ID not found' });
        return;
      }
      
      console.log('[Socket draft:pick] Effective userId:', effectiveUserId);
      console.log('[Socket draft:pick] Current state:', room.getState());
      
      const players = dataStore.getPlayersMap();
      const teams = dataStore.getTeamsMap();
      const newState = room.makePick(effectiveUserId, playerId, players, teams);
      console.log('[Socket draft:pick] Pick successful, new state:', newState);
      
      logger.draft.pick(roomId, effectiveUserId, playerId, false);
      io.to(roomId).emit('draft:state', newState);
      
      // Check if draft is now completed
      if (newState.completed) {
        console.log('[Socket draft:pick] Draft completed! Emitting draft:completed');
        io.to(roomId).emit('draft:completed', { roomId, finalState: newState });
      }
      
      // Persist pick (best-effort)
      try {
        const repo = getDraftRepository();
        const last = newState.picks[newState.picks.length - 1];
        const rec: DraftPickRecord = {
          roomId,
          pickIndex: last.pickIndex,
          round: last.round,
          slot: last.slot,
          userId: last.userId,
          playerId: last.playerId,
          autopick: false,
          createdAt: Date.now(),
        };
        repo.savePick(rec);
      } catch {}
    } catch (err: any) {
      socket.emit('draft:error', { message: err.message });
    }
  });

  // Пауза/резюм
  socket.on('draft:pause', ({ roomId }: { roomId: string }) => {
    try {
      const sessUserId = (socket.request as any)?.session?.userId as string | undefined;
      if (!isGlobalAdmin(sessUserId)) {
        socket.emit('draft:error', { message: 'Only admin can pause the draft' });
        return;
      }
      const room = draftManager.get(roomId);
      if (!room) throw new Error('Room not found');
      room.pause();
      io.to(roomId).emit('draft:state', room.getState());
    } catch (err: any) {
      socket.emit('draft:error', { message: err?.message ?? 'draft:pause failed' });
    }
  });
  socket.on('draft:resume', ({ roomId }: { roomId: string }) => {
    try {
      const sessUserId = (socket.request as any)?.session?.userId as string | undefined;
      if (!isGlobalAdmin(sessUserId)) {
        socket.emit('draft:error', { message: 'Only admin can resume the draft' });
        return;
      }
      const room = draftManager.get(roomId);
      if (!room) throw new Error('Room not found');
      room.resume();
      io.to(roomId).emit('draft:state', room.getState());
    } catch (err: any) {
      socket.emit('draft:error', { message: err?.message ?? 'draft:resume failed' });
    }
  });

  // ============================================================================
  // Lobby events
  // ============================================================================

  socket.on('lobby:join', (data: { roomId?: string; userId: string; login: string }) => {
    const { userId, login } = data;
    console.log('[Socket lobby:join] Received:', { userId, login });
    
    // Always use the single active room
    const activeRoomId = 'main-draft-room';
    console.log('[Socket lobby:join] Automatically joining active room:', activeRoomId);
    
    const user = dataStore.getUser(userId);
    const teamName = user?.teamName || `${login}'s Team`;
    
    const lobby = lobbyManager.createOrGetLobby(activeRoomId, userId);
    lobbyManager.addParticipant(activeRoomId, userId, login, teamName, socket.id);
    userSocketMap.set(socket.id, { userId, roomId: activeRoomId }); // Track user socket
    
    const participants = lobbyManager.getParticipantsList(activeRoomId);
    io.to(`lobby:${activeRoomId}`).emit('lobby:participants', {
      participants,
      adminId: lobby.adminId,
    });

    socket.join(`lobby:${activeRoomId}`);
    console.log(`[Socket lobby:join] User ${login} (${userId}) joined active lobby room ${activeRoomId}`);
    
    // Emit the active room ID back to client
    socket.emit('lobby:roomAssigned', { roomId: activeRoomId });
  });

  socket.on('lobby:ready', (data: { roomId: string; userId: string; ready: boolean }) => {
    const { roomId, userId, ready } = data;
    lobbyManager.setReady(roomId, userId, ready);
    io.to(`lobby:${roomId}`).emit('lobby:ready', { userId, ready });
  });

  socket.on('lobby:addBots', (data: { roomId: string; count: number }) => {
    const { roomId, count } = data;
    console.log('[Socket lobby:addBots] Received:', { roomId, count });
    const sessUserId = (socket.request as any)?.session?.userId as string | undefined;
    
    // Check if user has admin role
    const user = sessUserId ? dataStore.getUser(sessUserId) : null;
    if (!user || user.role !== 'admin') {
      socket.emit('lobby:error', { message: 'Only admins can add bots' });
      return;
    }
    
    if (!isLobbyAdminOrGlobal(roomId, sessUserId)) {
      socket.emit('lobby:error', { message: 'Only lobby admin can add bots' });
      return;
    }
    lobbyManager.addBots(roomId, Math.min(count, 9), dataStore); // Max 9 bots
    const participants = lobbyManager.getParticipantsList(roomId);
    const lobby = lobbyManager.getLobby(roomId);
    if (lobby) {
      io.to(`lobby:${roomId}`).emit('lobby:participants', {
        participants,
        adminId: lobby.adminId,
      });
    }
  });

  socket.on('lobby:start', (data: { roomId?: string }) => {
    const activeRoomId = 'main-draft-room'; // Always use active room
    console.log(`[lobby:start] Starting draft for active room: ${activeRoomId}`);

    const lobby = lobbyManager.getLobby(activeRoomId);
    if (!lobby) {
      socket.emit('lobby:error', { message: 'Active lobby not found' });
      return;
    }

    // Get all participants and generate random snake order
    const participants = lobbyManager.getParticipantsList(activeRoomId);
    const participantIds = participants.map(p => p.userId);
    
    // Fisher-Yates shuffle for randomness
    const pickOrder = [...participantIds];
    for (let i = pickOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pickOrder[i], pickOrder[j]] = [pickOrder[j], pickOrder[i]];
    }
    console.log(`[lobby:start] Generated random pick order:`, pickOrder);

    const sessUserId = (socket.request as any)?.session?.userId as string | undefined;
    if (!isLobbyAdminOrGlobal(activeRoomId, sessUserId)) {
      socket.emit('lobby:error', { message: 'Only admin can start the draft' });
      return;
    }

    // Send each participant their position in the draft order
    participants.forEach((participant, index) => {
      const position = index + 1;
      const participantSocket = io.sockets.sockets.get(participant.socketId!);
      if (participantSocket) {
        participantSocket.emit('draft:yourPosition', { 
          position, 
          totalParticipants: participants.length,
          message: `Вы будете выбирать ${position}-м из ${participants.length}` 
        });
      }
    });

    // Announce that draft is starting soon with countdown
    const countdownSeconds = 10;
    io.to(`lobby:${activeRoomId}`).emit('draft:starting', { 
      countdown: countdownSeconds,
      pickOrder,
      message: 'Драфт начинается! Порядок выбора определён случайно.'
    });

    // Wait for countdown before starting
    setTimeout(() => {
      // Ensure teams exist for all participants (needed for picks/autopick)
      try {
        pickOrder.forEach((userId) => {
          if (!dataStore.getTeam(userId)) {
            const user = dataStore.getUser(userId);
            const teamName = user ? user.teamName : `Team ${userId}`;
            const logo = user ? user.logo : 'default-logo';
            dataStore.createTeam(userId, teamName, logo, 1);
          }
        });
      } catch (e) {
        console.warn('[lobby:start] Failed to ensure teams exist:', e);
      }

      // Create draft room
      const timerSec = 60;
      const room = draftManager.getOrCreate({
        roomId: activeRoomId,
        pickOrder,
        timerSec,
        snakeDraft: true,
      });
      
      // Save to persistence
      try {
        const repo = getDraftRepository();
        const roomRecord: DraftRoomRecord = {
          roomId: activeRoomId,
          timerSec,
          snakeDraft: true,
          createdAt: Date.now(),
          pickOrder,
        };
        repo.saveRoom(roomRecord);
      } catch (e) {
        // best-effort
      }

      room.start();
      const newState = room.getState();
      logger.draft.started(activeRoomId, pickOrder, timerSec);
      
      // Notify lobby participants that the draft has officially started
      io.to(`lobby:${activeRoomId}`).emit('lobby:start');

      // Emit initial state to the draft room
      io.to(activeRoomId).emit('draft:state', newState);

      // The global timerManager will pick up the new active turn
      // Check if first turn is a bot
      if (newState.activeUserId?.startsWith('bot-')) {
        setTimeout(() => {
          makeBotPick(activeRoomId, newState.activeUserId!);
        }, 2000);
      }

      // Finally, clear the lobby
      lobbyManager.clearLobby(activeRoomId);
    }, countdownSeconds * 1000);
    
    // Clear lobby
    lobbyManager.clearLobby(activeRoomId);
  });

  // Kick participant (admin only)
  socket.on('lobby:kick', (data: { roomId: string; userId: string }) => {
    try {
      const { roomId, userId } = data;
      const sessUserId = (socket.request as any)?.session?.userId as string | undefined;
      if (!isLobbyAdminOrGlobal(roomId, sessUserId)) {
        socket.emit('lobby:error', { message: 'Only admin can kick participants' });
        return;
      }
      const lobby = lobbyManager.getLobby(roomId);
      if (!lobby) {
        socket.emit('lobby:error', { message: 'Lobby not found' });
        return;
      }
      const target = lobby.participants.get(userId);
      lobbyManager.removeParticipant(roomId, userId);
      // Notify all about new participants list
      const participants = lobbyManager.getParticipantsList(roomId);
      io.to(`lobby:${roomId}`).emit('lobby:participants', {
        participants,
        adminId: lobby.adminId,
      });
      // Notify kicked user if online
      if (target?.socketId) {
        io.to(target.socketId).emit('lobby:kicked', { roomId });
      }
    } catch (err: any) {
      socket.emit('lobby:error', { message: err?.message || 'lobby:kick failed' });
    }
  });

  // ============================================================================
  // Bot autopick helper
  // ============================================================================

  function makeBotPick(roomId: string, botUserId: string) {
    const room = draftManager.get(roomId);
    if (!room) return;

    const state = room.getState();
    if (state.activeUserId !== botUserId) return; // Not bot's turn anymore

    try {
      const players = dataStore.getPlayersMap();
      const teams = dataStore.getTeamsMap();
      console.log('[makeBotPick] Attempting autopick for bot:', botUserId);
      const newState = room.makeAutoPick(botUserId, players, teams);
      
      logger.draft.pick(roomId, botUserId, newState.picks[newState.picks.length - 1].playerId, true);
      io.to(roomId).emit('draft:state', newState);
      
      const lastPick = newState.picks[newState.picks.length - 1];
      io.to(roomId).emit('draft:autopick', {
        roomId,
        pickIndex: newState.pickIndex - 1,
        pick: lastPick,
      });

      // Check if draft is now completed
      if (newState.completed) {
        console.log('[makeBotPick] Draft completed! Emitting draft:completed');
        io.to(roomId).emit('draft:completed', { roomId, finalState: newState });
        return; // Don't schedule next bot if draft is done
      }

      // If next active user is also a bot, schedule quick pick (5 seconds)
      if (newState.activeUserId && newState.activeUserId.startsWith('bot-')) {
        console.log('[makeBotPick] Next turn is also a bot, scheduling quick pick:', newState.activeUserId);
        setTimeout(() => makeBotPick(roomId, newState.activeUserId!), 5000);
      }

      // Persist pick
      try {
        const repo = getDraftRepository();
        const rec: DraftPickRecord = {
          roomId,
          pickIndex: lastPick.pickIndex,
          round: lastPick.round,
          slot: lastPick.slot,
          userId: lastPick.userId,
          playerId: lastPick.playerId,
          autopick: true,
          createdAt: Date.now(),
        };
        repo.savePick(rec);
      } catch (e) {
        // best-effort
      }

      // Check if next turn is also a bot
      if (newState.activeUserId?.startsWith('bot-')) {
        setTimeout(() => {
          makeBotPick(roomId, newState.activeUserId!);
        }, 2000);
      }
    } catch (err: any) {
      logger.autopick.failed(roomId, botUserId, err.message);
    }
  }

  // ============================================================================
  // Bot quick pick handler (triggered from client after 5 seconds)
  // ============================================================================

  socket.on('bot:quickpick', (data: { roomId: string; userId: string }) => {
    console.log('[Socket bot:quickpick] Received:', data);
    const { roomId, userId } = data;
    
    // Verify it's actually a bot's turn
    if (userId && userId.startsWith('bot-')) {
      makeBotPick(roomId, userId);
    }
  });

  // ============================================================================
  // Draft events
  // ============================================================================

  socket.on('disconnect', () => {
    // Handle lobby disconnect
    if (userSocketMap.has(socket.id)) {
      const { userId, roomId } = userSocketMap.get(socket.id)!;
      lobbyManager.removeParticipant(roomId, userId);
      userSocketMap.delete(socket.id);
      
      const lobby = lobbyManager.getLobby(roomId);
      if (lobby) {
        const participants = lobbyManager.getParticipantsList(roomId);
        io.to(`lobby:${roomId}`).emit('lobby:participants', {
          participants,
          adminId: lobby.adminId,
        });
      }
    }

    // Cleanup presence memberships
    const memberships = socketMemberships.get(socket.id) ?? [];
    memberships.forEach(({ roomId, userId }) => {
      if (userId) {
        const set = roomPresence.get(roomId);
        if (set) {
          set.delete(userId);
          if (!set.size) roomPresence.delete(roomId);
          else broadcastPresence(roomId);
        }

        // If disconnecting user is the active picker, pause and start grace timer
        const room = draftManager.get(roomId);
        if (room) {
          const state = room.getState();
          if (state.activeUserId === userId && !state.paused && !reconnectTimers.has(roomId)) {
            room.pause();
            io.to(roomId).emit('draft:reconnect_wait', { roomId, userId, graceMs: getGraceMs() });
            const timeout = setTimeout(() => {
              reconnectTimers.delete(roomId);
              try {
                // Resume draft if still paused before autopick
                try { room.resume(); } catch {}
                const players = dataStore.getPlayersMap();
                const teams = dataStore.getTeamsMap();
                const newState = room.makeAutoPick(userId, players, teams);
                io.to(roomId).emit('draft:state', newState);
                const last = newState.picks[newState.picks.length - 1];
                io.to(roomId).emit('draft:autopick', { roomId, pickIndex: newState.pickIndex - 1, pick: last });
                // Persist autopick (best-effort)
                try {
                  const repo = getDraftRepository();
                  const rec: DraftPickRecord = {
                    roomId,
                    pickIndex: last.pickIndex,
                    round: last.round,
                    slot: last.slot,
                    userId: last.userId,
                    playerId: last.playerId,
                    autopick: true,
                    createdAt: Date.now(),
                  };
                  repo.savePick(rec);
                } catch {}
              } catch (err: any) {
                console.error('[reconnect-grace] Autopick failed:', err?.message || err);
                io.to(roomId).emit('draft:error', { message: `Autopick failed after reconnect grace: ${err?.message || err}` });
              }
            }, getGraceMs());
            reconnectTimers.set(roomId, { userId, timeout });
          }
        }
      }
    });
    socketMemberships.delete(socket.id);
  });
});

export function startServer(port = PORT): Promise<number> {
  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      const address = httpServer.address();
      const actualPort = typeof address === 'object' && address ? (address as any).port : port;
      // eslint-disable-next-line no-console
      console.log(`[server] Listening on http://localhost:${actualPort}`);
      // Best-effort restore from persistence before starting timers
      restoreFromRepository();
      timerManager.start();
      resolve(actualPort);
    });
  });
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    // Останавливаем таймер
    timerManager.stop();
    
    // Если сервер не слушает, сразу резолвим
    if (!httpServer.listening) {
      return resolve();
    }
    
    io.close(() => {
      httpServer.close((err?: Error) => {
        // Игнорируем ERR_SERVER_NOT_RUNNING
        if (err && (err as any).code === 'ERR_SERVER_NOT_RUNNING') {
          return resolve();
        }
        if (err) {
          console.error('[stopServer] Error closing server:', err);
        }
        resolve();
      });
    });
  });
}

if (process.env.NODE_ENV !== 'test') {
  void startServer(PORT);
}

export { io, httpServer };
