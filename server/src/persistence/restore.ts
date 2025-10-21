import { DraftRoomManager } from '../draft';
import { dataStore as defaultDataStore } from '../dataStore';
import type { DraftRepository } from './repository';

// Rebuild rooms and replay picks from repository into the given manager and dataStore
export function restoreDraftRooms(
  manager: DraftRoomManager,
  repo: DraftRepository,
  dataStore: typeof defaultDataStore = defaultDataStore
): void {
  const rooms = repo.listRooms();
  const players = dataStore.getPlayersMap();
  const teams = dataStore.getTeamsMap();

  rooms.forEach((r) => {
    const room = manager.getOrCreate({
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
        } catch {
          // ignore replay errors (e.g., already applied)
        }
      });
  });
}
