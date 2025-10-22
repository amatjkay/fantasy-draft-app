import { Router, Request, Response } from 'express';
import { dataStore } from '../dataStore';
import { requireAuth } from '../auth';
import { LeaderboardEntry, getPlayerFullName } from '../models';

const router = Router();

// ============================================================================
// GET /api/team?userId={id}
// ============================================================================

router.get('/team', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || req.session.userId!;

    const team = dataStore.getTeam(userId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Получить полные данные игроков команды
    const picks = team.players
      .map(playerId => dataStore.getPlayer(playerId))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    return res.json({
      team: {
        ...team,
        picks, // Add full player objects as 'picks' for client
      },
      players: picks, // Keep for backward compatibility
    });
  } catch (err: any) {
    console.error('[GET /team] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/players?drafted=false&position={pos}&team={team}
// ============================================================================

router.get('/players', (req: Request, res: Response) => {
  try {
    const draftedParam = req.query.drafted as string | undefined;
    const position = req.query.position as string | undefined;
    const team = req.query.team as string | undefined;

    let players = dataStore.getAllPlayers();

    // Фильтр по drafted
    if (draftedParam !== undefined) {
      const showDrafted = draftedParam === 'true';
      players = players.filter(p => showDrafted ? p.draftedBy !== null : p.draftedBy === null);
    }

    // Фильтр по позиции (учитывая мультипозиции)
    if (position) {
      players = players.filter(p => {
        if (p.position === position) return true;
        const ep = (p as any).eligiblePositions as string[] | undefined;
        return Array.isArray(ep) && ep.includes(position);
      });
    }

    // Фильтр по команде NHL
    if (team) {
      players = players.filter(p => p.team === team);
    }

    return res.json({
      players,
      total: players.length,
    });
  } catch (err: any) {
    console.error('[GET /players] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/leaderboard?week={week}
// ============================================================================

router.get('/leaderboard', (req: Request, res: Response) => {
  try {
    const week = req.query.week ? parseInt(req.query.week as string) : 1;

    const teams = dataStore.getAllTeams().filter(t => t.week === week);

    // Построить leaderboard
    const leaderboard: LeaderboardEntry[] = teams.map(team => {
      const owner = dataStore.getUser(team.ownerId);
      const players = team.players
        .map(playerId => dataStore.getPlayer(playerId))
        .filter(Boolean)
        .map(player => ({
          playerId: player!.id,
          name: getPlayerFullName(player!),
          position: player!.position,
          capHit: player!.capHit,
        }));

      return {
        teamId: team.teamId,
        owner: owner?.login || 'Unknown',
        teamName: team.name,
        logo: team.logo,
        salaryTotal: team.salaryTotal,
        players,
      };
    });

    // Сортировка по убыванию salary
    leaderboard.sort((a, b) => b.salaryTotal - a.salaryTotal);

    return res.json({
      leaderboard,
      week,
    });
  } catch (err: any) {
    console.error('[GET /leaderboard] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
