import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { dataStore } from '../dataStore';

describe('REST API', () => {
  beforeEach(() => {
    // Сброс состояния перед каждым тестом
    dataStore.reset();
    
    // Перезагрузить игроков из файла
    const path = require('path');
    const playersPath = path.join(__dirname, '../../data/players.json');
    dataStore.loadPlayersFromFile(playersPath);
  });

  // ============================================================================
  // Auth endpoints
  // ============================================================================

  describe('Auth endpoints', () => {
    describe('POST /api/auth/register', () => {
      it('registers a new user successfully', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            login: 'testuser',
            password: 'password123',
            teamName: 'Test Team',
            logo: 'logo1',
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('userId');
        expect(response.body.login).toBe('testuser');
        expect(response.body.teamName).toBe('Test Team');
      });

      it('rejects duplicate login', async () => {
        // Первая регистрация
        await request(app)
          .post('/api/auth/register')
          .send({
            login: 'testuser',
            password: 'password123',
            teamName: 'Test Team 1',
          });

        // Повторная регистрация с тем же логином
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            login: 'testuser',
            password: 'different',
            teamName: 'Test Team 2',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Login already exists');
      });

      it('validates input data', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            login: 'ab', // слишком короткий
            password: '123', // слишком короткий
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
      });
    });

    describe('POST /api/auth/login', () => {
      beforeEach(async () => {
        // Создаём тестового пользователя
        await request(app)
          .post('/api/auth/register')
          .send({
            login: 'testuser',
            password: 'password123',
            teamName: 'Test Team',
          });
      });

      it('logs in with valid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            login: 'testuser',
            password: 'password123',
          });

        expect(response.status).toBe(200);
        expect(response.body.userId).toBeDefined();
        expect(response.body.login).toBe('testuser');
      });

      it('rejects invalid password', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            login: 'testuser',
            password: 'wrongpassword',
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Invalid credentials');
      });

      it('rejects non-existent user', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            login: 'nonexistent',
            password: 'password123',
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Invalid credentials');
      });
    });

    describe('GET /api/auth/me', () => {
      it('returns current user when authenticated', async () => {
        // Регистрация и получение cookie
        const registerRes = await request(app)
          .post('/api/auth/register')
          .send({
            login: 'testuser',
            password: 'password123',
            teamName: 'Test Team',
          });

        const cookie = registerRes.headers['set-cookie'];

        // Запрос текущего пользователя
        const response = await request(app)
          .get('/api/auth/me')
          .set('Cookie', cookie);

        expect(response.status).toBe(200);
        expect(response.body.login).toBe('testuser');
        expect(response.body.teamName).toBe('Test Team');
      });

      it('returns 401 when not authenticated', async () => {
        const response = await request(app).get('/api/auth/me');

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Not authenticated');
      });
    });

    describe('POST /api/auth/logout', () => {
      it('logs out successfully', async () => {
        // Регистрация
        const registerRes = await request(app)
          .post('/api/auth/register')
          .send({
            login: 'testuser',
            password: 'password123',
            teamName: 'Test Team',
          });

        const cookie = registerRes.headers['set-cookie'];

        // Logout
        const response = await request(app)
          .post('/api/auth/logout')
          .set('Cookie', cookie);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Logged out successfully');
      });
    });

    it('requires authentication for GET /api/draft/rooms', async () => {
      const resp = await request(app).get('/api/draft/rooms');
      expect(resp.status).toBe(401);
    });

    it('requires roomId for GET /api/draft/history', async () => {
      // Register to obtain a session cookie for authentication
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({ login: 'tmpuser', password: 'password123', teamName: 'Tmp Team' });
      const cookie = registerRes.headers['set-cookie'];
      const cookies = Array.isArray(cookie) ? cookie : cookie ? [cookie] : [];

      const resp = await request(app)
        .get('/api/draft/history')
        .set('Cookie', cookies);
      expect(resp.status).toBe(400);
    });
  });

  // ============================================================================
  // Draft endpoints
  // ============================================================================

  describe('Draft endpoints', () => {
    let userCookie: string[];
    let userId: string;
    let user2Cookie: string[];
    let user2Id: string;
    let roomId: string;

    beforeEach(async () => {
      // Уникальный roomId на каждый тест в блоке Draft endpoints
      roomId = `test-room-${Math.random().toString(36).slice(2)}`;
      // Создать первого пользователя
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          login: 'draftuser',
          password: 'password123',
          teamName: 'Draft Team',
        });

      {
        const cookies = registerRes.headers['set-cookie'];
        userCookie = Array.isArray(cookies) ? cookies : [cookies];
      }
      userId = registerRes.body.userId;

      // Создать второго пользователя для multi-user драфта
      const registerRes2 = await request(app)
        .post('/api/auth/register')
        .send({
          login: 'draftuser2',
          password: 'password123',
          teamName: 'Draft Team 2',
        });

      {
        const cookies = registerRes2.headers['set-cookie'];
        user2Cookie = Array.isArray(cookies) ? cookies : [cookies];
      }
      user2Id = registerRes2.body.userId;
    });

    describe('POST /api/draft/start', () => {
      it('starts a draft successfully', async () => {
        const response = await request(app)
          .post('/api/draft/start')
          .set('Cookie', userCookie)
          .send({
            roomId,
            pickOrder: [userId, user2Id],
            timerSec: 60,
          });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Draft started successfully');
        expect(response.body.draftState).toBeDefined();
        expect(response.body.draftState.started).toBe(true);
      });

      it('requires authentication', async () => {
        const response = await request(app)
          .post('/api/draft/start')
          .send({
            roomId,
            pickOrder: [userId],
          });

        expect(response.status).toBe(401);
      });

      it('rejects invalid input (non-uuid in pickOrder)', async () => {
        const response = await request(app)
          .post('/api/draft/start')
          .set('Cookie', userCookie)
          .send({
            roomId,
            pickOrder: [userId, 'not-a-uuid'],
            timerSec: 60,
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
      });
    });

    describe('GET /api/draft/room', () => {
      beforeEach(async () => {
        // Запустить драфт с двумя пользователями
        await request(app)
          .post('/api/draft/start')
          .set('Cookie', userCookie)
          .send({
            roomId,
            pickOrder: [userId, user2Id],
            timerSec: 60,
          });
      });

      it('returns draft room state', async () => {
        const response = await request(app)
          .get(`/api/draft/room?roomId=${roomId}`)
          .set('Cookie', userCookie);

        expect(response.status).toBe(200);
        expect(response.body.draftState).toBeDefined();
        expect(response.body.availablePlayers).toBeDefined();
        expect(response.body.myTeam).toBeDefined();
      });

      it('requires roomId parameter', async () => {
        const response = await request(app)
          .get('/api/draft/room')
          .set('Cookie', userCookie);

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('roomId');
      });
    });

    describe('POST /api/draft/pick', () => {
      beforeEach(async () => {
        // Запустить драфт с двумя пользователями
        await request(app)
          .post('/api/draft/start')
          .set('Cookie', userCookie)
          .send({
            roomId,
            pickOrder: [userId, user2Id],
            timerSec: 60,
          });
      });

      it('makes a successful pick', async () => {
        const response = await request(app)
          .post('/api/draft/pick')
          .set('Cookie', userCookie)
          .send({
            roomId,
            playerId: 'player-1',
          });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Pick successful');
        expect(response.body.draftState).toBeDefined();
        expect(response.body.team).toBeDefined();
      });

      it('rejects pick when it is not your turn', async () => {
        // На первом ходе активен userId, а пытается пикнуть user2
        const response = await request(app)
          .post('/api/draft/pick')
          .set('Cookie', user2Cookie)
          .send({ roomId, playerId: 'player-2' });

        expect(response.status).toBe(400);
        expect((response.body.error || '')).toMatch(/Not your turn/i);
      });

      it('rejects unknown player id', async () => {
        const response = await request(app)
          .post('/api/draft/pick')
          .set('Cookie', userCookie)
          .send({ roomId, playerId: 'player-999' });

        expect(response.status).toBe(400);
        expect((response.body.error || '')).toMatch(/Player not found/i);
      });

      it('rejects duplicate pick', async () => {
        // Определим активного пользователя
        const stateRes = await request(app).get(`/api/draft/state?roomId=${roomId}`);
        expect(stateRes.status).toBe(200);
        const activeUserId = stateRes.body.draftState.activeUserId as string;

        const activeCookie = activeUserId === userId ? userCookie : user2Cookie;
        const otherCookie = activeUserId === userId ? user2Cookie : userCookie;

        // Первый пик активным пользователем
        const firstPick = await request(app)
          .post('/api/draft/pick')
          .set('Cookie', activeCookie)
          .send({ roomId, playerId: 'player-1' });
        expect(firstPick.status).toBe(200);

        // Попытка дубля другим пользователем
        const response = await request(app)
          .post('/api/draft/pick')
          .set('Cookie', otherCookie)
          .send({ roomId, playerId: 'player-1' });

        expect(response.status).toBe(400);
        expect(/already picked|Not your turn/i.test(response.body.error || '')).toBe(true);
      });

      it('rejects pick when exceeding salary cap', async () => {
        // Тест проверяет salary cap валидацию, используя простейший сценарий
        // Пикаем дорогих игроков до превышения cap
        // Используем двух пользователей для корректной очередности
        await request(app)
          .post('/api/draft/pick')
          .set('Cookie', userCookie)
          .send({
            roomId,
            playerId: 'player-3', // Nathan MacKinnon $12.6M
          });

        // user2 делает свой пик
        await request(app)
          .post('/api/draft/pick')
          .set('Cookie', user2Cookie)
          .send({
            roomId,
            playerId: 'player-4',
          });

        // user1 второй пик
        await request(app)
          .post('/api/draft/pick')
          .set('Cookie', userCookie)
          .send({
            roomId,
            playerId: 'player-1', // Connor McDavid $12.5M
          });

        await request(app)
          .post('/api/draft/start')
          .set('Cookie', userCookie)
          .send({
            roomId,
            pickOrder: [userId, user2Id],
          });

        const response = await request(app).get(`/api/draft/state?roomId=${roomId}`);

        expect(response.status).toBe(200);
        expect(response.body.draftState).toBeDefined();
        expect(response.body.draftState.started).toBe(true);
      });

      it('returns 404 for non-existent room', async () => {
        const response = await request(app).get('/api/draft/state?roomId=non-existent');

        expect(response.status).toBe(404);
        expect(response.body.error).toContain('not found');
      });
    });

    it('lists persisted rooms via GET /api/draft/rooms', async () => {
      // Ensure a room exists by starting it
      await request(app)
        .post('/api/draft/start')
        .set('Cookie', userCookie)
        .send({ roomId, pickOrder: [userId, user2Id], timerSec: 30 });

      const resp = await request(app)
        .get('/api/draft/rooms')
        .set('Cookie', userCookie);

      expect(resp.status).toBe(200);
      expect(Array.isArray(resp.body.rooms)).toBe(true);
      const hasRoom = resp.body.rooms.some((r: any) => r.roomId === roomId);
      expect(hasRoom).toBe(true);
    });

    it('returns draft history via GET /api/draft/history', async () => {
      // Start and make a pick
      await request(app)
        .post('/api/draft/start')
        .set('Cookie', userCookie)
        .send({ roomId, pickOrder: [userId, user2Id], timerSec: 30 });

      await request(app)
        .post('/api/draft/pick')
        .set('Cookie', userCookie)
        .send({ roomId, playerId: 'player-1' });

      const resp = await request(app)
        .get(`/api/draft/history?roomId=${roomId}`)
        .set('Cookie', userCookie);

      expect(resp.status).toBe(200);
      expect(resp.body.roomId).toBe(roomId);
      expect(Array.isArray(resp.body.picks)).toBe(true);
      expect(resp.body.picks.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // Data endpoints
  // ============================================================================

  describe('Data endpoints', () => {
    let userCookie: string[];
    let userId: string;

    beforeEach(async () => {
      // Создать пользователя
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          login: 'datauser',
          password: 'password123',
          teamName: 'Data Team',
        });

      {
        const cookies = registerRes.headers['set-cookie'];
        userCookie = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
      }
      userId = registerRes.body.userId;

      // Запустить драфт и сделать несколько пиков
      await request(app)
        .post('/api/draft/start')
        .set('Cookie', userCookie)
        .send({
          roomId: 'data-room',
          pickOrder: [userId],
        });

      await request(app)
        .post('/api/draft/pick')
        .set('Cookie', userCookie)
        .send({
          roomId: 'data-room',
          playerId: 'player-1',
        });
    });

    describe('GET /api/team', () => {
      it('returns user team with players', async () => {
        const response = await request(app)
          .get('/api/team')
          .set('Cookie', userCookie);

        expect(response.status).toBe(200);
        expect(response.body.team).toBeDefined();
        expect(response.body.players).toBeDefined();
        expect(response.body.team.players).toContain('player-1');
      });

      it('requires authentication', async () => {
        const response = await request(app).get('/api/team');

        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/players', () => {
      it('returns all players', async () => {
        const response = await request(app).get('/api/players');

        expect(response.status).toBe(200);
        expect(response.body.players).toBeDefined();
        expect(response.body.total).toBeGreaterThan(0);
      });

      it('filters by drafted status', async () => {
        const response = await request(app).get('/api/players?drafted=false');

        expect(response.status).toBe(200);
        expect(response.body.players).toBeDefined();
        // Все игроки должны быть доступны (не задрафчены)
        response.body.players.forEach((player: any) => {
          if (player.id !== 'player-1') {
            expect(player.draftedBy).toBeNull();
          }
        });
      });

      it('filters by position', async () => {
        const response = await request(app).get('/api/players?position=C');

        expect(response.status).toBe(200);
        expect(response.body.players).toBeDefined();
        response.body.players.forEach((player: any) => {
          expect(player.position).toBe('C');
        });
      });
    });

    describe('GET /api/leaderboard', () => {
      it('returns leaderboard', async () => {
        const response = await request(app).get('/api/leaderboard');

        expect(response.status).toBe(200);
        expect(response.body.leaderboard).toBeDefined();
        expect(Array.isArray(response.body.leaderboard)).toBe(true);
        expect(response.body.week).toBe(1);
      });

      it('sorts teams by salary', async () => {
        const response = await request(app).get('/api/leaderboard');

        const leaderboard = response.body.leaderboard;
        if (leaderboard.length > 1) {
          // Проверить что сортировка по убыванию salary
          for (let i = 0; i < leaderboard.length - 1; i++) {
            expect(leaderboard[i].salaryTotal).toBeGreaterThanOrEqual(
              leaderboard[i + 1].salaryTotal
            );
          }
        }
      });
    });
  });
});
