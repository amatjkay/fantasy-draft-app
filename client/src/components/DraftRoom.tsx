import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  eligiblePositions?: string[];
  capHit: number;
  team: string;
  stats: { games: number; goals: number; assists: number; points: number };
  draftedBy: string | null;
}

interface MyTeam {
  picks: Player[];
  capSpent: number;
  capRemaining: number;
  slots: { position: string; filled: boolean; player?: Player }[];
}

interface DraftState {
  started: boolean;
  completed: boolean;
  pickIndex: number;
  round: number;
  activeUserId: string | null;
  timerRemainingMs: number;
  picks: Array<{ userId: string; playerId: string; autopick: boolean }>;
  paused?: boolean;
}

interface Props {
  roomId: string;
  userId: string;
  onExit: () => void;
  onNavigateToTeam?: () => void;
}

export function DraftRoom({ roomId, userId, onExit, onNavigateToTeam }: Props) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [myTeam, setMyTeam] = useState<MyTeam>({ picks: [], capSpent: 0, capRemaining: 95500000, slots: [] });
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'points' | 'capHit' | 'value'>('value');
  const [notification, setNotification] = useState<string>('');
  const socketRef = useRef<Socket | null>(null);
  const [reconnectInfo, setReconnectInfo] = useState<{ userId: string; endsAt: number } | null>(null);
  const [reconnectSeconds, setReconnectSeconds] = useState<number>(0);

  useEffect(() => {
    // Connect to server
    const socket = io('http://localhost:3001', { withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[DraftRoom] Socket connected');
      console.log('[DraftRoom] Joining room:', { roomId, userId });
      socket.emit('draft:join', { roomId, userId });
    });

    socket.on('draft:state', (state: DraftState) => {
      console.log('[DraftRoom] Received draft:state:', state);
      setDraftState(state);
      // Clear reconnect banner when draft resumes
      if (!state.paused) {
        setReconnectInfo(null);
        setReconnectSeconds(0);
      }
      
      // Trigger quick pick for bots (5 seconds)
      if (state.started && state.activeUserId?.startsWith('bot-')) {
        console.log('[DraftRoom] Bot turn detected, triggering quick pick in 5s:', state.activeUserId);
        // Tell server to make bot pick in 5 seconds
        setTimeout(() => {
          socket.emit('bot:quickpick', { roomId, userId: state.activeUserId });
        }, 5000);
      }
      
      if (state.activeUserId === userId) {
        showNotification('Ваш ход!');
      }
      // Reload players and team on state change
      loadPlayers();
      loadMyTeam();
    });

    socket.on('draft:reconnect_wait', (payload: { roomId: string; userId: string; graceMs: number }) => {
      console.log('[DraftRoom] Received draft:reconnect_wait:', payload);
      const endsAt = Date.now() + (payload.graceMs || 60000);
      setReconnectInfo({ userId: payload.userId, endsAt });
    });

    socket.on('player:reconnected', (payload: { roomId: string; userId: string }) => {
      console.log('[DraftRoom] Received player:reconnected:', payload);
      setReconnectInfo(null);
      setReconnectSeconds(0);
    });

    socket.on('draft:timer', (data: { timerRemainingMs: number; activeUserId: string }) => {
      console.log('[DraftRoom] Timer tick:', Math.ceil(data.timerRemainingMs / 1000) + 's');
      setDraftState(prev => prev ? { ...prev, timerRemainingMs: data.timerRemainingMs } : prev);
    });

    socket.on('draft:completed', (data: { roomId: string; finalState: any }) => {
      console.log('[DraftRoom] Draft completed!', data);
      showNotification('🏆 Драфт завершён! Все команды укомплектованы!');
      // Reload final state
      loadPlayers();
      loadMyTeam();
    });

    socket.on('draft:autopick', async (data: { pick: { userId: string; playerId: string } }) => {
      console.log('[DraftRoom] Autopick event:', data.pick);
      
      // Reload data first to get updated player info
      await loadPlayers();
      await loadMyTeam();
      
      // Then show notification with fresh data
      const userName = data.pick.userId.startsWith('bot-') ? '🤖 Бот' : 'Игрок';
      const playerId = data.pick.playerId;
      
      // Fetch player info from server for accurate notification
      try {
        const res = await fetch('http://localhost:3001/api/players');
        const data2 = await res.json();
        const player = data2.players?.find((p: any) => p.id === playerId);
        
        if (data.pick.userId === userId) {
          showNotification('⚡ Автопик! Время истекло.');
        } else if (player) {
          showNotification(`${userName} выбрал: ${player.firstName} ${player.lastName} (${player.position})`);
        } else {
          showNotification(`${userName} сделал пик`);
        }
      } catch (err) {
        console.error('[autopick notification] Error:', err);
        showNotification(`${userName} сделал пик`);
      }
    });

    // Load players and team
    loadPlayers();
    loadMyTeam();

    return () => {
      socket.disconnect();
    };
  }, [roomId, userId]);

  // Countdown for reconnect banner
  useEffect(() => {
    if (!reconnectInfo) return;
    const id = setInterval(() => {
      const sec = Math.max(0, Math.ceil((reconnectInfo.endsAt - Date.now()) / 1000));
      setReconnectSeconds(sec);
      if (sec <= 0) {
        clearInterval(id);
      }
    }, 250);
    return () => clearInterval(id);
  }, [reconnectInfo]);

  const loadPlayers = async () => {
    const res = await fetch('http://localhost:3001/api/players', { credentials: 'include' });
    const data = await res.json();
    setPlayers(data.players || []);
  };

  const loadMyTeam = async () => {
    const res = await fetch('http://localhost:3001/api/team', { credentials: 'include' });
    const data = await res.json();
    console.log('[DraftRoom] loadMyTeam response:', data);
    if (data.team) {
      // API now returns picks as full player objects in data.team.picks
      const picks = data.team.picks || data.players || [];
      const capSpent = picks.reduce((sum: number, p: Player) => sum + p.capHit, 0);
      // Prefer server-provided explicit slots with assignments if present
      let slots: { position: string; filled: boolean; player?: Player }[] = [];
      if (Array.isArray(data.team.slots)) {
        const byId: Record<string, Player> = {};
        for (const p of picks) byId[p.id] = p;
        slots = data.team.slots.map((s: { position: string; playerId?: string | null }) => ({
          position: s.position,
          filled: !!s.playerId,
          player: s.playerId ? byId[s.playerId] : undefined,
        }));
      } else {
        // Fallback: derive from picks (legacy)
        const defensemen = picks.filter((p: Player) => p.position === 'D');
        slots = [
          { position: 'C', filled: picks.some((p: Player) => p.position === 'C') },
          { position: 'LW', filled: picks.some((p: Player) => p.position === 'LW') },
          { position: 'RW', filled: picks.some((p: Player) => p.position === 'RW') },
          { position: 'D', filled: defensemen.length >= 1 },
          { position: 'D', filled: defensemen.length >= 2 },
          { position: 'G', filled: picks.some((p: Player) => p.position === 'G') },
        ];
      }
      setMyTeam({ picks, capSpent, capRemaining: 95500000 - capSpent, slots });
    }
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  };

  const makePick = async (playerId: string) => {
    console.log('[DraftRoom] Making pick:', { roomId, playerId, userId });
    try {
      const res = await fetch('http://localhost:3001/api/draft/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId, playerId }),
      });
      const data = await res.json();
      console.log('[DraftRoom] Pick response:', { status: res.status, data });
      if (res.ok) {
        showNotification('Игрок выбран!');
        loadPlayers();
        loadMyTeam();
      } else {
        console.error('[DraftRoom] Pick failed:', data);
        showNotification(`Ошибка: ${data.error}`);
      }
    } catch (err) {
      console.error('[DraftRoom] Pick error:', err);
      showNotification('Ошибка сети');
    }
  };

  const filteredPlayers = players
    .filter(p => !p.draftedBy)
    .filter(p => positionFilter === 'ALL' || p.position === positionFilter)
    .filter(p => {
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      return name.includes(searchTerm.toLowerCase());
    })
    .sort((a, b) => {
      if (sortBy === 'points') return b.stats.points - a.stats.points;
      if (sortBy === 'capHit') return b.capHit - a.capHit;
      // value = points per million
      const valA = a.stats.points / (a.capHit / 1000000);
      const valB = b.stats.points / (b.capHit / 1000000);
      return valB - valA;
    });

  const isMyTurn = draftState?.activeUserId === userId;
  const timerSec = Math.ceil((draftState?.timerRemainingMs || 0) / 1000);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #053950 0%, #072338 100%)',
      padding: '20px',
    }}>
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
      }}>
        <h1 style={{ margin: 0, color: '#fff', fontSize: '28px', fontWeight: 'bold' }}>Fantasy Draft</h1>
        <button
          onClick={() => {
            const confirmed = confirm(
              '⚠️ Вы уверены что хотите выйти из драфта?\n\n' +
              'Драфт продолжится без вас.\n' +
              'Вы сможете вернуться перезагрузив страницу (F5).'
            );
            if (confirmed) {
              onExit();
            }
          }}
          style={{
            padding: '10px 20px',
            background: 'linear-gradient(135deg, #2196F3, #1976D2)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '14px',
            boxShadow: '0 2px 8px rgba(33, 150, 243, 0.3)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
          ← Выход в Лобби
        </button>
      </div>

      {/* Notification - Center Top */}
      {notification && (
        <div data-testid="notification" style={{
          position: 'fixed',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #4CAF50, #45a049)',
          color: 'white',
          padding: '16px 32px',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(76, 175, 80, 0.4)',
          zIndex: 2000,
          fontSize: '16px',
          fontWeight: '700',
          minWidth: '300px',
          textAlign: 'center',
          animation: 'slideDown 0.3s ease-out',
        }}>
          {notification}
        </div>
      )}

      {/* Reconnect Banner - Center Top */}
      {reconnectInfo && !draftState?.completed && (
        <div data-testid="reconnect-banner" style={{
          position: 'fixed',
          top: '125px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #F59E0B, #D97706)',
          color: '#111827',
          padding: '14px 28px',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(245, 158, 11, 0.35)',
          zIndex: 1999,
          fontSize: '15px',
          fontWeight: '700',
          minWidth: '320px',
          textAlign: 'center',
        }}>
          <span style={{ marginRight: 8 }}>🔌 Ожидаем переподключение игрока…</span>
          <span>осталось {reconnectSeconds}s</span>
        </div>
      )}

      {/* Status Bar */}
      {!draftState?.completed && (
      <div style={{
        background: isMyTurn ? 'linear-gradient(135deg, #4CAF50, #45a049)' : 'linear-gradient(135deg, #555, #333)',
        color: 'white',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      }}>
        <div data-testid="turn-status" style={{ fontSize: '18px', fontWeight: 'bold' }}>
          {isMyTurn ? '🎯 ВАШ ХОД' : `⏳ Ход: ${draftState?.activeUserId?.slice(0, 8) || '...'}`}
        </div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
          ⏱ {timerSec}s
        </div>
        <div>
          Раунд {draftState?.round || 1} • Пик #{draftState?.pickIndex || 0}
        </div>
      </div>
      )}



      {/* Draft Completed Banner */}
      {draftState?.completed && (
        <div style={{
          background: 'linear-gradient(135deg, #FFD700, #FFA500)',
          color: '#000',
          padding: '20px 24px',
          borderRadius: '8px',
          marginBottom: '20px',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(255, 215, 0, 0.4)',
        }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: '700' }}>
            🏆 Драфт завершён!
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '16px' }}>
            Все команды укомплектованы! Просмотрите свою команду и статистику.
          </p>
          <button
            onClick={() => {
              if (onNavigateToTeam) {
                onNavigateToTeam();
              } else {
                alert('🚧 Навигация не настроена');
              }
            }}
            style={{
              padding: '12px 32px',
              background: 'linear-gradient(135deg, #2196F3, #1976D2)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(33, 150, 243, 0.3)',
            }}
          >
            📋 Посмотреть мою команду
          </button>
        </div>
      )}

      {/* Status Bar */}
      {!draftState?.completed && (
      <div style={{
        background: isMyTurn ? 'linear-gradient(135deg, #4CAF50, #45a049)' : 'linear-gradient(135deg, #555, #333)',
        color: 'white',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
          {isMyTurn ? '🎯 ВАШ ХОД' : `⏳ Ход: ${draftState?.activeUserId?.slice(0, 8) || '...'}`}
        </div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
          ⏱ {timerSec}s
        </div>
        <div>
          Раунд {draftState?.round || 1} • Пик #{draftState?.pickIndex || 0}
        </div>
      </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
        {/* Left: Players Table */}
        <div style={{ background: '#1A1D23', border: '2px solid #334155', borderRadius: '8px', padding: '20px' }}>
          <h2 style={{ marginTop: 0, color: '#ffffff', fontWeight: '700', fontSize: '20px' }}>Доступные игроки</h2>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Поиск по имени..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="input"
              style={{ 
                flex: 1, 
                minWidth: '200px', 
                padding: '10px', 
                border: '2px solid #334155', 
                borderRadius: '6px',
                background: '#0a3d52',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '500'
              }}
            />
            <select 
              value={positionFilter} 
              onChange={e => setPositionFilter(e.target.value)} 
              className="select"
              style={{ 
                padding: '10px', 
                border: '2px solid #334155', 
                borderRadius: '6px',
                background: '#0a3d52',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              <option value="ALL">Все позиции</option>
              <option value="C">C</option>
              <option value="LW">LW</option>
              <option value="RW">RW</option>
              <option value="D">D</option>
              <option value="G">G</option>
            </select>
            <select 
              value={sortBy} 
              onChange={e => setSortBy(e.target.value as any)} 
              className="select"
              style={{ 
                padding: '10px', 
                border: '2px solid #334155', 
                borderRadius: '6px',
                background: '#0a3d52',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              <option value="value">Value (Points/$)</option>
              <option value="points">Очки</option>
              <option value="capHit">Зарплата</option>
            </select>
          </div>

          {/* Table */}
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#0a3d52' }}>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #334155', color: '#ffffff', fontWeight: '700' }}>Игрок</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #334155', color: '#ffffff', fontWeight: '700' }}>Поз</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #334155', color: '#ffffff', fontWeight: '700' }}>Команда</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #334155', color: '#ffffff', fontWeight: '700' }}>Очки</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #334155', color: '#ffffff', fontWeight: '700' }}>Зарплата</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #334155', color: '#ffffff', fontWeight: '700' }}>Value</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #334155', color: '#ffffff', fontWeight: '700' }}>Действие</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.slice(0, 100).map(p => {
                  const value = (p.stats.points / (p.capHit / 1000000)).toFixed(1);
                  const eligible = (Array.isArray(p.eligiblePositions) && p.eligiblePositions.length ? p.eligiblePositions : [p.position]);
                  const fitsCapAndSlot = (myTeam.capRemaining >= p.capHit) && myTeam.slots.some(s => eligible.includes(s.position) && !s.filled);
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #334155', background: fitsCapAndSlot ? '#0a3d52' : '#1e293b' }}>
                      <td style={{ padding: '10px', color: '#ffffff', fontWeight: '600', fontSize: '14px' }}>{p.firstName} {p.lastName}</td>
                      <td style={{ padding: '10px', textAlign: 'center', fontWeight: '700', color: '#60a5fa', fontSize: '14px' }}>{eligible.join('/')}</td>
                      <td style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontWeight: '600' }}>{p.team}</td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#10b981', fontWeight: '700', fontSize: '14px' }}>{p.stats.points}</td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#ef4444', fontWeight: '600' }}>${(p.capHit / 1000000).toFixed(1)}M</td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#60a5fa', fontWeight: '700', fontSize: '14px' }}>{value}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button
                          onClick={() => makePick(p.id)}
                          disabled={!isMyTurn || !fitsCapAndSlot || !!draftState?.paused}
                          style={{
                            padding: '8px 16px',
                            background: (isMyTurn && fitsCapAndSlot && !draftState?.paused) ? 'linear-gradient(135deg, #10b981, #059669)' : '#475569',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: (isMyTurn && fitsCapAndSlot && !draftState?.paused) ? 'pointer' : 'not-allowed',
                            fontSize: '13px',
                            fontWeight: '700',
                            boxShadow: (isMyTurn && fitsCapAndSlot && !draftState?.paused) ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none',
                          }}
                        >
                          Pick
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: My Team */}
        <div style={{ background: '#1A1D23', border: '2px solid #334155', borderRadius: '8px', padding: '20px' }}>
          <h2 style={{ marginTop: 0, color: '#ffffff', fontWeight: '700', fontSize: '20px' }}>Моя команда</h2>

          {/* Cap Info */}
          <div style={{ background: '#0a3d52', padding: '14px', borderRadius: '6px', marginBottom: '16px', border: '2px solid #334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ color: '#ffffff', fontWeight: '600', fontSize: '14px' }}>Потрачено:</span>
              <strong style={{ color: '#ef4444', fontSize: '16px' }}>${(myTeam.capSpent / 1000000).toFixed(1)}M</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#ffffff', fontWeight: '600', fontSize: '14px' }}>Осталось:</span>
              <strong style={{ color: myTeam.capRemaining < 10000000 ? '#ef4444' : '#10b981', fontSize: '16px' }}>
                ${(myTeam.capRemaining / 1000000).toFixed(1)}M
              </strong>
            </div>
          </div>

          {/* Roster Slots */}
          <h3 style={{ fontSize: '16px', marginBottom: '12px', color: '#ffffff', fontWeight: '700' }}>
            Состав ({myTeam.picks.length}/6)
          </h3>
          {(() => {
            // Map players to slots properly (especially for multiple D positions)
            const usedPlayerIds = new Set<string>();
            return myTeam.slots.map((slot, i) => {
              // For each slot, find a player that matches position and hasn't been used yet
              const player = myTeam.picks.find(p => 
                p.position === slot.position && !usedPlayerIds.has(p.id)
              );
              if (player) usedPlayerIds.add(player.id);
              
              return (
              <div key={i} style={{
                padding: '12px',
                border: '2px solid ' + (slot.filled ? '#10b981' : '#334155'),
                borderRadius: '6px',
                marginBottom: '10px',
                background: slot.filled ? 'linear-gradient(135deg, #064e3b, #065f46)' : '#1e293b',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '15px', color: '#ffffff' }}>{slot.position}</span>
                  {player ? (
                    <div style={{ fontSize: '13px', textAlign: 'right' }}>
                      <div style={{ fontWeight: '600', color: '#ffffff' }}>{player.firstName} {player.lastName}</div>
                      <div style={{ color: '#60a5fa', fontWeight: '600' }}>${(player.capHit / 1000000).toFixed(1)}M</div>
                    </div>
                  ) : (
                    <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>Пусто</span>
                  )}
                </div>
              </div>
            );
          });
          })()}

          {/* Draft History - All Picks */}
          <h3 style={{ fontSize: '16px', marginTop: '20px', marginBottom: '12px', color: '#ffffff', fontWeight: '700' }}>
            История пиков ({draftState?.picks?.length || 0})
          </h3>
          <div style={{ maxHeight: '220px', overflowY: 'auto', border: '2px solid #334155', borderRadius: '6px', background: '#1e293b' }}>
            {draftState?.picks && draftState.picks.length > 0 ? (
              // Show all picks in reverse order (most recent first)
              [...draftState.picks].reverse().map((pick, i) => {
                const player = players.find(p => p.id === pick.playerId);
                const isMyPick = pick.userId === userId;
                const isBot = pick.userId.startsWith('bot-');
                const pickNumber = draftState.picks.length - i;
                
                return (
                  <div key={i} style={{ 
                    padding: '10px 12px', 
                    borderBottom: i < draftState.picks.length - 1 ? '1px solid #334155' : 'none', 
                    fontSize: '13px',
                    background: isMyPick ? 'linear-gradient(135deg, #064e3b, #065f46)' : (i % 2 === 0 ? '#0a3d52' : '#1e293b'),
                    borderLeft: isMyPick ? '3px solid #10b981' : 'none'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>
                        Пик #{pickNumber}
                      </span>
                      <span style={{ fontSize: '11px', color: isMyPick ? '#60a5fa' : (isBot ? '#f59e0b' : '#94a3b8'), fontWeight: '700' }}>
                        {isMyPick ? 'ВЫ' : (isBot ? '🤖 БОТ' : 'ИГРОК')}
                      </span>
                    </div>
                    <div style={{ fontWeight: '700', color: '#ffffff', fontSize: '14px' }}>
                      {player ? `${player.firstName} ${player.lastName}` : 'Loading...'}
                    </div>
                    {player && (
                      <div style={{ color: '#60a5fa', fontSize: '12px', fontWeight: '600', marginTop: '2px' }}>
                        {player.position} • ${(player.capHit / 1000000).toFixed(1)}M • {player.stats.points} pts
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: '#757575' }}>
                Пики ещё не сделаны
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
