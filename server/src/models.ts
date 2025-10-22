import { z } from 'zod';

// ============================================================================
// Constants
// ============================================================================

export const SALARY_CAP = 95_500_000; // $95.5M
export const MAX_PLAYERS_PER_TEAM = 6;

export const POSITIONS = ['C', 'LW', 'RW', 'D', 'G'] as const;
export type Position = typeof POSITIONS[number];

// Ролевой состав ростера: ровно 6 слотов: LW, C, RW, D, D, G
export const ROSTER_SLOTS: Record<Position, number> = {
  C: 1,
  LW: 1,
  RW: 1,
  D: 2,
  G: 1,
};

// ============================================================================
// User
// ============================================================================

export const UserSchema = z.object({
  id: z.string().uuid(),
  login: z.string().min(3).max(20),
  passwordHash: z.string(),
  teamName: z.string().min(3).max(50),
  logo: z.string(),
  role: z.enum(['user', 'admin']).default('user'),
  createdAt: z.number(),
});

export type User = z.infer<typeof UserSchema>;

export interface CreateUserInput {
  login: string;
  password: string;
  teamName: string;
  logo: string;
}

// ============================================================================
// Player
// ============================================================================

export const PlayerStatsSchema = z.object({
  games: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  points: z.number().int().nonnegative(),
});

export type PlayerStats = z.infer<typeof PlayerStatsSchema>;

export const PlayerSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  position: z.enum(POSITIONS),
  // Optional multi-position support: eligible positions including primary
  eligiblePositions: z.array(z.enum(POSITIONS)).optional(),
  capHit: z.number().int().positive(),
  team: z.string(),
  stats: PlayerStatsSchema,
  draftedBy: z.string().uuid().nullable(),
  draftWeek: z.number().int().positive().nullable(),
});

export type Player = z.infer<typeof PlayerSchema>;

// ============================================================================
// Team
// ============================================================================

// Roster slots: fixed layout LW, C, RW, D, D, G
export const RosterSlotSchema = z.object({
  position: z.enum(POSITIONS),
  playerId: z.string().nullable().default(null),
});

export type RosterSlot = z.infer<typeof RosterSlotSchema>;

export const TeamSchema = z.object({
  teamId: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string(),
  logo: z.string(),
  players: z.array(z.string()).max(MAX_PLAYERS_PER_TEAM),
  salaryTotal: z.number().int().nonnegative().max(SALARY_CAP),
  week: z.number().int().positive(),
  // New: explicit roster slots with assignments
  slots: z.array(RosterSlotSchema).length(MAX_PLAYERS_PER_TEAM).optional(),
});

export type Team = z.infer<typeof TeamSchema>;

// ============================================================================
// DraftPick
// ============================================================================

export const DraftPickSchema = z.object({
  pickIndex: z.number().int().nonnegative(),
  round: z.number().int().positive(),
  slot: z.number().int().nonnegative(),
  userId: z.string().uuid(),
  playerId: z.string(),
  timestamp: z.number(),
});

export type DraftPick = z.infer<typeof DraftPickSchema>;

// ============================================================================
// DraftState
// ============================================================================

export const DraftStateSchema = z.object({
  week: z.number().int().positive(),
  isActive: z.boolean(),
  startTime: z.string(),
  pickOrder: z.array(z.string().uuid()),
  currentPick: z.number().int().nonnegative(),
  timerSec: z.number().int().positive(),
  timerStartedAt: z.number().optional(),
  timerRemainingMs: z.number().optional(),
  paused: z.boolean(),
  history: z.array(DraftPickSchema),
  snakeDraft: z.boolean(),
});

export type DraftState = z.infer<typeof DraftStateSchema>;

// ============================================================================
// Leaderboard
// ============================================================================

export interface PlayerSummary {
  playerId: string;
  name: string;
  position: Position;
  capHit: number;
}

export interface LeaderboardEntry {
  teamId: string;
  owner: string;
  teamName: string;
  logo: string;
  salaryTotal: number;
  players: PlayerSummary[];
}

// ============================================================================
// Helper functions
// ============================================================================

export function getPlayerFullName(player: Player): string {
  return `${player.firstName} ${player.lastName}`;
}

export function formatSalary(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

export function getRemainingCap(team: Team): number {
  return SALARY_CAP - team.salaryTotal;
}

export function canAffordPlayer(team: Team, player: Player): boolean {
  return team.salaryTotal + player.capHit <= SALARY_CAP;
}

export function isTeamFull(team: Team): boolean {
  return team.players.length >= MAX_PLAYERS_PER_TEAM;
}

// Подсчёт занятых позиций в команде по игрокам
export function getTeamPositionCounts(team: Team, playersMap: Map<string, Player>): Record<Position, number> {
  const counts: Record<Position, number> = { C: 0, LW: 0, RW: 0, D: 0, G: 0 };
  // Prefer explicit slots if available
  if (team.slots && Array.isArray(team.slots)) {
    for (const s of team.slots) {
      if (s.playerId) counts[s.position] = (counts[s.position] ?? 0) + 1;
    }
    return counts;
  }
  // Fallback by deriving from players
  for (const pid of team.players) {
    const p = playersMap.get(pid);
    if (p) {
      counts[p.position] = (counts[p.position] ?? 0) + 1;
    }
  }
  return counts;
}

// Проверка наличия свободного слота позиции для игрока
export function hasPositionSlotAvailable(team: Team, playersMap: Map<string, Player>, position: Position): boolean {
  // If slots exist, check unfilled slot for that position
  if (team.slots && Array.isArray(team.slots)) {
    return team.slots.some(s => s.position === position && !s.playerId);
  }
  // Fallback to counts
  const counts = getTeamPositionCounts(team, playersMap);
  const limit = ROSTER_SLOTS[position] ?? 0;
  return counts[position] < limit;
}

// =========================================================================
// Multi-position helpers
// =========================================================================

export function getEligiblePositions(player: Player): Position[] {
  const list = (player as any).eligiblePositions as Position[] | undefined;
  if (Array.isArray(list) && list.length) return list;
  return [player.position];
}

export function findFirstAvailableSlot(team: Team, positions: Position[]): Position | undefined {
  if (Array.isArray(team.slots)) {
    for (const pos of positions) {
      if (team.slots.some(s => s.position === pos && !s.playerId)) return pos;
    }
  }
  return undefined;
}

export function assignPlayerToSlot(team: Team, position: Position, playerId: string): void {
  if (!Array.isArray(team.slots)) return; // legacy team without explicit slots
  const slot = team.slots.find(s => s.position === position && !s.playerId);
  if (!slot) throw new Error(`No empty slot for position ${position}`);
  slot.playerId = playerId;
}

export function findAssignablePosition(team: Team, playersMap: Map<string, Player>, player: Player): Position | undefined {
  const eligible = getEligiblePositions(player);
  // Prefer explicit slots if present
  const slotPos = findFirstAvailableSlot(team, eligible);
  if (slotPos) return slotPos;
  // Fallback: counts-based check when slots are not defined
  const counts = getTeamPositionCounts(team, playersMap);
  for (const pos of eligible) {
    const limit = ROSTER_SLOTS[pos] ?? 0;
    if (counts[pos] < limit) return pos;
  }
  return undefined;
}
