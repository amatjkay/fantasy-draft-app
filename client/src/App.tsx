import React, { useEffect, useRef, useState } from 'react';
import { DraftRoom } from './components/DraftRoom';
import { Lobby } from './components/Lobby';
import { socketService } from './services/socketService';
import { apiService } from './services/apiService';


export default function App() {
  const [login, setLogin] = useState('demo');
  const [password, setPassword] = useState('pass1234');
  const [teamName, setTeamName] = useState('Demo Team');
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user');
  const userLogin = login; // Используем логин для Lobby компонента

  const [roomId, setRoomId] = useState<string>('');
  const [pickOrder, setPickOrder] = useState<string>('');
  const [presence, setPresence] = useState<{ roomId: string; users: string[]; count: number } | null>(null);

  const [viewMode, setViewMode] = useState<'auth' | 'lobby' | 'draft'>('auth');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Automatically switch view mode based on state
  useEffect(() => {
    if (userId) {
      setViewMode('lobby');
    } else {
      setViewMode('auth');
    }
  }, [userId]);

  // Socket.IO логика для лобби с использованием socketService
  useEffect(() => {
    // Подключаем Socket.IO только если находимся в лобби и есть userId
    if (viewMode !== 'lobby' || !userId) {
      socketService.disconnect();
      return;
    }

    // Подключаемся и присоединяемся к комнате
    socketService.connect(roomId, userId);

    // Добавляем обработчик для событий присутствия
    const handlePresence = (p: any) => setPresence(p);
    socketService.on('draft:presence', handlePresence);

    return () => {
      socketService.off('draft:presence', handlePresence);
      socketService.disconnect();
    };
  }, [viewMode, roomId, userId]);

  const doRegister = async () => {
    const result = await apiService.register(login, password, teamName);
    if (result.userId) {
      setUserId(result.userId);
      setUserRole(result.role || 'user');
    } else if (result.error) {
      alert(`Ошибка регистрации: ${result.error}`);
    }
  };

  const doLogin = async () => {
    const result = await apiService.login(login, password);
    if (result.userId) {
      setUserId(result.userId);
      setUserRole(result.role || 'user');
    } else if (result.error) {
      alert(`Ошибка входа: ${result.error}`);
    }
  };

  const startDraft = async () => {
    const id = roomId || `room-${Math.random().toString(36).slice(2)}`;
    setRoomId(id);
    const order = pickOrder.split(',').map(s => s.trim()).filter(Boolean);
    
    // Присоединяемся к комнате через socketService
    if (userId) {
      socketService.joinRoom(id, userId);
    }
    
    // Запускаем драфт
    const success = await apiService.startDraft(id, order, 60);
    if (success) {
      setViewMode('draft');
    } else {
      alert('Не удалось запустить драфт');
    }
  };

  const joinActiveDraft = async () => {
    // Автоматически присоединяемся к активной комнате
    const activeRoomId = 'main-draft-room'; // Всегда одна активная комната
    setRoomId(activeRoomId);
    
    // Переходим в лобби (не в драфт!)
    setViewMode('lobby');
  };

  // ============================================================================
  // Render logic
  // ============================================================================

  if (viewMode === 'auth') {
    return (
      <div className="page-centered animate-fade-in" data-testid="auth-container">
        <div className="card max-w-md w-full animate-slide-up">
          <div className="card-header text-center">
            <h1 style={{ 
              fontSize: '2.5rem', 
              fontWeight: '700', 
              marginBottom: '0.5rem',
              background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              🏒 Fantasy Draft
            </h1>
            <p className="card-subtitle">
              {authMode === 'login' ? 'Войдите в систему' : 'Создайте аккаунт'}
            </p>
          </div>

          <div className="card-body">
            {authMode === 'login' ? (
              <>
                <div className="form-group">
                  <label className="form-label">Логин</label>
                  <input 
                    className="form-input" 
                    value={login} 
                    onChange={e => setLogin(e.target.value)} 
                    placeholder="Введите логин" 
                    data-testid="login-input" 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Пароль</label>
                  <input 
                    className="form-input" 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="Введите пароль" 
                    data-testid="password-input" 
                  />
                </div>
                <button 
                  className="btn btn-primary btn-lg btn-block" 
                  data-testid="login-button" 
                  onClick={doLogin}
                  style={{ marginTop: '1.5rem' }}
                >
                  🔑 Войти
                </button>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">Логин</label>
                  <input 
                    className="form-input" 
                    data-testid="register-login-input" 
                    value={login} 
                    onChange={e => setLogin(e.target.value)} 
                    placeholder="Выберите логин" 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Пароль</label>
                  <input 
                    className="form-input" 
                    data-testid="register-password-input" 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="Придумайте пароль" 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Название команды</label>
                  <input 
                    className="form-input" 
                    data-testid="team-name-input" 
                    value={teamName} 
                    onChange={e => setTeamName(e.target.value)} 
                    placeholder="Моя команда" 
                  />
                  <div className="form-help">Будет отображаться в драфте</div>
                </div>
                <button 
                  className="btn btn-primary btn-lg btn-block" 
                  data-testid="register-button" 
                  onClick={doRegister}
                  style={{ marginTop: '1.5rem' }}
                >
                  📝 Зарегистрироваться
                </button>
              </>
            )}
          </div>

          <div className="card-footer text-center">
            <button 
              className="btn btn-ghost" 
              data-testid={authMode === 'login' ? 'register-mode-button' : 'login-mode-button'}
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            >
              {authMode === 'login' ? 'Нет аккаунта? Зарегистрироваться →' : 'Уже есть аккаунт? Войти →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'lobby') {
    return (
      <div className="app-container animate-fade-in">
        <div className="app-header">
          <div className="flex items-center justify-between">
            <h1 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>
              🏒 Fantasy Draft
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-muted">Привет, {login}!</span>
              {userRole === 'admin' && (
                <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                  👑 Admin
                </span>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => { apiService.logout(); setUserId(null); setViewMode('auth'); }}>
                Выйти
              </button>
            </div>
          </div>
        </div>

        <div className="app-main">
          <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="card-header">
              <h2 className="card-title" data-testid="lobby-title">Лобби Драфта</h2>
              <p className="card-subtitle">Присоединяйтесь к активному драфту</p>
            </div>

            <div className="card-body">
              <div className="text-center" style={{ padding: '2rem 0' }}>
                <div className="form-help" style={{ marginBottom: '1rem', fontSize: '1rem' }}>
                  🎯 Вы автоматически присоединитесь к активной драфт-комнате
                </div>
                <div className="form-help" style={{ marginBottom: '2rem' }}>
                  📝 Порядок выбора будет определён случайным образом
                </div>
              </div>

              <button 
                className="btn btn-primary btn-lg btn-block" 
                data-testid="join-draft-btn" 
                onClick={joinActiveDraft}
                style={{ marginTop: '1rem' }}
              >
                🚀 Присоединиться к Драфту
              </button>
            </div>

            {presence && presence.count > 0 && (
              <div className="card-footer">
                <div className="flex items-center gap-2 mb-2">
                  <span className="badge badge-success">
                    {presence.count} {presence.count === 1 ? 'пользователь' : 'пользователя'} онлайн
                  </span>
                </div>
                <div style={{ 
                  background: 'var(--color-bg-elevated)', 
                  padding: '0.75rem', 
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                  maxHeight: '150px',
                  overflow: 'auto'
                }}>
                  {presence.users.map((u: string, i: number) => (
                    <div key={i} style={{ padding: '0.25rem 0', color: 'var(--color-text-secondary)' }}>
                      • {u}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Lobby View
  if (viewMode === 'lobby' && userId && roomId) {
    return (
      <Lobby 
        roomId={roomId}
        userId={userId}
        userLogin={userLogin}
        userRole={userRole}
        onStartDraft={() => setViewMode('draft')}
        onExit={() => setViewMode('auth')}
      />
    );
  }

  // Draft View
  if (viewMode === 'draft' && userId && roomId) {
    return <DraftRoom roomId={roomId} userId={userId} onExit={() => setViewMode('lobby')} />;
  }

  // Fallback / Loading View
  return (
    <div className="container">
      <h1>Loading...</h1>
      <p>ViewMode: {viewMode}, UserID: {userId ? 'set' : 'null'}, RoomID: {roomId || 'none'}</p>
      <button onClick={() => { 
        apiService.logout();
        setUserId(null); 
        setViewMode('auth'); 
      }}>Logout</button>
    </div>
  );
}
