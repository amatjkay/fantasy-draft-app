import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { DraftRoom } from './components/DraftRoom';

type Json = Record<string, any>;

const useApi = () => {
  const baseUrl = useMemo(() => (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, ''), []);

  const request = async (path: string, init?: RequestInit) => {
    const resp = await fetch(`${baseUrl}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    const text = await resp.text();
    try { return { status: resp.status, body: JSON.parse(text) as Json }; } catch { return { status: resp.status, body: text }; }
  };

  return { baseUrl, request };
};

export default function App() {
  const { request, baseUrl } = useApi();

  const [login, setLogin] = useState('demo');
  const [password, setPassword] = useState('pass1234');
  const [teamName, setTeamName] = useState('Demo Team');
  const [logo, setLogo] = useState('default-logo');
  const [userId, setUserId] = useState<string | null>(null);

  const [players, setPlayers] = useState<any[]>([]);
  const [draftState, setDraftState] = useState<any | null>(null);
  const [myTeam, setMyTeam] = useState<any | null>(null);

  const [roomId, setRoomId] = useState<string>('');
  const [pickOrder, setPickOrder] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('player-1');
  const [stateJson, setStateJson] = useState<string>('');
  const [log, setLog] = useState<string>('');
  const socketRef = useRef<Socket | null>(null);
  const [presence, setPresence] = useState<{ roomId: string; users: string[]; count: number } | null>(null);
  const [rooms, setRooms] = useState<any[] | null>(null);
  const [history, setHistory] = useState<any[] | null>(null);
  const [viewMode, setViewMode] = useState<'login' | 'lobby' | 'draft' | 'debug'>('login');
  const [isRegistering, setIsRegistering] = useState(false);

  const appendLog = (msg: string, data?: any) => setLog(l => `${l}\n${new Date().toLocaleTimeString()} | ${msg} ${data ? JSON.stringify(data) : ''}`);

  // Socket.IO setup
  useEffect(() => {
    const s = io(baseUrl, { withCredentials: true });
    socketRef.current = s;
    s.on('connect', () => appendLog('socket:connect', { id: s.id }));
    s.on('draft:state', (st: any) => {
      appendLog('draft:state', { pickIndex: st.pickIndex, activeUserId: st.activeUserId });
      setDraftState(st);
      setStateJson(JSON.stringify(st, null, 2));
    });
    s.on('draft:autopick', (p: any) => appendLog('draft:autopick', p));
    s.on('draft:presence', (p: any) => {
      setPresence(p);
      appendLog('draft:presence', p);
    });
    return () => { s.close(); };
  }, [baseUrl]);

  // auto-join when both roomId and userId known
  useEffect(() => {
    if (socketRef.current && roomId && userId) {
      socketRef.current.emit('draft:join', { roomId, userId });
      appendLog('draft:join(auto)', { roomId, userId });
    }
  }, [roomId, userId]);

  const doRegister = async () => {
    const r = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ login, password, teamName, logo }) });
    appendLog('register', r);
    if (r.status === 201 && typeof r.body === 'object' && (r.body as any).userId) setUserId((r.body as any).userId as string);
  };
  const doLogin = async () => {
    const r = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ login, password }) });
    appendLog('login', r);
    if (r.status === 200 && typeof r.body === 'object' && (r.body as any).userId) setUserId((r.body as any).userId as string);
  };
  const doMe = async () => {
    const r = await request('/api/auth/me');
    appendLog('/me', r);
    if (r.status === 200 && typeof r.body === 'object' && (r.body as any).userId) setUserId((r.body as any).userId as string);
  };

  const loadPlayers = async (query = '') => {
    const r = await request(`/api/players${query}`);
    appendLog('players', r);
    if (r.status === 200 && typeof r.body === 'object' && Array.isArray((r.body as any).players)) setPlayers((r.body as any).players as any[]);
  };

  const startDraft = async () => {
    const id = roomId || `room-${Math.random().toString(36).slice(2)}`;
    setRoomId(id);
    const order = pickOrder.split(',').map(s => s.trim()).filter(Boolean);
    // join socket room immediately for realtime updates
    if (socketRef.current) {
      socketRef.current.emit('draft:join', { roomId: id, userId });
      appendLog('draft:join(before-start)', { roomId: id, userId });
    }
    const r = await request('/api/draft/start', { method: 'POST', body: JSON.stringify({ roomId: id, pickOrder: order, timerSec: 60 }) });
    appendLog('draft:start', r);
    if (r.status === 200 && typeof r.body === 'object' && (r.body as any).draftState) setDraftState((r.body as any).draftState);
  };

  const joinRoom = () => {
    if (!roomId) return;
    if (socketRef.current) {
      socketRef.current.emit('draft:join', { roomId, userId });
      appendLog('draft:join(manual)', { roomId, userId });
    }
  };

  const getRoom = async () => {
    const r = await request(`/api/draft/room?roomId=${encodeURIComponent(roomId)}`);
    appendLog('draft:room', r);
    if (typeof r.body === 'object') {
      setStateJson(JSON.stringify(r.body, null, 2));
      if ((r.body as any).draftState) setDraftState((r.body as any).draftState);
      if ((r.body as any).myTeam) setMyTeam((r.body as any).myTeam);
    }
  };

  const getState = async () => {
    const r = await request(`/api/draft/state?roomId=${encodeURIComponent(roomId)}`);
    appendLog('draft:state', r);
    if (typeof r.body === 'object') {
      setStateJson(JSON.stringify(r.body, null, 2));
      if ((r.body as any).draftState) setDraftState((r.body as any).draftState);
    }
  };

  const loadRooms = async () => {
    const r = await request('/api/draft/rooms');
    appendLog('draft:rooms', r);
    if (r.status === 200 && typeof r.body === 'object' && Array.isArray((r.body as any).rooms)) {
      setRooms((r.body as any).rooms as any[]);
    }
  };

  const loadHistory = async () => {
    if (!roomId) return;
    const r = await request(`/api/draft/history?roomId=${encodeURIComponent(roomId)}`);
    appendLog('draft:history', r);
    if (r.status === 200 && typeof r.body === 'object' && Array.isArray((r.body as any).picks)) {
      setHistory((r.body as any).picks as any[]);
    }
  };

  const makePick = async () => {
    const r = await request('/api/draft/pick', { method: 'POST', body: JSON.stringify({ roomId, playerId }) });
    appendLog('draft:pick', r);
    if (typeof r.body === 'object') {
      setStateJson(JSON.stringify(r.body, null, 2));
      if ((r.body as any).draftState) setDraftState((r.body as any).draftState);
      if ((r.body as any).team) setMyTeam((r.body as any).team);
    }
  };

  const pickPlayer = async (pid: string) => {
    if (!roomId) return;
    setPlayerId(pid);
    const r = await request('/api/draft/pick', { method: 'POST', body: JSON.stringify({ roomId, playerId: pid }) });
    appendLog('draft:pick(row)', r);
    if (typeof r.body === 'object') {
      setStateJson(JSON.stringify(r.body, null, 2));
      if ((r.body as any).draftState) setDraftState((r.body as any).draftState);
      if ((r.body as any).team) setMyTeam((r.body as any).team);
    }
  };

  // ---------------------- UI helpers & derived data ----------------------
  const SALARY_CAP = 95_500_000;
  const ROSTER_SLOTS: Record<string, number> = { C: 1, LW: 1, RW: 1, D: 2, G: 1 };

  const playerById = (id: string) => players.find(p => p.id === id);
  const playerName = (p: any) => `${p.firstName} ${p.lastName}`;
  const teamSalary = myTeam?.salaryTotal || 0;
  const remainingCap = SALARY_CAP - teamSalary;

  const positionCounts = useMemo(() => {
    const counts: Record<string, number> = { C: 0, LW: 0, RW: 0, D: 0, G: 0 };
    if (myTeam?.players) {
      for (const pid of myTeam.players) {
        const p = playerById(pid);
        if (p && counts.hasOwnProperty(p.position)) counts[p.position] += 1;
      }
    }
    return counts;
  }, [myTeam, players]);

  const hasSlotFor = (pos: string) => (positionCounts[pos] || 0) < (ROSTER_SLOTS[pos] || 0);
  const fitsCap = (p: any) => teamSalary + p.capHit <= SALARY_CAP;
  const valuePerM = (p: any) => {
    const pts = p?.stats?.points || 0;
    const capM = (p.capHit || 0) / 1_000_000;
    if (!capM) return 0;
    return +(pts / capM).toFixed(2);
  };

  // Filters/sorts
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);
  const [onlyFitsCap, setOnlyFitsCap] = useState<boolean>(false);
  const [onlyFitsSlot, setOnlyFitsSlot] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [sortKey, setSortKey] = useState<'value' | 'points' | 'cap'>('value');

  const filteredPlayers = useMemo(() => {
    let list = players.slice();
    if (posFilter !== 'ALL') list = list.filter(p => p.position === posFilter);
    if (onlyAvailable) list = list.filter(p => p.draftedBy == null);
    if (onlyFitsCap) list = list.filter(p => fitsCap(p));
    if (onlyFitsSlot) list = list.filter(p => hasSlotFor(p.position));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q));
    }
    if (sortKey === 'value') list.sort((a, b) => valuePerM(b) - valuePerM(a));
    if (sortKey === 'points') list.sort((a, b) => (b?.stats?.points || 0) - (a?.stats?.points || 0));
    if (sortKey === 'cap') list.sort((a, b) => (a.capHit || 0) - (b.capHit || 0));
    return list;
  }, [players, posFilter, onlyAvailable, onlyFitsCap, onlyFitsSlot, search, sortKey, teamSalary, positionCounts]);

  return (
    <div className="container">
      <h1>Fantasy Draft Client</h1>
      <p className="muted">Simple React client for REST API. Use /api/docs for details.</p>

      <section>
        <h2>Auth</h2>
        <div className="grid2">
          <div>
            <label>Login</label>
            <input value={login} onChange={e => setLogin(e.target.value)} />
          </div>
          <div>
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div>
            <label>Team Name</label>
            <input value={teamName} onChange={e => setTeamName(e.target.value)} />
          </div>
          <div>
            <label>Logo</label>
            <input value={logo} onChange={e => setLogo(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <button onClick={doRegister}>Register</button>
          <button onClick={doLogin}>Login</button>
          <button className="secondary" onClick={doMe}>/me</button>
          <span className="tag">user: {userId || '-'}</span>
        </div>
      </section>

      <section>
        <h2>My Team</h2>
        <div className="row">
          <button onClick={() => loadPlayers()}>Load players</button>
          <button className="secondary" onClick={getRoom}>Refresh room</button>
          <button className="secondary" onClick={getState}>Refresh state</button>
          <span className="tag">Cap: ${teamSalary.toLocaleString()} / ${SALARY_CAP.toLocaleString()} (left ${remainingCap.toLocaleString()})</span>
        </div>
        <div className="grid2">
          <div>
            <strong>Roster slots</strong>
            <ul>
              <li>LW: {positionCounts.LW}/{ROSTER_SLOTS.LW}</li>
              <li>C: {positionCounts.C}/{ROSTER_SLOTS.C}</li>
              <li>RW: {positionCounts.RW}/{ROSTER_SLOTS.RW}</li>
              <li>D: {positionCounts.D}/{ROSTER_SLOTS.D}</li>
              <li>G: {positionCounts.G}/{ROSTER_SLOTS.G}</li>
            </ul>
          </div>
          <div className="scroll">
            <strong>My picks</strong>
            <ul>
              {(myTeam?.players || []).map((pid: string) => {
                const p = playerById(pid);
                return <li key={pid}>{p ? `${playerName(p)} (${p.position}) - $${p.capHit.toLocaleString()}` : pid}</li>;
              })}
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2>Players</h2>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select value={posFilter} onChange={e => setPosFilter(e.target.value)}>
            <option value="ALL">All positions</option>
            <option value="C">C</option>
            <option value="LW">LW</option>
            <option value="RW">RW</option>
            <option value="D">D</option>
            <option value="G">G</option>
          </select>
          <label><input type="checkbox" checked={onlyAvailable} onChange={e => setOnlyAvailable(e.target.checked)} /> Available only</label>
          <label><input type="checkbox" checked={onlyFitsCap} onChange={e => setOnlyFitsCap(e.target.checked)} /> Fits my cap</label>
          <label><input type="checkbox" checked={onlyFitsSlot} onChange={e => setOnlyFitsSlot(e.target.checked)} /> Fits my slot</label>
          <input placeholder="Search name/team" value={search} onChange={e => setSearch(e.target.value)} />
          <select value={sortKey} onChange={e => setSortKey(e.target.value as any)}>
            <option value="value">Sort: Value per $ (desc)</option>
            <option value="points">Sort: Points (desc)</option>
            <option value="cap">Sort: Cap Hit (asc)</option>
          </select>
        </div>
        <div className="scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Pos</th>
                <th>NHL</th>
                <th>Points</th>
                <th>Cap Hit</th>
                <th>Value/$ (pts per $1M)</th>
                <th>Avail</th>
                <th>Fits Cap</th>
                <th>Fits Slot</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map(p => {
                const val = valuePerM(p);
                const avail = p.draftedBy == null;
                const capOK = fitsCap(p);
                const slotOK = hasSlotFor(p.position);
                const yourTurn = draftState && userId && draftState.activeUserId === userId;
                const canPickNow = !!(avail && capOK && slotOK && yourTurn && roomId && userId);
                return (
                  <tr key={p.id} style={{ opacity: avail ? 1 : 0.5 }}>
                    <td>{playerName(p)}</td>
                    <td>{p.position}</td>
                    <td>{p.team}</td>
                    <td>{p?.stats?.points ?? '-'}</td>
                    <td>${p.capHit.toLocaleString()}</td>
                    <td>{val}</td>
                    <td>{avail ? '✓' : '✗'}</td>
                    <td>{capOK ? '✓' : '✗'}</td>
                    <td>{slotOK ? '✓' : '✗'}</td>
                    <td>
                      <button disabled={!canPickNow} onClick={() => pickPlayer(p.id)}>Pick</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Draft</h2>
        <div className="grid2">
          <div>
            <label>Room Id</label>
            <input value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="room-123" />
          </div>
          <div>
            <label>Pick order (userIds, comma)</label>
            <input value={pickOrder} onChange={e => setPickOrder(e.target.value)} placeholder="<your-user-id>,<other-user-id>" />
          </div>
          <div>
            <label>Player Id</label>
            <input value={playerId} onChange={e => setPlayerId(e.target.value)} placeholder="player-1" />
          </div>
        </div>
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <button onClick={startDraft}>POST /api/draft/start</button>
          <button className="secondary" onClick={getRoom}>GET /api/draft/room</button>
          <button className="secondary" onClick={getState}>GET /api/draft/state</button>
          <button className="secondary" onClick={loadRooms}>GET /api/draft/rooms</button>
          <button className="secondary" onClick={loadHistory}>GET /api/draft/history</button>
          <button onClick={makePick}>POST /api/draft/pick</button>
          <button className="secondary" onClick={joinRoom}>Join room (socket)</button>
          {draftState && (
            <span className="tag">
              {draftState.activeUserId === userId ? 'Ваш ход' : `Ход: ${draftState.activeUserId || '-'}`} •
              {' '}Раунд/Пик: {draftState.round || '-'} / {draftState.pickIndex ?? '-'} • Таймер: {Math.ceil((draftState.timerRemainingMs || 0)/1000)}s
            </span>
          )}
        </div>
        <div className="grid2">
          <div className="scroll"><pre>{stateJson}</pre></div>
          <div className="scroll">
            <pre>{log}</pre>
            <div style={{ marginTop: 8 }}>
              <div className="tag">presence: {presence ? presence.count : 0}</div>
              {presence && presence.users && presence.users.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <small>users:</small>
                  <div>{presence.users.join(', ')}</div>
                </div>
              )}
              {rooms && (
                <div style={{ marginTop: 10 }}>
                  <strong>Rooms</strong>
                  <ul>
                    {rooms.map((r: any) => (
                      <li key={r.roomId}>{r.roomId} • order: {Array.isArray(r.pickOrder) ? r.pickOrder.length : 0} • timer: {r.timerSec}s</li>
                    ))}
                  </ul>
                </div>
              )}
              {history && (() => {
                // Group picks by round
                const byRound = history.reduce((acc: Record<number, any[]>, p: any) => {
                  const r = p.round || 1;
                  if (!acc[r]) acc[r] = [];
                  acc[r].push(p);
                  return acc;
                }, {});
                const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
                return (
                  <div style={{ marginTop: 10 }}>
                    <strong>History ({history.length} picks)</strong>
                    {rounds.map(round => (
                      <div key={round} style={{ marginTop: 8 }}>
                        <div style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#666' }}>Round {round}</div>
                        <ul style={{ marginTop: 4, fontSize: '0.9em' }}>
                          {byRound[round].map((p: any) => {
                            const pl = playerById(p.playerId);
                            return (
                              <li key={`${p.roomId}-${p.pickIndex}`}>
                                #{p.pickIndex} • {p.userId.slice(0, 8)} → {pl ? `${playerName(pl)} (${pl.position})` : p.playerId}
                                {p.autopick && <span style={{ marginLeft: 4, padding: '2px 4px', background: '#ffc107', color: '#000', borderRadius: 3, fontSize: '0.8em' }}>AUTO</span>}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
