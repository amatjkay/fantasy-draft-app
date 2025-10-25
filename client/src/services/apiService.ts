/**
 * Сервис для работы с API
 * Централизует логику HTTP запросов и обработку ошибок
 */
class ApiService {
  private baseUrl: string;
  private csrfToken: string | null = null;

  constructor() {
    this.baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
    // При инициализации загрузим CSRF токен, если сервер его поддерживает
    this.refreshCsrfToken();
  }

  /**
   * Обновляет CSRF-токен с сервера
   */
  async refreshCsrfToken(): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/csrf-token`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.csrfToken) {
          this.csrfToken = data.csrfToken;
          return this.csrfToken;
        }
      }
      return null;
    } catch (error) {
      console.warn('[ApiService] Could not fetch CSRF token, continuing without it:', error);
      return null;
    }
  }

  /**
   * Базовый метод запроса к API
   */
  async request<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
    // Создаем заголовки с учетом CSRF-защиты
    const headers = new Headers(init?.headers || {});
    headers.set('Content-Type', 'application/json');
    
    // Если есть CSRF токен, добавляем его в заголовок
    if (this.csrfToken) {
      headers.set('X-CSRF-Token', this.csrfToken);
    }

    // Выполняем запрос
    const resp = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      headers,
      ...init,
    });

    // Обрабатываем ответ
    const text = await resp.text();
    try {
      // Пытаемся распарсить как JSON
      const parsedBody = JSON.parse(text);
      return { status: resp.status, body: parsedBody as T };
    } catch {
      // Если не JSON, возвращаем как текст
      return { status: resp.status, body: text as unknown as T };
    }
  }

  /**
   * GET запрос
   */
  async get<T>(path: string): Promise<{ status: number; body: T }> {
    return this.request<T>(path, { method: 'GET' });
  }

  /**
   * POST запрос
   */
  async post<T>(path: string, body: any): Promise<{ status: number; body: T }> {
    return this.request<T>(path, { 
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  /**
   * PUT запрос
   */
  async put<T>(path: string, body: any): Promise<{ status: number; body: T }> {
    return this.request<T>(path, { 
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  /**
   * DELETE запрос
   */
  async delete<T>(path: string): Promise<{ status: number; body: T }> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // Auth API

  /**
   * Регистрация нового пользователя
   */
  async register(login: string, password: string, teamName: string): Promise<{ userId: string | null; role?: 'user' | 'admin'; error?: string }> {
    try {
      const response = await this.post<{ userId: string; role?: 'user' | 'admin' }>('/api/auth/register', { login, password, teamName });
      
      if (response.status === 201 && typeof response.body === 'object') {
        return { userId: response.body.userId, role: response.body.role };
      }
      
      return { userId: null, error: typeof response.body === 'string' ? response.body : 'Registration failed' };
    } catch (error) {
      console.error('[ApiService] Register error:', error);
      return { userId: null, error: 'Network or server error' };
    }
  }

  /**
   * Вход пользователя
   */
  async login(login: string, password: string): Promise<{ userId: string | null; role?: 'user' | 'admin'; error?: string }> {
    try {
      const response = await this.post<{ userId: string; role?: 'user' | 'admin' }>('/api/auth/login', { login, password });
      
      if (response.status === 200 && typeof response.body === 'object') {
        return { userId: response.body.userId, role: response.body.role };
      }
      
      return { userId: null, error: typeof response.body === 'string' ? response.body : 'Login failed' };
    } catch (error) {
      console.error('[ApiService] Login error:', error);
      return { userId: null, error: 'Network or server error' };
    }
  }

  /**
   * Выход пользователя
   */
  async logout(): Promise<boolean> {
    try {
      const response = await this.post<any>('/api/auth/logout', {});
      return response.status === 200;
    } catch (error) {
      console.error('[ApiService] Logout error:', error);
      return false;
    }
  }

  // Draft API

  /**
   * Начать драфт
   */
  async startDraft(roomId: string, pickOrder: string[], timerSec: number = 60): Promise<boolean> {
    try {
      const response = await this.post<any>('/api/draft/start', { roomId, pickOrder, timerSec });
      return response.status === 200;
    } catch (error) {
      console.error('[ApiService] Start draft error:', error);
      return false;
    }
  }

  /**
   * Выбрать игрока в драфте
   */
  async pickPlayer(roomId: string, playerId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.post<any>('/api/draft/pick', { roomId, playerId });
      
      if (response.status === 200) {
        return { success: true };
      }
      
      return { success: false, error: typeof response.body === 'object' && 'error' in response.body 
        ? response.body.error 
        : 'Pick failed' };
    } catch (error) {
      console.error('[ApiService] Pick player error:', error);
      return { success: false, error: 'Network or server error' };
    }
  }

  /**
   * Получить список игроков
   */
  async getPlayers(): Promise<any[] | null> {
    try {
      const response = await this.get<{ players: any[] }>('/api/players');
      
      if (response.status === 200 && typeof response.body === 'object' && 'players' in response.body) {
        return response.body.players;
      }
      
      return null;
    } catch (error) {
      console.error('[ApiService] Get players error:', error);
      return null;
    }
  }

  /**
   * Получить информацию о команде
   */
  async getTeam(): Promise<any | null> {
    try {
      const response = await this.get<{ team: any }>('/api/team');
      
      if (response.status === 200 && typeof response.body === 'object' && 'team' in response.body) {
        return response.body.team;
      }
      
      return null;
    } catch (error) {
      console.error('[ApiService] Get team error:', error);
      return null;
    }
  }
}

// Экспорт синглтона для использования в компонентах
export const apiService = new ApiService();