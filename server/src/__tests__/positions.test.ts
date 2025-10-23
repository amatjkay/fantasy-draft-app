import { describe, it, expect, beforeEach } from 'vitest';
import { DraftRoom, DraftConfig } from '../draft';
import { Player, Team, MAX_PLAYERS_PER_TEAM } from '../models';
import { randomUUID } from 'crypto';

describe('Multi-position eligibility', () => {
  let config: DraftConfig;
  let players: Map<string, Player>;
  let teams: Map<string, Team>;

  beforeEach(() => {
    config = {
      roomId: 'room-multi',
      pickOrder: ['u1', 'u2'],
      timerSec: 30,
      snakeDraft: true,
    };

    players = new Map<string, Player>();

    // Existing C player already on u1 team to fill the C slot
    const pCused: Player = {
      id: 'pCused', firstName: 'Used', lastName: 'Center', position: 'C', capHit: 1_000_000, team: 'TST',
      stats: { games: 1, goals: 0, assists: 0, points: 0 }, draftedBy: null, draftWeek: null,
    };

    const pC_LW: Player = {
      id: 'pC_LW', firstName: 'Dual', lastName: 'Forward', position: 'C', capHit: 2_000_000, team: 'TST',
      stats: { games: 82, goals: 20, assists: 30, points: 50 }, draftedBy: null, draftWeek: null,
    } as Player;
    pC_LW.eligiblePositions = ['C', 'LW'];

    const pRWonly: Player = {
      id: 'pRW', firstName: 'Right', lastName: 'Wing', position: 'RW', capHit: 2_500_000, team: 'TST',
      stats: { games: 82, goals: 25, assists: 25, points: 50 }, draftedBy: null, draftWeek: null,
    };

    players.set(pCused.id, pCused);
    players.set(pC_LW.id, pC_LW);
    players.set(pRWonly.id, pRWonly);

    teams = new Map<string, Team>();
    teams.set('u1', {
      teamId: randomUUID(), ownerId: 'u1', name: 'U1', logo: 'l',
      players: [pCused.id], salaryTotal: pCused.capHit, week: 1,
      // slots optional in tests; logic falls back to counts
    } as Team);
    teams.set('u2', {
      teamId: randomUUID(), ownerId: 'u2', name: 'U2', logo: 'l', players: [], salaryTotal: 0, week: 1,
    } as Team);
  });

  it('allows pick into any eligible position when primary slot is full', () => {
    const room = new DraftRoom(config);
    room.start();

    // u1 is first
    const state1 = room.getState();
    expect(state1.activeUserId).toBe('u1');

    // Try to pick pC_LW where C is already filled; should assign as LW (counts fallback)
    const newState = room.makePick('u1', 'pC_LW', players, teams);
    expect(newState.pickIndex).toBe(1);
    const team = teams.get('u1')!;
    expect(team.players).toContain('pC_LW');
    expect(team.players.length).toBe(2);
  });

  it('autopick chooses only players that fit some eligible slot', () => {
    const room = new DraftRoom(config);
    room.start();

    // Fill LW for u1 to block both C and LW
    const pLWblock: Player = {
      id: 'pLWblock', firstName: 'Block', lastName: 'LW', position: 'LW', capHit: 1_000_000, team: 'TST',
      stats: { games: 82, goals: 1, assists: 1, points: 2 }, draftedBy: 'u1', draftWeek: 1,
    };
    players.set(pLWblock.id, pLWblock);
    const team = teams.get('u1')!;
    team.players.push(pLWblock.id);

    // Now C and LW are at limit (1 each). pC_LW does not fit; pRW fits and should be selected.
    const newState = room.makeAutoPick('u1', players, teams);
    const last = newState.picks[newState.picks.length - 1];
    expect(last.userId).toBe('u1');
    expect(last.playerId).toBe('pRW');
  });
});
