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

  try {
    const user = dataStore.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prepare updates
    const updates: any = {};
    if (login) updates.login = login;
    if (teamName) updates.teamName = teamName;
    if (role && (role === 'user' || role === 'admin')) updates.role = role;
    if (password) {
      updates.passwordHash = await hashPassword(password);
    }

    // Use updateUser method (throws error if userId === '1')
    const updatedUser = dataStore.updateUser(userId, updates);
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ 
      message: 'User updated',
      user: {
        id: updatedUser.id,
        login: updatedUser.login,
        teamName: updatedUser.teamName,
        role: updatedUser.role,
      },
    });
  } catch (err: any) {
    if (err.message && err.message.includes('Cannot modify default admin')) {
      return res.status(403).json({ error: err.message });
    }
    console.error('[PUT /admin/users/:userId] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// DELETE /api/admin/users/:userId - Delete user
// ============================================================================

router.delete('/users/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    const user = dataStore.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Use deleteUser method (throws error if userId === '1')
    const deleted = dataStore.deleteUser(userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ message: 'User deleted successfully' });
  } catch (err: any) {
    if (err.message && err.message.includes('Cannot delete default admin')) {
      return res.status(403).json({ error: err.message });
    }
    console.error('[DELETE /admin/users/:userId] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
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
