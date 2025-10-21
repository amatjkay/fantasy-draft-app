import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface Participant {
  userId: string;
  login: string;
  teamName: string;
  ready: boolean;
}

interface Props {
  roomId: string;
  userId: string;
  userLogin: string;
  onStartDraft: () => void;
  onExit: () => void;
}

export function Lobby({ roomId, userId, userLogin, onStartDraft, onExit }: Props) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myReady, setMyReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    console.log('[Lobby] Initializing socket...', { roomId, userId, userLogin });
    const socket = io('http://localhost:3001', { withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Lobby] Socket connected!');
      console.log('[Lobby] Emitting lobby:join', { roomId, userId, login: userLogin });
      socket.emit('lobby:join', { roomId, userId, login: userLogin });
    });

    socket.on('connect_error', (err) => {
      console.error('[Lobby] Connection error:', err);
    });

    socket.on('error', (err) => {
      console.error('[Lobby] Socket error:', err);
    });

    socket.on('lobby:participants', (data: { participants: Participant[]; adminId: string }) => {
      console.log('[Lobby] Received participants:', data);
      console.log('[Lobby] userId:', userId, 'adminId:', data.adminId, 'isAdmin:', data.adminId === userId);
      setParticipants(data.participants);
      setIsAdmin(data.adminId === userId);
    });

    socket.on('lobby:ready', (data: { userId: string; ready: boolean }) => {
      setParticipants(prev => prev.map(p => p.userId === data.userId ? { ...p, ready: data.ready } : p));
    });

    socket.on('lobby:start', () => {
      onStartDraft();
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId, userId, userLogin]);

  const toggleReady = () => {
    const newReady = !myReady;
    setMyReady(newReady);
    socketRef.current?.emit('lobby:ready', { roomId, userId, ready: newReady });
  };

  const addBots = (count: number) => {
    socketRef.current?.emit('lobby:addBots', { roomId, count });
  };

  const startDraft = () => {
    const pickOrder = participants.map(p => p.userId);
    socketRef.current?.emit('lobby:start', { roomId, pickOrder });
  };

  const allReady = participants.length > 0 && participants.every(p => p.ready);
  const canStart = isAdmin && participants.length >= 2;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #053950 0%, #072338 100%)',
      padding: '20px',
    }}>
      <div className="card" style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ margin: 0, color: '#fff' }}>Лобби драфта</h1>
          <button onClick={onExit} className="btn btn-secondary">
            ← Выход
          </button>
        </div>

        <div className="card" style={{ padding: '16px', marginBottom: '24px', fontSize: '14px' }}>
          <div style={{ marginBottom: '8px', color: '#ffffff' }}>
            <strong>🎮 Код комнаты:</strong> <span style={{ color: '#60a5fa' }}>{roomId}</span>
          </div>
          <div style={{ color: '#ffffff' }}>
            <strong>👥 Участников:</strong> {participants.length}
            {allReady && <span style={{ marginLeft: '8px', color: '#10b981', fontWeight: 'bold' }}>✓ Все готовы</span>}
          </div>
        </div>

        <h2 style={{ fontSize: '18px', marginBottom: '16px', color: '#ffffff', fontWeight: '700' }}>Участники</h2>
        
        <div style={{ marginBottom: '24px' }}>
          {participants.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '32px',
              color: '#64748b',
              fontSize: '14px',
            }}>
              Ожидание участников...
            </div>
          ) : (
            participants.map(p => (
              <div
                key={p.userId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px',
                  border: '2px solid ' + (p.ready ? '#10b981' : '#334155'),
                  borderRadius: '8px',
                  marginBottom: '10px',
                  background: p.ready ? 'linear-gradient(135deg, #064e3b, #065f46)' : '#0a3d52',
                }}
              >
                <div>
                  <div style={{ fontWeight: '700', marginBottom: '4px', color: '#ffffff', fontSize: '16px' }}>
                    {p.userId.startsWith('bot-') && '🤖 '}
                    {p.login}
                    {p.userId === userId && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#60a5fa' }}>(вы)</span>}
                  </div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>{p.teamName}</div>
                </div>
                <div style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '700',
                  background: p.ready ? '#10b981' : '#475569',
                  color: 'white',
                }}>
                  {p.ready ? '✓ Готов' : 'Не готов'}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            {!isAdmin && (
              <button onClick={toggleReady} className="btn btn-primary" style={{ flex: 1 }}>
                {myReady ? '✓ Готов' : 'Отметить готовность'}
              </button>
            )}

            {isAdmin && (
              <button onClick={startDraft} disabled={!canStart} className="btn btn-primary" style={{ flex: 1 }}>
                {canStart ? '🏒 Начать драфт' : `Нужно минимум 2 участника (${participants.length}/2)`}
              </button>
            )}
          </div>

          {isAdmin && (
            <button onClick={() => addBots(3)} className="btn btn-secondary">🤖 Добавить 3 ботов (для тестирования)</button>
          )}
        </div>

        {isAdmin && (
          <div className="alert alert-info" style={{ marginTop: '16px' }}>
            🔑 Вы администратор. Можете запустить драфт когда все будут готовы.
          </div>
        )}
      </div>
    </div>
  );
}
