import { Player, Team, DraftPick, SALARY_CAP, MAX_PLAYERS_PER_TEAM, canAffordPlayer, isTeamFull, hasPositionSlotAvailable, findAssignablePosition, assignPlayerToSlot } from './models';

export type DraftConfig = {
  roomId: string;
  pickOrder: string[]; // userIds в порядке хода
  timerSec: number; // длительность таймера на пик
  snakeDraft?: boolean; // если true, реверс в чётных раундах (по умолчанию true)
};

export type DraftState = {
  roomId: string;
  started: boolean;
  completed: boolean; // драфт завершён (все ростеры заполнены)
  pickOrder: string[];
  pickIndex: number; // 0-based
  round: number; // 1-based
  slot: number; // 0-based в текущем раунде
  timerSec: number;
  timerStartedAt?: number;
  timerRemainingMs?: number; // оставшееся время в мс (при паузе)
  paused: boolean;
  picks: DraftPick[];
  activeUserId?: string;
  snakeDraft: boolean;
};

export class DraftRoom {
  private config: DraftConfig;
  private picks: DraftPick[] = [];
  private started = false;
  private paused = false;
  private timerStartedAt?: number;
  private timerRemainingMs?: number; // для паузы
  private pickIndex = 0; // 0-based
  private pickedPlayerIds = new Set<string>(); // защита от повторов

  constructor(config: DraftConfig) {
    this.config = { snakeDraft: true, ...config };
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.paused = false;
    this.pickIndex = 0;
    this.timerStartedAt = Date.now();
    this.timerRemainingMs = undefined;
  }

  pause() {
    if (!this.started || this.paused) return;
    // Сохраняем оставшееся время
    if (this.timerStartedAt) {
      const elapsed = Date.now() - this.timerStartedAt;
      const remaining = this.config.timerSec * 1000 - elapsed;
      this.timerRemainingMs = Math.max(0, remaining);
    }
    this.paused = true;
    this.timerStartedAt = undefined;
  }

  resume() {
    if (!this.started || !this.paused) return;
    this.paused = false;
    // Восстанавливаем таймер с учётом оставшегося времени
    this.timerStartedAt = Date.now() - (this.config.timerSec * 1000 - (this.timerRemainingMs ?? this.config.timerSec * 1000));
    this.timerRemainingMs = undefined;
  }

  getState(): DraftState {
    const orderLen = this.config.pickOrder.length;
    const round = Math.floor(this.pickIndex / orderLen) + 1;
    const slot = this.pickIndex % orderLen;
    
    // Check if draft should end
    const maxRounds = MAX_PLAYERS_PER_TEAM;
    const isDraftComplete = round > maxRounds;
    
    // Snake draft: реверс в чётных раундах
    const isEvenRound = round % 2 === 0;
    const shouldReverse = this.config.snakeDraft && isEvenRound;
    const effectiveSlot = shouldReverse ? orderLen - 1 - slot : slot;
    
    let activeUserId: string | undefined = undefined;
    
    // Only set activeUserId if draft is not complete and not paused
    if (this.started && !this.paused && !isDraftComplete) {
      activeUserId = this.config.pickOrder[effectiveSlot];
      // Note: Skipping full teams would require teams parameter
      // This will be handled by checking team status when making picks
    }

    // Рассчитываем оставшееся время
    let timerRemainingMs: number | undefined;
    if (this.paused && this.timerRemainingMs !== undefined) {
      timerRemainingMs = this.timerRemainingMs;
    } else if (this.timerStartedAt && !this.paused) {
      const elapsed = Date.now() - this.timerStartedAt;
      timerRemainingMs = Math.max(0, this.config.timerSec * 1000 - elapsed);
    }

    return {
      roomId: this.config.roomId,
      started: this.started,
      completed: isDraftComplete, // ✅ ADDED!
      pickOrder: this.config.pickOrder,
      pickIndex: this.pickIndex,
      round,
      slot,
      timerSec: this.config.timerSec,
      timerStartedAt: this.timerStartedAt,
      timerRemainingMs,
      paused: this.paused,
      picks: [...this.picks],
      activeUserId,
      snakeDraft: this.config.snakeDraft ?? true,
    };
  }

  makePick(
    userId: string,
    playerId: string,
    players: Map<string, Player>,
    teams: Map<string, Team>,
    isAutoPick = false
  ): DraftState {
    if (!this.started) throw new Error('Draft not started');
    if (this.paused) throw new Error('Draft paused');

    // Проверка существования игрока
    const player = players.get(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    // Защита от повторного pick: проверяем до проверки очередности,
    // чтобы сообщение было стабильным независимо от очереди
    if (this.pickedPlayerIds.has(playerId) || player.draftedBy !== null) {
      throw new Error('Player already picked!');
    }

    const state = this.getState();
    if (state.activeUserId !== userId) {
      throw new Error('Not your turn!');
    }

    // Получить команду пользователя
    const team = teams.get(userId);
    if (!team) {
      throw new Error('Team not found');
    }

    // Проверка лимита игроков в команде
    if (isTeamFull(team)) {
      throw new Error(`Team is full (max ${MAX_PLAYERS_PER_TEAM} players)`);
    }

    // Предварительно вычислим ограничения
    const overCap = !canAffordPlayer(team, player);
    const assignPos = findAssignablePosition(team, players, player);
    const noSlot = !assignPos;

    // Проверка salary cap (имеет приоритет, если оба условия нарушены)
    if (overCap) {
      const remaining = SALARY_CAP - team.salaryTotal;
      throw new Error(
        `Salary cap exceeded! Remaining: $${remaining.toLocaleString()}, Player cost: $${player.capHit.toLocaleString()}`
      );
    }

    // Проверка наличия свободного слота позиции (с учётом мультипозиций)
    if (noSlot) {
      throw new Error(`No roster slot available for eligible positions`);
    }

    // Atomic update: обновляем player и team
    player.draftedBy = userId;
    player.draftWeek = 1; // TODO: получать из конфига
    
    // Assign into explicit roster slot and reflect in legacy array
    assignPlayerToSlot(team, assignPos!, playerId);
    team.players.push(playerId);
    team.salaryTotal += player.capHit;

    const pick: DraftPick = {
      pickIndex: this.pickIndex,
      round: state.round,
      slot: state.slot,
      userId,
      playerId,
      timestamp: Date.now(),
    };

    this.picks.push(pick);
    this.pickedPlayerIds.add(playerId);
    this.pickIndex += 1;
    this.timerStartedAt = Date.now();
    this.timerRemainingMs = undefined;
    return this.getState();
  }

  // Проверка истечения таймера (вызывается внешним таймером)
  isTimerExpired(): boolean {
    if (!this.started || this.paused || !this.timerStartedAt) return false;
    const elapsed = Date.now() - this.timerStartedAt;
    return elapsed >= this.config.timerSec * 1000;
  }

  // Автопик: выбрать топ-игрока по зарплате из доступных
  makeAutoPick(userId: string, players: Map<string, Player>, teams: Map<string, Team>): DraftState {
    console.log('[DraftRoom.makeAutoPick] Starting for userId:', userId);
    console.log('[DraftRoom.makeAutoPick] Available teams:', Array.from(teams.keys()));
    
    const team = teams.get(userId);
    if (!team) {
      console.error('[DraftRoom.makeAutoPick] Team not found!', {
        userId,
        availableTeams: Array.from(teams.keys()),
        teamsCount: teams.size,
      });
      throw new Error('Team not found for auto-pick');
    }
    
    console.log('[DraftRoom.makeAutoPick] Team found:', { userId, teamName: team.name });

    // Найти доступных игроков, которых можно позволить
    const availablePlayers = Array.from(players.values())
      .filter(p => p.draftedBy === null)
      .filter(p => canAffordPlayer(team, p))
      .filter(p => !!findAssignablePosition(team, players, p));

    if (availablePlayers.length === 0) {
      console.warn('[DraftRoom.makeAutoPick] No affordable slottable players found!');
      console.log('[DraftRoom.makeAutoPick] Team cap:', team.salaryTotal, '/', SALARY_CAP);
      console.log('[DraftRoom.makeAutoPick] Team roster:', team.players.map(pid => {
        const p = players.get(pid);
        return p ? `${p.position}` : 'unknown';
      }).join(', '));
      
      // Fallback: pick cheapest available player that fits ANY available slot
      const anyAvailable = Array.from(players.values())
        .filter(p => p.draftedBy === null)
        .filter(p => canAffordPlayer(team, p))
        .filter(p => !!findAssignablePosition(team, players, p)) // MUST check slots!
        .sort((a, b) => a.capHit - b.capHit); // cheapest first
      
      if (anyAvailable.length === 0) {
        console.error('[DraftRoom.makeAutoPick] NO players available (team full or over cap or no slots)!');
        console.error('[DraftRoom.makeAutoPick] Team size:', team.players.length, '/', MAX_PLAYERS_PER_TEAM);
        throw new Error('No affordable slottable players for auto-pick (team full or roster complete)');
      }
      
      const cheapest = anyAvailable[0];
      console.log('[DraftRoom.makeAutoPick] Fallback: picking cheapest with slot:', `${cheapest.firstName} ${cheapest.lastName}`, cheapest.position);
      return this.makePick(userId, cheapest.id, players, teams, true);
    }

    // Сортировка по убыванию очков (лучший по прошлому сезону)
    availablePlayers.sort((a, b) => (b?.stats?.points || 0) - (a?.stats?.points || 0));

    const selectedPlayer = availablePlayers[0];
    console.log('[DraftRoom.makeAutoPick] Selected player:', `${selectedPlayer.firstName} ${selectedPlayer.lastName}`, selectedPlayer.id);
    return this.makePick(userId, selectedPlayer.id, players, teams, true);
  }
}

export class DraftRoomManager {
  private rooms = new Map<string, DraftRoom>();

  getOrCreate(config: DraftConfig): DraftRoom {
    const existing = this.rooms.get(config.roomId);
    if (existing) return existing;
    const room = new DraftRoom(config);
    this.rooms.set(config.roomId, room);
    return room;
  }

  get(roomId: string): DraftRoom | undefined {
    return this.rooms.get(roomId);
  }

  getRooms(): Map<string, DraftRoom> {
    return this.rooms;
  }
}
