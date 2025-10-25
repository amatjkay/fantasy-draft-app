import { io, Socket } from 'socket.io-client';

/**
 * Сервис для управления Socket.IO подключениями
 * Предотвращает создание дублирующих соединений и обеспечивает
 * единую точку для обработки событий Socket.IO
 */
class SocketService {
  private socket: Socket | null = null;
  private baseUrl: string;
  private handlers: Map<string, Set<Function>> = new Map();
  private roomId: string | null = null;
  private userId: string | null = null;

  constructor() {
    this.baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  }

  /**
   * Подключиться к Socket.IO серверу
   */
  connect(roomId?: string, userId?: string): Socket {
    // Если соединение уже существует, вернуть его
    if (this.socket && this.socket.connected) {
      // Если указаны roomId и userId, присоединиться к комнате
      if (roomId && userId) {
        this.joinRoom(roomId, userId);
      }
      return this.socket;
    }

    // Создать новое соединение
    const socket = io(this.baseUrl, { withCredentials: true });
    this.socket = socket;

    // Настроить обработчики событий
    socket.on('connect', () => {
      console.log('[SocketService] Connected to server');
      
      // Если указаны roomId и userId, присоединиться к комнате
      if (roomId && userId) {
        this.joinRoom(roomId, userId);
      }
      
      // Восстановить все обработчики событий
      this.handlers.forEach((handlers, event) => {
        handlers.forEach(handler => {
          socket.on(event, handler);
        });
      });
    });

    socket.on('disconnect', () => {
      console.log('[SocketService] Disconnected from server');
    });

    socket.on('connect_error', (error) => {
      console.error('[SocketService] Connection error:', error);
    });

    return socket;
  }

  /**
   * Присоединиться к комнате драфта
   */
  joinRoom(roomId: string, userId: string): void {
    if (!this.socket) {
      throw new Error('Socket is not initialized. Call connect() first.');
    }
    
    this.roomId = roomId;
    this.userId = userId;
    
    console.log(`[SocketService] Joining room ${roomId} as user ${userId}`);
    this.socket.emit('draft:join', { roomId, userId });
  }

  /**
   * Отправить событие
   */
  emit(event: string, data: any): void {
    if (!this.socket) {
      throw new Error('Socket is not initialized. Call connect() first.');
    }
    this.socket.emit(event, data);
  }

  /**
   * Добавить обработчик события
   */
  on(event: string, handler: Function): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    
    this.handlers.get(event)!.add(handler);
    
    if (this.socket) {
      this.socket.on(event, handler);
    }
  }

  /**
   * Удалить обработчик события
   */
  off(event: string, handler: Function): void {
    if (this.handlers.has(event)) {
      this.handlers.get(event)!.delete(handler);
    }
    
    if (this.socket) {
      this.socket.off(event, handler as any);
    }
  }

  /**
   * Отключиться от сервера
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Экспорт синглтона для использования в компонентах
export const socketService = new SocketService();