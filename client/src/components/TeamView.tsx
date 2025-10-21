import { useState, useEffect } from 'react';

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  capHit: number;
  team: string;
  stats: { games: number; goals: number; assists: number; points: number };
}

interface TeamData {
  picks: Player[];
  capSpent: number;
  capRemaining: number;
}

export default function TeamView() {
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeam();
  }, []);

  const loadTeam = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/team', { credentials: 'include' });
      const data = await res.json();
      
      if (data.team && data.team.picks) {
        const capSpent = data.team.picks.reduce((sum: number, p: Player) => sum + p.capHit, 0);
        setTeamData({
          picks: data.team.picks,
          capSpent,
          capRemaining: 95500000 - capSpent,
        });
      }
      setLoading(false);
    } catch (err) {
      console.error('[TeamView] Error loading team:', err);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontSize: '18px' }}>
        Загрузка команды...
      </div>
    );
  }

  if (!teamData || teamData.picks.length === 0) {
    return (
      <div className="card" style={{ padding: '32px', textAlign: 'center', maxWidth: '640px', margin: '40px auto' }}>
        <h2 style={{ color: '#ffffff' }}>Команда не найдена</h2>
        <p className="muted">Похоже, вы ещё не участвовали в драфте.</p>
        <button onClick={() => window.location.href = '/'} className="btn btn-secondary" style={{ marginTop: '12px' }}>
          Вернуться в лобби
        </button>
      </div>
    );
  }

  // Calculate total stats
  const totalGoals = teamData.picks.reduce((sum, p) => sum + (p.stats?.goals || 0), 0);
  const totalAssists = teamData.picks.reduce((sum, p) => sum + (p.stats?.assists || 0), 0);
  const totalPoints = teamData.picks.reduce((sum, p) => sum + (p.stats?.points || 0), 0);

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div className="card" style={{
        padding: '24px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '700', color: '#ffffff' }}>
            🏒 Моя команда
          </h1>
          <p style={{ margin: 0, fontSize: '16px', opacity: 0.9, color: '#94a3b8' }}>
            Состав: {teamData.picks.length}/6 игроков
          </p>
        </div>
        <button onClick={() => window.location.href = '/lobby'} className="btn btn-secondary">
          ← Вернуться в лобби
        </button>
      </div>

      {/* Stats Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '14px', color: '#60a5fa', fontWeight: '600', marginBottom: '8px' }}>
            Потрачено
          </div>
          <div style={{ fontSize: '24px', color: '#ef4444', fontWeight: '700' }}>
            ${(teamData.capSpent / 1000000).toFixed(1)}M
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '14px', color: '#10b981', fontWeight: '600', marginBottom: '8px' }}>
            Осталось
          </div>
          <div style={{ fontSize: '24px', color: '#10b981', fontWeight: '700' }}>
            ${(teamData.capRemaining / 1000000).toFixed(1)}M
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '14px', color: '#f59e0b', fontWeight: '600', marginBottom: '8px' }}>
            Голы
          </div>
          <div style={{ fontSize: '24px', color: '#f59e0b', fontWeight: '700' }}>
            {totalGoals}
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '14px', color: '#60a5fa', fontWeight: '600', marginBottom: '8px' }}>
            Очки
          </div>
          <div style={{ fontSize: '24px', color: '#60a5fa', fontWeight: '700' }}>
            {totalPoints}
          </div>
        </div>
      </div>

      {/* Roster Table */}
      <div className="card" style={{ padding: '20px' }}>
        <h2 style={{ marginTop: 0, color: '#ffffff', fontWeight: '700', fontSize: '20px', marginBottom: '16px' }}>
          Состав команды
        </h2>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700' }}>Игрок</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700' }}>Поз</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700' }}>Команда</th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: '700' }}>Зарплата</th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: '700' }}>Голы</th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: '700' }}>Ассисты</th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: '700' }}>Очки</th>
            </tr>
          </thead>
          <tbody>
            {teamData.picks.map((player, i) => (
              <tr key={player.id} style={{ borderBottom: '1px solid #334155', background: i % 2 === 0 ? '#0a3d52' : '#1e293b' }}>
                <td style={{ padding: '12px', color: '#ffffff', fontWeight: '600', fontSize: '14px' }}>
                  {player.firstName} {player.lastName}
                </td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#60a5fa', fontWeight: '700', fontSize: '14px' }}>
                  {player.position}
                </td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontWeight: '600' }}>
                  {player.team}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#ef4444', fontWeight: '600' }}>
                  ${(player.capHit / 1000000).toFixed(1)}M
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontWeight: '700' }}>
                  {player.stats?.goals || 0}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#60a5fa', fontWeight: '700' }}>
                  {player.stats?.assists || 0}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#60a5fa', fontWeight: '700', fontSize: '16px' }}>
                  {player.stats?.points || 0}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot style={{ fontWeight: '700' }}>
            <tr>
              <td colSpan={4} style={{ padding: '12px', textAlign: 'right', borderTop: '2px solid #334155', color: '#ffffff' }}>
                ИТОГО:
              </td>
              <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', borderTop: '2px solid #334155' }}>
                {totalGoals}
              </td>
              <td style={{ padding: '12px', textAlign: 'right', color: '#60a5fa', borderTop: '2px solid #334155' }}>
                {totalAssists}
              </td>
              <td style={{ padding: '12px', textAlign: 'right', color: '#60a5fa', fontSize: '18px', borderTop: '2px solid #334155' }}>
                {totalPoints}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
