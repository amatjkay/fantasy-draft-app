import { useState, useEffect } from 'react';
import { socketService } from '../services/socketService';
import { apiService } from '../services/apiService';

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
}

export function DraftRoom({ roomId, userId, onExit }: Props) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [myTeam, setMyTeam] = useState<MyTeam>({ picks: [], capSpent: 0, capRemaining: 95500000, slots: [] });
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'points' | 'capHit' | 'value'>('value');
  const [notification, setNotification] = useState<string>('');
  const [reconnectInfo, setReconnectInfo] = useState<{ userId: string; endsAt: number } | null>(null);
  const [reconnectSeconds, setReconnectSeconds] = useState<number>(0);

  useEffect(() => {
    // Подключаемся к серверу и присоединяемся к комнате
    socketService.connect(roomId, userId);
    
    console.log('[DraftRoom] Socket connected');
    console.log('[DraftRoom] Joining room:', { roomId, userId });

    socketService.on('draft:state', (state: DraftState) => {
      console.log('[DraftRoom] Received draft:state:', state);

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
          socketService.emit('bot:quickpick', { roomId, userId: state.activeUserId });
        }, 5000);
      }
      
      setDraftState(prev => {
        if (state.activeUserId === userId && prev?.activeUserId !== userId) {
          showNotification('Ваш ход!');
        }
        return state;
      });
      // Reload players and team on state change
      loadPlayers();
      loadMyTeam();
    });

    socketService.on('draft:reconnect_wait', (payload: { roomId: string; userId: string; graceMs: number }) => {
      console.log('[DraftRoom] Received draft:reconnect_wait:', payload);
      const endsAt = Date.now() + (payload.graceMs || 60000);
      setReconnectInfo({ userId: payload.userId, endsAt });
    });

    socketService.on('player:reconnected', (payload: { roomId: string; userId: string }) => {
      console.log('[DraftRoom] Received player:reconnected:', payload);
      setReconnectInfo(null);
      setReconnectSeconds(0);
    });

    socketService.on('draft:timer', (data: { timerRemainingMs: number; activeUserId: string }) => {
      console.log('[DraftRoom] Timer tick:', Math.ceil(data.timerRemainingMs / 1000) + 's');
      setDraftState(prev => prev ? { ...prev, timerRemainingMs: data.timerRemainingMs } : prev);
    });

    socketService.on('draft:completed', (data: { roomId: string; finalState: any }) => {
      console.log('[DraftRoom] Draft completed!', data);
      showNotification('🏆 Драфт завершён! Все команды укомплектованы!');
      // Reload final state
      loadPlayers();
      loadMyTeam();
    });

    socketService.on('draft:autopick', async (data: { pick: { userId: string; playerId: string } }) => {
      console.log('[DraftRoom] Autopick event:', data.pick);
      
      // Reload data first to get updated player info
      await loadPlayers();
      await loadMyTeam();
      
      // Then show notification with fresh data
      const userName = data.pick.userId.startsWith('bot-') ? '🤖 Бот' : 'Игрок';
      const playerId = data.pick.playerId;
      
      // Fetch player info from server for accurate notification
      try {
        const allPlayers = await apiService.getPlayers();
        const player = allPlayers?.find((p: any) => p.id === playerId);
        
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
      // Отключаем все обработчики и соединение при размонтировании компонента
      socketService.disconnect();
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
    const players = await apiService.getPlayers();
    if (players) {
      setPlayers(players);
    }
  };

  const loadMyTeam = async () => {
    const team = await apiService.getTeam();
    console.log('[DraftRoom] loadMyTeam response:', team);
    if (team) {
      // API now returns picks as full player objects in team.picks
      const picks = team.picks || team.players || [];
      const capSpent = picks.reduce((sum: number, p: Player) => sum + p.capHit, 0);
      // Prefer server-provided explicit slots with assignments if present
      let slots: { position: string; filled: boolean; player?: Player }[] = [];
      if (Array.isArray(team.slots)) {
        const byId: Record<string, Player> = {};
        for (const p of picks) byId[p.id] = p;
        slots = team.slots.map((s: { position: string; playerId?: string | null }) => ({
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
    
    const result = await apiService.pickPlayer(roomId, playerId);
    
    if (result.success) {
      showNotification('Игрок выбран!');
      loadPlayers();
      loadMyTeam();
    } else {
      console.error('[DraftRoom] Pick failed:', result.error);
      showNotification(`Ошибка: ${result.error || 'неизвестная ошибка'}`);
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
              alert('🚧 Навигация на страницу команды в разработке');
            }}
            style={{
              padding: '12px 32px',
              background: 'linear-gradient(135deg, #1E88E5, #1565C0)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '16px',
              boxShadow: '0 2px 8px rgba(30, 136, 229, 0.3)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            Перейти к команде
          </button>
        </div>
      )}

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '20px', marginTop: '20px' }}>
        {/* Left: Player List */}
        <div>
          <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '10px' }}>Доступные игроки</h2>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input
              type="text"
              placeholder="Поиск по имени..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1, padding: '8px' }}
            />
            <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} style={{ padding: '8px' }}>
              <option value="ALL">Все</option>
              <option value="C">C</option>
              <option value="LW">LW</option>
              <option value="RW">RW</option>
              <option value="D">D</option>
              <option value="G">G</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ padding: '8px' }}>
              <option value="value">Value</option>
              <option value="points">Points</option>
              <option value="capHit">Cap Hit</option>
            </select>
          </div>
          <div style={{ height: '60vh', overflowY: 'auto', border: '2px solid #334155', borderRadius: '6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#072338' }}>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8' }}>Игрок</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8' }}>Поз.</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8' }}>Очки</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8' }}>Зарплата</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8' }}>Value</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((player) => (
                  <tr key={player.id}>
                    <td style={{ padding: '10px 12px', borderTop: '1px solid #334155' }}>{player.firstName} {player.lastName}</td>
                    <td style={{ padding: '10px 12px', borderTop: '1px solid #334155' }}>{player.position}</td>
                    <td style={{ padding: '10px 12px', borderTop: '1px solid #334155' }}>{player.stats.points}</td>
                    <td style={{ padding: '10px 12px', borderTop: '1px solid #334155' }}>${player.capHit.toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', borderTop: '1px solid #334155' }}>{(player.stats.points / (player.capHit / 1000000)).toFixed(2)}</td>
                    <td style={{ padding: '10px 12px', borderTop: '1px solid #334155' }}>
                      <button 
                        disabled={!isMyTurn}
                        onClick={() => makePick(player.id)}
                      >
                        Pick
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: My Team */}
        <div>
          <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '10px' }}>Моя команда</h2>
          <div style={{ marginBottom: '10px', color: '#fff' }}>
            Cap: ${myTeam.capSpent.toLocaleString()} / $95,500,000
          </div>
          <div style={{ height: '70vh', overflowY: 'auto' }}>
            {myTeam.slots.map((slot, i) => {
              const player = slot.player;
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
            })}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
