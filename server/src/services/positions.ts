import fs from 'fs';
import path from 'path';
import { Player, Position, POSITIONS } from '../models';

export interface PositionsProvider {
  getEligiblePositions(player: Player): Promise<Position[]>;
}

export class NhlPrimaryOnlyProvider implements PositionsProvider {
  async getEligiblePositions(player: Player): Promise<Position[]> {
    return [player.position];
  }
}

export type OverridesMap = Record<string, Position[]>; // key: player.id => [positions]

export class StaticOverridesProvider implements PositionsProvider {
  private overrides: OverridesMap = {};

  constructor(overrides: OverridesMap) {
    this.overrides = overrides;
  }

  static loadFromFile(filePath: string): StaticOverridesProvider | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as OverridesMap;
      // validate values are in POSITIONS
      const valid = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, (v || []).filter((p): p is Position => (POSITIONS as unknown as string[]).includes(p as any))])
      );
      return new StaticOverridesProvider(valid);
    } catch (e) {
      console.warn('[positions] Failed to load overrides:', e);
      return null;
    }
  }

  async getEligiblePositions(player: Player): Promise<Position[]> {
    const from = this.overrides[player.id];
    if (Array.isArray(from) && from.length) return from;
    return [player.position];
  }
}

export class CombinedPositionsProvider implements PositionsProvider {
  private providers: PositionsProvider[];
  constructor(...providers: PositionsProvider[]) {
    this.providers = providers;
  }
  async getEligiblePositions(player: Player): Promise<Position[]> {
    const sets: Position[][] = [];
    for (const p of this.providers) {
      try { sets.push(await p.getEligiblePositions(player)); } catch {}
    }
    const merged = Array.from(new Set(sets.flat()));
    return merged.length ? merged : [player.position];
  }
}

export function loadDefaultPositionsProvider(): PositionsProvider {
  const primary = new NhlPrimaryOnlyProvider();
  const overridesPath = path.join(__dirname, '..', 'data', 'eligible-positions.json');
  const overrides = StaticOverridesProvider.loadFromFile(overridesPath);
  if (overrides) return new CombinedPositionsProvider(primary, overrides);
  return primary;
}
