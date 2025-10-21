import { describe, it, expect, beforeEach } from 'vitest';
import { restoreDraftRooms } from '../persistence/restore';
import { DraftRepository } from '../persistence/repository';
import { DraftPickRecord, DraftRoomRecord } from '../persistence/types';
import { DraftRoomManager } from '../draft';
import { dataStore } from '../dataStore';
import path from 'path';

class FakeRepo implements DraftRepository {
  private rooms: DraftRoomRecord[] = [];
  private picks: DraftPickRecord[] = [];
  init(): void {}
  saveRoom(room: DraftRoomRecord): void { this.rooms = this.rooms.filter(r => r.roomId !== room.roomId).concat([room]); }
  savePick(pick: DraftPickRecord): void { this.picks.push(pick); }
  getRoom(roomId: string): DraftRoomRecord | undefined { return this.rooms.find(r => r.roomId === roomId); }
  listRooms(): DraftRoomRecord[] { return this.rooms.slice(); }
  listPicks(roomId: string): DraftPickRecord[] { return this.picks.filter(p => p.roomId === roomId).slice(); }
}

describe('Persistence restore', () => {
  beforeEach(() => {
    // reset in-memory store and load players for tests
    dataStore.reset();
    const playersPath = path.join(__dirname, '../../data/players.json');
    dataStore.loadPlayersFromFile(playersPath);
  });

  it('replays saved room and picks into manager', () => {
    const repo = new FakeRepo();
    const roomId = 'restore-room-1';
    const u1 = '11111111-1111-1111-1111-111111111111';
    const u2 = '22222222-2222-2222-2222-222222222222';
    const room: DraftRoomRecord = {
      roomId,
      timerSec: 30,
      snakeDraft: true,
      createdAt: Date.now(),
      pickOrder: [u1, u2],
    };
    repo.saveRoom(room);
    // two picks: u1 picks player-1, u2 picks player-2
    repo.savePick({ roomId, pickIndex: 0, round: 1, slot: 0, userId: u1, playerId: 'player-1', autopick: false, createdAt: Date.now() });
    repo.savePick({ roomId, pickIndex: 1, round: 1, slot: 1, userId: u2, playerId: 'player-2', autopick: true, createdAt: Date.now() });

    const manager = new DraftRoomManager();
    restoreDraftRooms(manager, repo, dataStore);

    const roomInstance = manager.get(roomId);
    expect(roomInstance).toBeDefined();
    const state = roomInstance!.getState();
    expect(state.picks.length).toBe(2);
    expect(state.pickIndex).toBe(2);
    expect(state.activeUserId).toBe(u2); // round 2 starts with u2 in snake draft
  });

  it('restores multi-round snake draft correctly', () => {
    const repo = new FakeRepo();
    const roomId = 'multi-round-room';
    const u1 = 'aa111111-1111-1111-1111-111111111111';
    const u2 = 'bb222222-2222-2222-2222-222222222222';
    const room: DraftRoomRecord = {
      roomId,
      timerSec: 30,
      snakeDraft: true,
      createdAt: Date.now(),
      pickOrder: [u1, u2],
    };
    repo.saveRoom(room);
    // Round 1: u1 (C) -> u2 (RW) - completes round 1
    repo.savePick({ roomId, pickIndex: 0, round: 1, slot: 0, userId: u1, playerId: 'player-1', autopick: false, createdAt: Date.now() });
    repo.savePick({ roomId, pickIndex: 1, round: 1, slot: 1, userId: u2, playerId: 'player-4', autopick: true, createdAt: Date.now() });

    const manager = new DraftRoomManager();
    restoreDraftRooms(manager, repo, dataStore);

    const roomInstance = manager.get(roomId);
    expect(roomInstance).toBeDefined();
    const state = roomInstance!.getState();
    expect(state.picks.length).toBe(2);
    expect(state.pickIndex).toBe(2);
    expect(state.round).toBe(2); // entering round 2
    expect(state.activeUserId).toBe(u2); // round 2 starts with u2 (snake)
  });
});
