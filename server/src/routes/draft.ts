import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { draftManager } from '../draftManager';
import { dataStore } from '../dataStore';
import { requireAuth } from '../auth';
import { emitDraftState } from '../ioBus';
import { getDraftRepository } from '../persistence/repository';
import type { DraftPickRecord, DraftRoomRecord } from '../persistence/types';

const router = Router();

// ============================================================================
// Validation schemas
// ============================================================================

const StartDraftSchema = z.object({
  roomId: z.string(),
  pickOrder: z.array(z.string().uuid()),
  timerSec: z.number().int().positive().optional().default(30),
});

// List persisted rooms
router.get('/rooms', requireAuth, (req, res) => {
  try {
    const repo = getDraftRepository();
    const rooms = repo.listRooms();
    res.json({ rooms });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list rooms' });
  }
});

// Draft history for a room
router.get('/history', requireAuth, (req, res) => {
  const roomId = (req.query.roomId as string) || '';
  if (!roomId) {
    return res.status(400).json({ error: 'roomId is required' });
  }
  try {
    const repo = getDraftRepository();
    const picks = repo.listPicks(roomId);
    res.json({ roomId, picks });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get history' });
  }
});

const PickSchema = z.object({
  roomId: z.string(),
  playerId: z.string(),
});

// ============================================================================
// POST /api/draft/start
// ============================================================================

router.post('/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = StartDraftSchema.parse(req.body);

    // Создать команды для всех пользователей, если еще не созданы
    data.pickOrder.forEach((userId) => {
      if (!dataStore.getTeam(userId)) {
        const user = dataStore.getUser(userId);
        const teamName = user ? user.teamName : `Team ${userId}`;
        const logo = user ? user.logo : 'default-logo';
        dataStore.createTeam(userId, teamName, logo, 1);
      }
    });

    const room = draftManager.getOrCreate({
      roomId: data.roomId,
      pickOrder: data.pickOrder,
      timerSec: data.timerSec,
      snakeDraft: true,
    });

    room.start();
    // Broadcast to room subscribers (Socket.IO)
    try { emitDraftState(data.roomId, room.getState()); } catch {}

    // Persist draft room (best-effort)
    try {
      const repo = getDraftRepository();
      const record: DraftRoomRecord = {
        roomId: data.roomId,
        timerSec: data.timerSec,
        snakeDraft: true,
        createdAt: Date.now(),
        pickOrder: data.pickOrder,
      };
      repo.saveRoom(record);
    } catch {}

    return res.json({
      message: 'Draft started successfully',
      draftState: room.getState(),
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: err.errors });
    }
    console.error('[POST /draft/start] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ============================================================================
// GET /api/draft-room?roomId={id}
// ============================================================================

router.get('/room', requireAuth, (req: Request, res: Response) => {
  try {
    const roomId = req.query.roomId as string;
    if (!roomId) {
      return res.status(400).json({ error: 'roomId query parameter is required' });
    }

    const room = draftManager.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Draft room not found' });
    }

    const userId = req.session.userId!;
    const draftState = room.getState();
    const availablePlayers = dataStore.getAvailablePlayers();
    const myTeam = dataStore.getTeam(userId);

    return res.json({
      draftState,
      availablePlayers,
      myTeam: myTeam || null,
    });
  } catch (err: any) {
    console.error('[GET /draft-room] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// POST /api/draft/pick
// ============================================================================

router.post('/pick', requireAuth, async (req: Request, res: Response) => {
  try {
    const data = PickSchema.parse(req.body);
    const userId = req.session.userId!;

    const room = draftManager.get(data.roomId);
    if (!room) {
      return res.status(404).json({ error: 'Draft room not found' });
    }

    const players = dataStore.getPlayersMap();
    const teams = dataStore.getTeamsMap();

    const newState = room.makePick(userId, data.playerId, players, teams);
    // Broadcast to room subscribers (Socket.IO)
    try { emitDraftState(data.roomId, newState); } catch {}
    // Persist pick (best-effort)
    try {
      const repo = getDraftRepository();
      const last = newState.picks[newState.picks.length - 1];
      const pick: DraftPickRecord = {
        roomId: data.roomId,
        pickIndex: last.pickIndex,
        round: last.round,
        slot: last.slot,
        userId: last.userId,
        playerId: last.playerId,
        autopick: false,
        createdAt: Date.now(),
      };
      repo.savePick(pick);
    } catch {}
    const myTeam = dataStore.getTeam(userId);

    return res.json({
      message: 'Pick successful',
      draftState: newState,
      team: myTeam,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: err.errors });
    }
    
    // Специфичные ошибки драфта → 400
    const asBadRequest = [
      'Not your turn',
      'Player already picked',
      'Salary cap exceeded',
      'Team is full',
      'No roster slot available',
      'Player not found',
      'Team not found',
      'Draft not started',
      'Draft paused',
    ];
    if (asBadRequest.some((m) => err.message.includes(m))) {
      return res.status(400).json({ error: err.message });
    }

    console.error('[POST /draft/pick] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ============================================================================
// GET /api/draft/active - Check if user has active draft
// ============================================================================

router.get('/active', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    console.log('[GET /draft/active] Checking for userId:', userId);

    // Check all active draft rooms to see if user is participating
    const allRooms = draftManager.getRooms();
    
    for (const [roomId, room] of allRooms) {
      const state = room.getState();
      
      // Check if draft is started (active)
      if (state.started && !state.paused) {
        // Check if user is in pick order
        if (state.pickOrder.includes(userId)) {
          console.log('[GET /draft/active] Found active draft:', roomId);
          return res.json({
            hasActiveDraft: true,
            roomId,
            draftState: state,
          });
        }
      }
    }

    console.log('[GET /draft/active] No active draft found');
    return res.json({ hasActiveDraft: false });
  } catch (err: any) {
    console.error('[GET /draft/active] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/draft/state?roomId={id}
// ============================================================================

router.get('/state', (req: Request, res: Response) => {
  try {
    const roomId = req.query.roomId as string;
    if (!roomId) {
      return res.status(400).json({ error: 'roomId query parameter is required' });
    }

    const room = draftManager.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Draft room not found' });
    }

    return res.json({
      draftState: room.getState(),
    });
  } catch (err: any) {
    console.error('[GET /draft/state] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
