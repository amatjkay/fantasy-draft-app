import { dataStore } from '../dataStore';
import { loadDefaultPositionsProvider } from './positions';
import { Player } from '../models';

export function runPositionsUpdateOnce(): number {
  const provider = loadDefaultPositionsProvider();
  const players = dataStore.getAllPlayers();
  let updated = 0;
  const tasks = players.map(async (pl: Player) => {
    try {
      const list = await provider.getEligiblePositions(pl);
      // Only update if changed
      const prev = (pl as any).eligiblePositions as string[] | undefined;
      const next = Array.from(new Set(list));
      const changed = !prev || prev.length !== next.length || prev.some((p, i) => next[i] !== p);
      if (changed) {
        (pl as any).eligiblePositions = next as any;
        updated += 1;
      }
    } catch {}
  });
  // Note: callers should await Promise.all if they need precise count
  void Promise.all(tasks);
  return updated;
}

let timer: NodeJS.Timeout | null = null;

export function startPositionsUpdater(intervalMs = 3 * 60 * 60 * 1000) {
  // immediate run
  runPositionsUpdateOnce();
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    try { runPositionsUpdateOnce(); } catch {}
  }, intervalMs);
}

export function stopPositionsUpdater() {
  if (timer) clearInterval(timer);
  timer = null;
}
