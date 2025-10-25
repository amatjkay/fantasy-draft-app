import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { dataStore } from '../dataStore';
import { hashPassword, verifyPassword } from '../auth';
import { UserSchema } from '../models';

const router = Router();

// ============================================================================
// Validation schemas
// ============================================================================

const RegisterSchema = z.object({
  login: z.string().min(3, 'Login must be at least 3 characters long'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  teamName: z.string().min(3, 'Team name must be at least 3 characters long').max(50),
  logo: z.string().optional().default('default-logo'),
  makeAdmin: z.boolean().optional(), // For e2e tests
});

const LoginSchema = z.object({
  login: z.string(),
  password: z.string(),
});

// ============================================================================
// POST /api/auth/register
// ============================================================================

router.post('/register', async (req: Request, res: Response) => {
  try {
    // Валидация входных данных
    const data = RegisterSchema.parse(req.body);

    // Проверка уникальности логина
    const existingUser = dataStore.getUserByLogin(data.login);
    if (existingUser) {
      return res.status(400).json({ error: 'Login already exists' });
    }

    // Хэширование пароля
    const passwordHash = await hashPassword(data.password);

    // Создание пользователя
    // First user is always admin (for backwards compatibility with tests)
    // Or if makeAdmin flag is explicitly set
    const isFirstUser = dataStore.getAllUsers().length === 0;
    const role = data.makeAdmin || isFirstUser ? 'admin' : 'user';
    const user = dataStore.createUser(data.login, passwordHash, data.teamName, data.logo, role);

    // Создание команды для пользователя
    dataStore.createTeam(user.id, data.teamName, data.logo, 1);

    // Сохранение сессии
    req.session.userId = user.id;

    return res.status(201).json({
      userId: user.id,
      login: user.login,
      teamName: user.teamName,
      role: user.role,
      message: 'User registered successfully',
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: err.errors });
    }
    console.error('[POST /register] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// POST /api/auth/login
// ============================================================================

router.post('/login', async (req: Request, res: Response) => {
  try {
    // Валидация входных данных
    const data = LoginSchema.parse(req.body);

    // Проверка существования логина
    const existingUser = dataStore.getUserByLogin(data.login);
    if (!existingUser) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Проверка пароля
    const isValid = await verifyPassword(data.password, existingUser.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Сохранение сессии
    req.session.userId = existingUser.id;

    return res.json({
      userId: existingUser.id,
      login: existingUser.login,
      teamName: existingUser.teamName,
      role: existingUser.role,
      message: 'Logged in successfully',
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: err.errors });
    }
    console.error('[POST /login] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// POST /api/auth/logout
// ============================================================================

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[POST /logout] Error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid'); // Удаляем cookie сессии
    return res.json({ message: 'Logged out successfully' });
  });
});

// ============================================================================
// GET /api/auth/me - текущий пользователь (опционально)
// ============================================================================

router.get('/me', (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = dataStore.getUser(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({
    userId: user.id,
    login: user.login,
    teamName: user.teamName,
    logo: user.logo,
    role: user.role || 'user',
  });
});

export default router;
