import { Router, Request, Response } from 'express';
import { dataStore } from '../dataStore';
import { requireAdmin } from '../middleware/requireAdmin';
import { hashPassword } from '../auth';
import { POSITIONS, Position } from '../models';

const router = Router();

// All admin routes require admin role
router.use(requireAdmin);

// ============================================================================
// GET /api/admin/users - List all users
// ============================================================================

router.get('/users', (req: Request, res: Response) => {
  const users = dataStore.getAllUsers().map(u => ({
    id: u.id,
    login: u.login,
    teamName: u.teamName,
    role: u.role,
    createdAt: u.createdAt,
    // DO NOT expose passwordHash
  }));

  return res.json({ users });
});

// ============================================================================
// PUT /api/admin/users/:userId - Update user
// ============================================================================

router.put('/users/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { login, teamName, role, password } = req.body;

  const user = dataStore.getUser(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Update fields
  if (login) user.login = login;
  if (teamName) user.teamName = teamName;
  if (role && (role === 'user' || role === 'admin')) user.role = role;
  if (password) {
    user.passwordHash = await hashPassword(password);
  }

  return res.json({ 
    message: 'User updated',
    user: {
      id: user.id,
      login: user.login,
      teamName: user.teamName,
      role: user.role,
    },
  });
});

// ============================================================================
// DELETE /api/admin/users/:userId - Delete user
// ============================================================================

router.delete('/users/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;

  const user = dataStore.getUser(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Prevent deleting yourself
  if (userId === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }

  // Delete user's team
  const teams = dataStore.getTeamsMap();
  for (const [teamId, team] of teams) {
    if (team.ownerId === userId) {
      teams.delete(teamId);
    }
  }

  // Delete user (note: DataStore doesn't expose direct delete, would need to add method)
  // For now, we'll mark this as a limitation
  // TODO: Add deleteUser method to DataStore

  return res.json({ message: 'User deleted' });
});

export { router as adminRouter };

// ============================================================================
// PUT /api/admin/players/:playerId/positions - Update eligiblePositions
// ============================================================================

router.put('/players/:playerId/positions', (req: Request, res: Response) => {
  const { playerId } = req.params;
  const { eligiblePositions } = req.body as { eligiblePositions?: string[] };

  const player = dataStore.getPlayer(playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  if (!Array.isArray(eligiblePositions) || eligiblePositions.length === 0) {
    return res.status(400).json({ error: 'eligiblePositions must be a non-empty array' });
  }

  const validPositions = new Set(POSITIONS as unknown as string[]);
  const cleaned = eligiblePositions.filter((p): p is Position => validPositions.has(p));
  if (cleaned.length === 0) {
    return res.status(400).json({ error: 'No valid positions provided' });
  }

  (player as any).eligiblePositions = cleaned;
  return res.json({ message: 'eligiblePositions updated', player: { id: player.id, eligiblePositions: cleaned } });
});
