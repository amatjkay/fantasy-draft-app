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
  userRole: 'user' | 'admin';
  onStartDraft: () => void;
  onExit: () => void;
}

export function Lobby({ roomId, userId, userLogin, userRole, onStartDraft, onExit }: Props) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myReady, setMyReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminId, setAdminId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [draftStarting, setDraftStarting] = useState(false);
  const [myDraftPosition, setMyDraftPosition] = useState<number | null>(null);
  const [totalParticipants, setTotalParticipants] = useState<number>(0);
  const [pickOrder, setPickOrder] = useState<string[]>([]);
  const [assignedRoomId, setAssignedRoomId] = useState<string>(roomId);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    console.log('[Lobby] Initializing socket...', { roomId, userId, userLogin });
    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
    const socket = io(SOCKET_URL, { withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Lobby] Socket connected!');
      console.log('[Lobby] Emitting lobby:join', { roomId, userId, login: userLogin });
      socket.emit('lobby:join', { roomId, userId, login: userLogin });
    });

    socket.on('lobby:roomAssigned', ({ roomId: activeRoomId }: { roomId: string }) => {
      console.log('[Lobby] Assigned to active lobby room:', activeRoomId);
      setAssignedRoomId(activeRoomId);
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
      setAdminId(data.adminId);
    });

    socket.on('lobby:ready', (data: { userId: string; ready: boolean }) => {
      setParticipants(prev => prev.map(p => p.userId === data.userId ? { ...p, ready: data.ready } : p));
    });

    socket.on('lobby:start', () => {
      onStartDraft();
    });

    socket.on('lobby:error', (payload: { message: string }) => {
      console.error('[Lobby] lobby:error', payload);
      setError(payload.message || 'Ошибка лобби');
      setTimeout(() => setError(''), 4000);
    });

    socket.on('lobby:kicked', ({ roomId: kickedRoomId }: { roomId: string }) => {
      console.warn('[Lobby] You were kicked from lobby:', kickedRoomId);
      alert('Вы были исключены из лобби администратором.');
      onExit();
    });

    socket.on('draft:starting', ({ countdown: serverCountdown, pickOrder: draftOrder, message }) => {
      console.log('[Lobby] Draft starting!', { countdown: serverCountdown, pickOrder: draftOrder, message });
      setDraftStarting(true);
      setCountdown(serverCountdown);
      setPickOrder(draftOrder || []);
      
      let remaining = serverCountdown;
      const interval = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(interval);
          setDraftStarting(false);
        }
      }, 1000);
    });

    socket.on('draft:yourPosition', ({ position, totalParticipants: total, message }) => {
      console.log('[Lobby] Your draft position:', { position, total, message });
      setMyDraftPosition(position);
      setTotalParticipants(total);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId, userId, userLogin]);

  const toggleReady = () => {
    const newReady = !myReady;
    setMyReady(newReady);
    const rid = assignedRoomId || roomId;
    socketRef.current?.emit('lobby:ready', { roomId: rid, userId, ready: newReady });
  };

  const addBots = (count: number) => {
    const rid = assignedRoomId || roomId;
    socketRef.current?.emit('lobby:addBots', { roomId: rid, count });
  };

  const removeAllBots = () => {
    const bots = participants.filter(p => p.userId.startsWith('bot-'));
    bots.forEach(b => {
      const rid = assignedRoomId || roomId;
      socketRef.current?.emit('lobby:kick', { roomId: rid, userId: b.userId });
    });
  };

  const kickUser = (targetUserId: string) => {
    const rid = assignedRoomId || roomId;
    socketRef.current?.emit('lobby:kick', { roomId: rid, userId: targetUserId });
  };

  const startDraft = () => {
    const rid = assignedRoomId || roomId;
    socketRef.current?.emit('lobby:start', { roomId: rid });
  };

  const allReady = participants.length > 0 && participants.every(p => p.ready);
  const canStart = isAdmin && participants.length >= 2;

  if (countdown !== null && countdown > 0) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <h1 className="text-5xl font-bold">Драфт начинается через...</h1>
        <p className="text-9xl font-mono mt-4">{countdown}</p>
      </div>
    );
  }

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
          <div style={{ color: '#ffffff' }}>
            <strong>👥 Участников:</strong> <span data-testid="participants-count">{participants.length}</span>
            {allReady && <span style={{ marginLeft: '8px', color: '#10b981', fontWeight: 'bold' }}>✓ Все готовы</span>}
            {/* e2e helper flag */}
            <span data-testid="is-admin-flag" style={{ display: 'none' }}>{isAdmin ? '1' : '0'}</span>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '16px' }}>{error}</div>
        )}

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                  {isAdmin && p.userId !== adminId && (
                    <button
                      onClick={() => kickUser(p.userId)}
                      className="btn btn-secondary"
                      title={`Исключить ${p.login}`}
                    >
                      ⛔ Исключить
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Countdown Section */}
        {draftStarting && countdown !== null && (
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '24px',
            borderRadius: '12px',
            textAlign: 'center',
            marginBottom: '20px',
            border: '2px solid #4f46e5',
            boxShadow: '0 8px 32px rgba(79, 70, 229, 0.3)'
          }}>
            <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'white', marginBottom: '12px' }}>
              {countdown}
            </div>
            <div style={{ fontSize: '18px', color: '#e2e8f0', marginBottom: '16px' }}>
              🚀 Драфт начинается!
            </div>
            {myDraftPosition && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.15)',
                padding: '12px 20px',
                borderRadius: '8px',
                fontSize: '16px',
                color: 'white',
                fontWeight: '600'
              }}>
                📋 Вы будете выбирать {myDraftPosition}-м из {totalParticipants}
              </div>
            )}
          </div>
        )}

        {/* Draft Position Info (when not starting) */}
        {!draftStarting && myDraftPosition && (
          <div style={{
            background: '#f8fafc',
            border: '2px solid #e2e8f0',
            padding: '16px',
            borderRadius: '8px',
            textAlign: 'center',
            marginBottom: '16px'
          }}>
            <div style={{ fontSize: '16px', color: '#475569', fontWeight: '600' }}>
              🎯 Ваша позиция в драфте: <strong>{myDraftPosition} из {totalParticipants}</strong>
            </div>
          </div>
        )}

        {/* Snake Draft Order Visualization */}
        {pickOrder.length > 0 && (
          <div style={{
            background: '#ffffff',
            border: '2px solid #e5e7eb',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <div style={{ 
              fontSize: '18px', 
              fontWeight: 'bold', 
              color: '#374151', 
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              🐍 Snake Draft Order
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))', 
              gap: '8px',
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              {pickOrder.map((participantId, index) => {
                const participant = participants.find(p => p.userId === participantId);
                const isCurrentUser = participantId === userId;
                const position = index + 1;
                
                return (
                  <div
                    key={`${participantId}-${index}`}
                    style={{
                      background: isCurrentUser ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : '#f3f4f6',
                      color: isCurrentUser ? 'white' : '#374151',
                      padding: '12px 8px',
                      borderRadius: '8px',
                      textAlign: 'center',
                      fontSize: '14px',
                      fontWeight: '600',
                      border: isCurrentUser ? '2px solid #1e40af' : '1px solid #d1d5db',
                      boxShadow: isCurrentUser ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
                    }}
                    title={participant?.login || participantId}
                  >
                    <div style={{ fontSize: '16px', marginBottom: '4px' }}>
                      {position}
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      opacity: 0.8,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {participant?.userId.startsWith('bot-') && '🤖'}
                      {participant?.login?.slice(0, 8) || 'Unknown'}
                      {isCurrentUser && ' (You)'}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{
              marginTop: '12px',
              fontSize: '13px',
              color: '#6b7280',
              textAlign: 'center'
            }}>
              🔄 Порядок змейкой: 1→2→3→4, затем 4→3→2→1, и так далее
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            {!isAdmin && (
              <button onClick={toggleReady} className="btn btn-primary" style={{ flex: 1 }} disabled={draftStarting}>
                {myReady ? '✓ Готов' : 'Отметить готовность'}
              </button>
            )}

            {isAdmin && (
              <button data-testid="start-draft-btn" onClick={startDraft} disabled={!canStart || draftStarting} className="btn btn-primary" style={{ flex: 1 }}>
                {draftStarting ? '⏳ Драфт начинается...' : canStart ? '🏒 Начать драфт' : `Нужно минимум 2 участника (${participants.length}/2)`}
              </button>
            )}
          </div>

          {isAdmin && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button data-testid="add-1-bot-btn" onClick={() => addBots(1)} className="btn btn-secondary">🤖 Добавить 1 бота</button>
              <button data-testid="add-bots-btn" onClick={() => addBots(3)} className="btn btn-secondary">🤖 Добавить 3 бота</button>
              <button data-testid="remove-all-bots-btn" onClick={removeAllBots} className="btn btn-danger">🧹 Удалить всех ботов</button>
            </div>
          )}
        </div>

        {isAdmin && (
          <div data-testid="admin-banner" className="alert alert-info" style={{ marginTop: '16px' }}>
            🔑 Вы администратор. Можете запустить драфт когда все будут готовы.
          </div>
        )}
      </div>
    </div>
  );
}
