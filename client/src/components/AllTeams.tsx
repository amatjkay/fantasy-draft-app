import { useEffect, useMemo, useState } from 'react';

type TeamSlot = { position: string; playerId: string | null };

type TeamDTO = {
  ownerId: string;
  name: string;
  logo: string;
  salaryTotal: number;
  players: string[];
  slots: TeamSlot[];
};

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  capHit: number;
};

interface Props {
  roomId: string;
  onBack: () => void;
}

const SALARY_CAP = 95_500_000;

export default function AllTeams({ roomId, onBack }: Props) {
  const [teams, setTeams] = useState<TeamDTO[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    players.forEach(p => map.set(p.id, p));
    return map;
  }, [players]);

  const fmtMoney = (v: number) => '$' + v.toLocaleString();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [tRes, pRes] = await Promise.all([
          fetch(`http://localhost:3001/api/draft/teams?roomId=${encodeURIComponent(roomId)}`, { credentials: 'include' }),
          fetch(`http://localhost:3001/api/players`, { credentials: 'include' }),
        ]);
        if (!tRes.ok) throw new Error('Failed to load teams');
        if (!pRes.ok) throw new Error('Failed to load players');
        const tData = await tRes.json();
        const pData = await pRes.json();
        if (!cancelled) {
          setTeams(tData.teams || []);
          setPlayers(pData.players || []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Load error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [roomId]);

  return (
    <div className="page page-gradient" style={{ alignItems: 'flex-start' }}>
      <div className="card" style={{ width: '100%', maxWidth: 1100, padding: 24, marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 className="heading-xl">Таблица команд</h1>
          <button className="btn btn-secondary" onClick={onBack}>← Назад</button>
        </div>

        <div className="muted mb-16">Комната: <strong>{roomId}</strong></div>
        {error && <div className="alert alert-danger mb-16">{error}</div>}
        {loading && <div className="alert alert-info">Загрузка...</div>}

        {!loading && teams.length === 0 && (
          <div className="card" style={{ padding: 16 }}>
            <div className="text-center muted">Нет данных по составам</div>
          </div>
        )}

        {!loading && teams.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {teams.map((t) => {
              const remaining = SALARY_CAP - (t.salaryTotal || 0);
              return (
                <div key={t.ownerId} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 800, color: 'var(--color-text-inverse)' }}>{t.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{t.ownerId.slice(0, 8)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: 'var(--color-text-inverse)' }}>{fmtMoney(t.salaryTotal || 0)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>осталось {fmtMoney(remaining)}</div>
                    </div>
                  </div>

                  <table className="table">
                    <thead>
                      <tr>
                        <th>Слот</th>
                        <th>Игрок</th>
                        <th>Cap Hit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.slots.map((s, idx) => {
                        const p = s.playerId ? playerById.get(s.playerId) : undefined;
                        return (
                          <tr key={idx}>
                            <td style={{ color: 'var(--color-text-inverse)', fontWeight: 700 }}>{s.position}</td>
                            <td>
                              {p ? (
                                <span>{p.firstName} {p.lastName} ({p.position})</span>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                            <td>{p ? fmtMoney(p.capHit) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
