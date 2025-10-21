import { describe, it, expect, beforeEach } from 'vitest';
import { DraftRoom, DraftConfig } from '../draft';
import { Player, Team, SALARY_CAP } from '../models';
import { randomUUID } from 'crypto';

describe('DraftRoom', () => {
  let config: DraftConfig;
  let players: Map<string, Player>;
  let teams: Map<string, Team>;

  beforeEach(() => {
    config = {
      roomId: 'test-room',
      pickOrder: ['user1', 'user2', 'user3'],
      timerSec: 60,
      snakeDraft: true,
    };

    // Создать mock-игроков с разными зарплатами
    players = new Map();
    players.set('p1', {
      id: 'p1',
      firstName: 'Connor',
      lastName: 'McDavid',
      position: 'C',
      capHit: 12_500_000,
      team: 'EDM',
      stats: { games: 76, goals: 64, assists: 89, points: 153 },
      draftedBy: null,
      draftWeek: null,
    });
    players.set('p2', {
      id: 'p2',
      firstName: 'Auston',
      lastName: 'Matthews',
      position: 'C',
      capHit: 11_640_250,
      team: 'TOR',
      stats: { games: 74, goals: 69, assists: 38, points: 107 },
      draftedBy: null,
      draftWeek: null,
    });
    players.set('p3', {
      id: 'p3',
      firstName: 'Nathan',
      lastName: 'MacKinnon',
      position: 'C',
      capHit: 12_600_000,
      team: 'COL',
      stats: { games: 82, goals: 51, assists: 89, points: 140 },
      draftedBy: null,
      draftWeek: null,
    });
    players.set('p4', {
      id: 'p4',
      firstName: 'Nikita',
      lastName: 'Kucherov',
      position: 'RW',
      capHit: 9_500_000,
      team: 'TBL',
      stats: { games: 81, goals: 44, assists: 100, points: 144 },
      draftedBy: null,
      draftWeek: null,
    });
    players.set('p5', {
      id: 'p5',
      firstName: 'David',
      lastName: 'Pastrnak',
      position: 'RW',
      capHit: 11_250_000,
      team: 'BOS',
      stats: { games: 82, goals: 47, assists: 63, points: 110 },
      draftedBy: null,
      draftWeek: null,
    });
    players.set('p6', {
      id: 'p6',
      firstName: 'Artemi',
      lastName: 'Panarin',
      position: 'LW',
      capHit: 11_642_857,
      team: 'NYR',
      stats: { games: 82, goals: 49, assists: 71, points: 120 },
      draftedBy: null,
      draftWeek: null,
    });
    players.set('p-expensive', {
      id: 'p-expensive',
      firstName: 'Expensive',
      lastName: 'Player',
      position: 'C',
      capHit: SALARY_CAP - 1_000_000, // Почти весь cap
      team: 'TST',
      stats: { games: 82, goals: 50, assists: 50, points: 100 },
      draftedBy: null,
      draftWeek: null,
    });

    // Создать mock-команды
    teams = new Map();
    teams.set('user1', {
      teamId: randomUUID(),
      ownerId: 'user1',
      name: 'Team 1',
      logo: 'logo1',
      players: [],
      salaryTotal: 0,
      week: 1,
    });
    teams.set('user2', {
      teamId: randomUUID(),
      ownerId: 'user2',
      name: 'Team 2',
      logo: 'logo2',
      players: [],
      salaryTotal: 0,
      week: 1,
    });
    teams.set('user3', {
      teamId: randomUUID(),
      ownerId: 'user3',
      name: 'Team 3',
      logo: 'logo3',
      players: [],
      salaryTotal: 0,
      week: 1,
    });
  });

  it('initializes with correct default state', () => {
    const room = new DraftRoom(config);
    const state = room.getState();

    expect(state.started).toBe(false);
    expect(state.paused).toBe(false);
    expect(state.pickIndex).toBe(0);
    expect(state.round).toBe(1);
    expect(state.snakeDraft).toBe(true);
  });

  it('starts draft and sets active user', () => {
    const room = new DraftRoom(config);
    room.start();
    const state = room.getState();

    expect(state.started).toBe(true);
    expect(state.activeUserId).toBe('user1'); // первый в раунде 1
    expect(state.round).toBe(1);
    expect(state.timerStartedAt).toBeDefined();
  });

  it('snake draft: reverses order in even rounds', () => {
    const room = new DraftRoom(config);
    room.start();

    // Раунд 1: user1, user2, user3 (прямой порядок)
    let state = room.getState();
    expect(state.round).toBe(1);
    expect(state.activeUserId).toBe('user1');

    room.makePick('user1', 'p1', players, teams);
    state = room.getState();
    expect(state.activeUserId).toBe('user2');

    room.makePick('user2', 'p2', players, teams);
    state = room.getState();
    expect(state.activeUserId).toBe('user3');

    room.makePick('user3', 'p3', players, teams);
    state = room.getState();

    // Раунд 2: user3, user2, user1 (реверс)
    expect(state.round).toBe(2);
    expect(state.activeUserId).toBe('user3'); // реверс!

    room.makePick('user3', 'p4', players, teams);
    state = room.getState();
    expect(state.activeUserId).toBe('user2');

    room.makePick('user2', 'p5', players, teams);
    state = room.getState();
    expect(state.activeUserId).toBe('user1');
  });

  it('prevents picking the same player twice', () => {
    const room = new DraftRoom(config);
    room.start();

    room.makePick('user1', 'p1', players, teams);
    expect(() => room.makePick('user2', 'p1', players, teams)).toThrow('Player already picked!');
  });

  it('prevents picking out of turn', () => {
    const room = new DraftRoom(config);
    room.start();

    expect(() => room.makePick('user2', 'p1', players, teams)).toThrow('Not your turn!');
  });

  it('pause and resume maintains timer state', async () => {
    const room = new DraftRoom(config);
    room.start();

    const state1 = room.getState();
    expect(state1.timerRemainingMs).toBeDefined();
    const remaining1 = state1.timerRemainingMs!;

    // Ждём немного
    await new Promise((resolve) => setTimeout(resolve, 100));

    const state2 = room.getState();
    const remaining2 = state2.timerRemainingMs!;
    expect(remaining2).toBeLessThan(remaining1);

    // Пауза
    room.pause();
    const state3 = room.getState();
    expect(state3.paused).toBe(true);
    expect(state3.timerRemainingMs).toBeDefined();
    const pausedRemaining = state3.timerRemainingMs!;

    // Ждём (время не должно уменьшаться на паузе)
    await new Promise((resolve) => setTimeout(resolve, 100));

    const state4 = room.getState();
    expect(state4.timerRemainingMs).toBeCloseTo(pausedRemaining, -2);

    // Резюм
    room.resume();
    const state5 = room.getState();
    expect(state5.paused).toBe(false);
    expect(state5.timerRemainingMs).toBeDefined();
  });

  it('detects timer expiration', async () => {
    const shortConfig: DraftConfig = {
      roomId: 'test',
      pickOrder: ['user1'],
      timerSec: 0.1, // 100ms
      snakeDraft: false,
    };
    const room = new DraftRoom(shortConfig);
    room.start();

    expect(room.isTimerExpired()).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(room.isTimerExpired()).toBe(true);
  });

  it('auto-pick works when timer expires', () => {
    const room = new DraftRoom(config);
    room.start();

    const state1 = room.getState();
    expect(state1.picks.length).toBe(0);

    // makeAutoPick now requires userId as first parameter
    const state2 = room.makeAutoPick('user1', players, teams);
    expect(state2.picks.length).toBe(1);
    expect(state2.picks[0].playerId).toBe('p1'); // топ по очкам
    expect(state2.picks[0].userId).toBe('user1');
    expect(state2.pickIndex).toBe(1);

    // Проверить обновление команды
    const team = teams.get('user1')!;
    expect(team.players).toContain('p1');
    expect(team.salaryTotal).toBe(players.get('p1')!.capHit);
  });

  it('auto-pick avoids filled position slot (C) and picks next best by points', () => {
    const singleConfig: DraftConfig = { roomId: 'single', pickOrder: ['user1'], timerSec: 60, snakeDraft: true };
    const room = new DraftRoom(singleConfig);
    room.start();

    // user1 manually picks p1 (C), filling the only C slot
    room.makePick('user1', 'p1', players, teams);

    // Autopick should skip C (p2/p3) and pick p4 (RW) with 144 pts
    const state2 = room.makeAutoPick('user1', players, teams);
    expect(state2.picks.length).toBe(2);
    expect(state2.picks[1].playerId).toBe('p4');
    expect(state2.picks[1].userId).toBe('user1');
  });

  it('makes a pick and updates state', () => {
    const room = new DraftRoom(config);
    room.start();

    const state1 = room.makePick('user1', 'p1', players, teams);
    expect(state1.pickIndex).toBe(1);
    expect(state1.picks.length).toBe(1);
    expect(state1.picks[0].userId).toBe('user1');
    expect(state1.picks[0].playerId).toBe('p1');

    // Проверить обновление игрока и команды
    const player = players.get('p1')!;
    expect(player.draftedBy).toBe('user1');

    const team = teams.get('user1')!;
    expect(team.players).toContain('p1');
    expect(team.salaryTotal).toBe(player.capHit);
  });

  it('throws error when trying to exceed salary cap', () => {
    const room = new DraftRoom({ ...config, pickOrder: ['user1'] });
    room.start();

    // user1 берет дорогого игрока
    room.makePick('user1', 'p-expensive', players, teams);
    const team1 = teams.get('user1')!;
    expect(team1.salaryTotal).toBe(SALARY_CAP - 1_000_000);

    // Попытка взять ещё p1 (12.5M) превысит cap (осталось только 1M)
    expect(() => room.makePick('user1', 'p1', players, teams)).toThrow('Salary cap exceeded!');
  });
});
