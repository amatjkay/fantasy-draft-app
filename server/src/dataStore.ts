import { Player, Team, User } from './models';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

// In-memory хранилища
class DataStore {
  private players = new Map<string, Player>();
  private teams = new Map<string, Team>();
  private users = new Map<string, User>();

  // ============================================================================
  // Players
  // ============================================================================

  loadPlayersFromFile(filePath: string): void {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const playersArray: Player[] = JSON.parse(data);
      
      this.players.clear();
      playersArray.forEach(player => {
        this.players.set(player.id, player);
      });
      
      console.log(`[DataStore] Loaded ${this.players.size} players from ${filePath}`);
    } catch (err) {
      console.error('[DataStore] Failed to load players:', err);
    }
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  getAllPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  getAvailablePlayers(): Player[] {
    return Array.from(this.players.values()).filter(p => p.draftedBy === null);
  }

  getPlayersMap(): Map<string, Player> {
    return this.players;
  }

  // ============================================================================
  // Teams
  // ============================================================================

  createTeam(ownerId: string, name: string, logo: string, week: number = 1): Team {
    const team: Team = {
      teamId: randomUUID(),
      ownerId,
      name,
      logo,
      players: [],
      salaryTotal: 0,
      week,
      // Initialize explicit roster slots in fixed order: LW, C, RW, D, D, G
      slots: [
        { position: 'LW', playerId: null },
        { position: 'C', playerId: null },
        { position: 'RW', playerId: null },
        { position: 'D', playerId: null },
        { position: 'D', playerId: null },
        { position: 'G', playerId: null },
      ],
    };
    
    this.teams.set(ownerId, team);
    return team;
  }

  getTeam(ownerId: string): Team | undefined {
    return this.teams.get(ownerId);
  }

  getAllTeams(): Team[] {
    return Array.from(this.teams.values());
  }

  getTeamsMap(): Map<string, Team> {
    return this.teams;
  }

  // ============================================================================
  // Users
  // ============================================================================

  createUser(login: string, passwordHash: string, teamName: string, logo: string, role: 'user' | 'admin' = 'user'): User {
    const user: User = {
      id: randomUUID(),
      login,
      passwordHash,
      teamName,
      logo,
      role,
      createdAt: Date.now(),
    };
    
    this.users.set(user.id, user);
    return user;
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getUserByLogin(login: string): User | undefined {
    return Array.from(this.users.values()).find(u => u.login === login);
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  // ============================================================================
  // Reset (для тестов)
  // ============================================================================

  reset(): void {
    this.players.clear();
    this.teams.clear();
    this.users.clear();
  }

  resetDraft(): void {
    // Сбросить состояние драфта (draftedBy для всех игроков)
    this.players.forEach(player => {
      player.draftedBy = null;
      player.draftWeek = null;
    });

    // Сбросить команды
    this.teams.forEach(team => {
      team.players = [];
      team.salaryTotal = 0;
      if (team.slots && Array.isArray(team.slots)) {
        team.slots.forEach(s => { s.playerId = null; });
      }
    });
  }
}

// Singleton instance
export const dataStore = new DataStore();

// Загрузить игроков при старте (если файл существует)
const playersPath = path.join(__dirname, '../data/players.json');
if (fs.existsSync(playersPath)) {
  dataStore.loadPlayersFromFile(playersPath);
}
