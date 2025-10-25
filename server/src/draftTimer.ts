import { Server as IOServer } from 'socket.io';
import { DraftRoomManager } from './draft';
import { dataStore } from './dataStore';
import { logger } from './utils/logger';
import { getDraftRepository } from './persistence/repository';
import type { DraftPickRecord } from './persistence/types';

export class DraftTimerManager {
  private intervalId?: NodeJS.Timeout;
  private io: IOServer;
  private draftManager: DraftRoomManager;
  private tickIntervalMs: number;

  constructor(io: IOServer, draftManager: DraftRoomManager, tickIntervalMs = 1000) {
    this.io = io;
    this.draftManager = draftManager;
    this.tickIntervalMs = tickIntervalMs;
  }

  start() {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.tick();
    }, this.tickIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private tick() {
    // Проходим по всем комнатам и проверяем таймеры
    const rooms = (this.draftManager as any).rooms as Map<string, any>;
    
    rooms.forEach((room, roomId) => {
      const state = room.getState();
      
      // Пропускаем неактивные/завершённые/приостановленные
      if (!state.started || state.paused) return;

      // Отправляем tick-событие с текущим состоянием таймера
      this.io.to(roomId).emit('draft:timer', {
        roomId,
        timerRemainingMs: state.timerRemainingMs,
        pickIndex: state.pickIndex,
        activeUserId: state.activeUserId,
      });
      logger.timer.tick(roomId, state.activeUserId || 'unknown', state.timerRemainingMs);

      // Проверяем истечение таймера
      if (room.isTimerExpired()) {
        const activeUserId = state.activeUserId;
        if (!activeUserId) {
          console.error('[DraftTimer] No active user for autopick, skipping turn.');
          room.nextTurn();
          return;
        }

        logger.timer.expired(roomId, activeUserId);
        console.log('[DraftTimer] Attempting autopick for user:', activeUserId);

        try {
          // --- SUCCESSFUL AUTOPICK --- 
          const players = dataStore.getPlayersMap();
          const teams = dataStore.getTeamsMap();
          const newState = room.makeAutoPick(activeUserId, players, teams);
          
          // Get the last pick from the updated state
          const lastPick = newState.picks[newState.picks.length - 1];
          const player = players.get(lastPick.playerId);
          
          // Emit events
          this.io.to(roomId).emit('draft:state', newState);
          this.io.to(roomId).emit('draft:autopick', {
            roomId,
            pickIndex: newState.pickIndex - 1,
            pick: lastPick,
          });
          
          // Log success
          logger.autopick.success(roomId, lastPick.userId, lastPick.playerId, player?.stats?.points || 0);
          
          // Save to persistence
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

        } catch (err: any) {
          // --- FAILED AUTOPICK --- 
          logger.autopick.failed(roomId, activeUserId, err.message);
          console.error(`[DraftTimerManager] Auto-pick failed for ${activeUserId} in room ${roomId}:`, err.message);
          
          // Emit error but DON'T advance turn - user must manually pick or wait for next timer cycle
          // Advancing turn here would skip the user's pick entirely
          const currentState = room.getState();
          this.io.to(roomId).emit('draft:state', currentState);
          this.io.to(roomId).emit('draft:error', { 
            message: `Автопик не удался для ${activeUserId}. Пожалуйста, выберите игрока вручную.`,
            code: 'AUTOPICK_FAILED'
          });
        }
      }
    });
  }
}
