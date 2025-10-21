/**
 * Lobby Manager
 * Manages pre-draft lobby rooms with participant tracking and ready status
 */

export interface LobbyParticipant {
  userId: string;
  login: string;
  teamName: string;
  ready: boolean;
  socketId?: string;
}

export interface LobbyRoom {
  roomId: string;
  adminId: string; // creator of the room
  participants: Map<string, LobbyParticipant>;
  createdAt: number;
}

export class LobbyManager {
  private lobbies: Map<string, LobbyRoom> = new Map();

  createOrGetLobby(roomId: string, adminId: string): LobbyRoom {
    if (!this.lobbies.has(roomId)) {
      this.lobbies.set(roomId, {
        roomId,
        adminId,
        participants: new Map(),
        createdAt: Date.now(),
      });
    }
    return this.lobbies.get(roomId)!;
  }

  addParticipant(roomId: string, userId: string, login: string, teamName: string, socketId?: string): LobbyRoom {
    const lobby = this.lobbies.get(roomId);
    if (!lobby) {
      throw new Error('Lobby not found');
    }

    // Update existing participant or add new one (prevents duplicates)
    const existing = lobby.participants.get(userId);
    lobby.participants.set(userId, {
      userId,
      login,
      teamName: teamName || `${login}'s Team`,
      ready: existing?.ready ?? false, // Preserve ready status if reconnecting
      socketId,
    });

    return lobby;
  }

  removeParticipant(roomId: string, userId: string): LobbyRoom | undefined {
    const lobby = this.lobbies.get(roomId);
    if (!lobby) return undefined;

    lobby.participants.delete(userId);

    // Delete empty lobbies
    if (lobby.participants.size === 0) {
      this.lobbies.delete(roomId);
      return undefined;
    }

    return lobby;
  }

  setReady(roomId: string, userId: string, ready: boolean): LobbyRoom | undefined {
    const lobby = this.lobbies.get(roomId);
    if (!lobby) return undefined;

    const participant = lobby.participants.get(userId);
    if (participant) {
      participant.ready = ready;
    }

    return lobby;
  }

  getLobby(roomId: string): LobbyRoom | undefined {
    return this.lobbies.get(roomId);
  }

  getParticipantsList(roomId: string): LobbyParticipant[] {
    const lobby = this.lobbies.get(roomId);
    if (!lobby) return [];
    return Array.from(lobby.participants.values());
  }

  allReady(roomId: string): boolean {
    const lobby = this.lobbies.get(roomId);
    if (!lobby || lobby.participants.size === 0) return false;
    return Array.from(lobby.participants.values()).every(p => p.ready);
  }

  clearLobby(roomId: string): void {
    this.lobbies.delete(roomId);
  }

  addBots(roomId: string, count: number, dataStore: any): void {
    const maxBots = 9;
    const actualCount = Math.min(count, maxBots);
    const timestamp = Date.now();

    console.log('[LobbyManager] Adding', actualCount, 'bots to room', roomId);

    for (let i = 1; i <= actualCount; i++) {
      const botUserId = `bot-${timestamp}-${i}`;
      const botLogin = `Bot ${i}`;
      const botTeamName = `Bot ${i} Team`;

      console.log('[LobbyManager] Creating bot:', { botUserId, botLogin });

      // Add bot to lobby
      this.addParticipant(roomId, botUserId, botLogin, botTeamName);
      
      // Create team for bot in dataStore (CRITICAL!)
      try {
        dataStore.createTeam(botUserId, botTeamName, 'bot-logo', 1);
        console.log('[LobbyManager] Created team for bot:', botUserId);
      } catch (err) {
        console.error('[LobbyManager] Failed to create team for bot:', botUserId, err);
      }
      
      // Mark bot as ready immediately
      const lobby = this.lobbies.get(roomId);
      if (lobby) {
        const participant = lobby.participants.get(botUserId);
        if (participant) {
          participant.ready = true;
        }
      }
    }

    console.log('[LobbyManager] All bots added and ready');
  }
}
