import { DraftRepository } from './repository';
import { DraftPickRecord, DraftRoomRecord } from './types';
import { logger } from '../utils/logger';
import { DB_FILE } from '../config';
import * as fs from 'fs';
import * as path from 'path';

export class SqliteDraftRepository implements DraftRepository {
  private db!: any;

  init(): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3');
    // Ensure directory exists
    const dir = path.dirname(DB_FILE);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(DB_FILE);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS draft_rooms (
        room_id TEXT PRIMARY KEY,
        timer_sec INTEGER NOT NULL,
        snake_draft INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        pick_order TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS draft_picks (
        room_id TEXT NOT NULL,
        pick_index INTEGER NOT NULL,
        round INTEGER NOT NULL,
        slot INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        autopick INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (room_id, pick_index)
      );
      CREATE INDEX IF NOT EXISTS idx_draft_picks_room ON draft_picks(room_id);
    `);
  }

  saveRoom(room: DraftRoomRecord): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO draft_rooms (room_id, timer_sec, snake_draft, created_at, pick_order)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(room.roomId, room.timerSec, room.snakeDraft ? 1 : 0, room.createdAt, JSON.stringify(room.pickOrder));
      logger.persistence.saved('room', room.roomId);
    } catch (error) {
      logger.persistence.error('saveRoom', error instanceof Error ? error : new Error(String(error)));
    }
  }

  savePick(pick: DraftPickRecord): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO draft_picks (room_id, pick_index, round, slot, user_id, player_id, autopick, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(pick.roomId, pick.pickIndex, pick.round, pick.slot, pick.userId, pick.playerId, pick.autopick ? 1 : 0, pick.createdAt);
      logger.persistence.saved('pick', `${pick.roomId}:${pick.pickIndex}`);
    } catch (error) {
      logger.persistence.error('savePick', error instanceof Error ? error : new Error(String(error)));
    }
  }

  getRoom(roomId: string): DraftRoomRecord | undefined {
    const row = this.db.prepare(`SELECT room_id, timer_sec, snake_draft, created_at, pick_order FROM draft_rooms WHERE room_id=?`).get(roomId) as any;
    if (!row) return undefined;
    return {
      roomId: row.room_id,
      timerSec: row.timer_sec,
      snakeDraft: !!row.snake_draft,
      createdAt: row.created_at,
      pickOrder: JSON.parse(row.pick_order || '[]'),
    };
  }

  listPicks(roomId: string): DraftPickRecord[] {
    const rows = this.db.prepare(`
      SELECT room_id, pick_index, round, slot, user_id, player_id, autopick, created_at
      FROM draft_picks WHERE room_id=? ORDER BY pick_index ASC
    `).all(roomId) as any[];
    return rows.map(r => ({
      roomId: r.room_id,
      pickIndex: r.pick_index,
      round: r.round,
      slot: r.slot,
      userId: r.user_id,
      playerId: r.player_id,
      autopick: !!r.autopick,
      createdAt: r.created_at,
    }));
  }

  listRooms(): DraftRoomRecord[] {
    const rows = this.db.prepare(`
      SELECT room_id, timer_sec, snake_draft, created_at, pick_order FROM draft_rooms
    `).all() as any[];
    return rows.map(r => ({
      roomId: r.room_id,
      timerSec: r.timer_sec,
      snakeDraft: !!r.snake_draft,
      createdAt: r.created_at,
      pickOrder: JSON.parse(r.pick_order || '[]'),
    }));
  }
}
