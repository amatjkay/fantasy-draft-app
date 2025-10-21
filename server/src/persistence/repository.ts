import { DraftPickRecord, DraftRoomRecord } from './types';
import { USE_SQLITE } from '../config';

export interface DraftRepository {
  init(): void;
  saveRoom(room: DraftRoomRecord): void;
  savePick(pick: DraftPickRecord): void;
  getRoom(roomId: string): DraftRoomRecord | undefined;
  listRooms(): DraftRoomRecord[];
  listPicks(roomId: string): DraftPickRecord[];
}

class MemoryDraftRepository implements DraftRepository {
  private rooms = new Map<string, DraftRoomRecord>();
  private picks = new Map<string, DraftPickRecord[]>();

  init(): void {
    // no-op for memory
  }

  saveRoom(room: DraftRoomRecord): void {
    this.rooms.set(room.roomId, { ...room });
  }

  savePick(pick: DraftPickRecord): void {
    const arr = this.picks.get(pick.roomId) ?? [];
    arr.push({ ...pick });
    this.picks.set(pick.roomId, arr);
  }

  getRoom(roomId: string): DraftRoomRecord | undefined {
    return this.rooms.get(roomId);
  }

  listRooms(): DraftRoomRecord[] {
    return Array.from(this.rooms.values());
  }

  listPicks(roomId: string): DraftPickRecord[] {
    return (this.picks.get(roomId) ?? []).slice();
  }
}

// Placeholder for future SQLite implementation
// We keep a single exported instance via factory, for now memory only.

let repoInstance: DraftRepository | null = null;

export function getDraftRepository(): DraftRepository {
  if (repoInstance) return repoInstance;
  let instance: DraftRepository;
  if (USE_SQLITE) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('./sqlite');
      if (mod?.SqliteDraftRepository) {
        instance = new mod.SqliteDraftRepository();
        instance.init();
        repoInstance = instance;
        return instance;
      }
    } catch (e) {
      // Fallback to memory if sqlite is not available
      // eslint-disable-next-line no-console
      console.warn('[persistence] SQLite not available, falling back to in-memory repository');
    }
  }
  instance = new MemoryDraftRepository();
  instance.init();
  repoInstance = instance;
  return instance;
}
