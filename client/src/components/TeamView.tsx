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
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Команда не найдена</h2>
        <p>Похоже, вы ещё не участвовали в драфте.</p>
        <button
          onClick={() => window.location.href = '/'}
          style={{
            padding: '12px 24px',
            background: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
          }}
        >
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
      <div style={{
        background: 'linear-gradient(135deg, #1976D2, #1565C0)',
        color: 'white',
        padding: '24px',
        borderRadius: '8px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '700' }}>
            🏒 Моя команда
          </h1>
          <p style={{ margin: 0, fontSize: '16px', opacity: 0.9 }}>
            Состав: {teamData.picks.length}/6 игроков
          </p>
        </div>
        <button
          onClick={() => window.location.href = '/lobby'}
          style={{
            padding: '12px 24px',
            background: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            border: '2px solid white',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
          }}
        >
          ← Вернуться в лобби
        </button>
      </div>

      {/* Stats Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #e3f2fd, #bbdefb)',
          padding: '20px',
          borderRadius: '8px',
          border: '2px solid #90caf9',
        }}>
          <div style={{ fontSize: '14px', color: '#1565c0', fontWeight: '600', marginBottom: '8px' }}>
            Потрачено
          </div>
          <div style={{ fontSize: '24px', color: '#d32f2f', fontWeight: '700' }}>
            ${(teamData.capSpent / 1000000).toFixed(1)}M
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
          padding: '20px',
          borderRadius: '8px',
          border: '2px solid #81c784',
        }}>
          <div style={{ fontSize: '14px', color: '#2e7d32', fontWeight: '600', marginBottom: '8px' }}>
            Осталось
          </div>
          <div style={{ fontSize: '24px', color: '#2e7d32', fontWeight: '700' }}>
            ${(teamData.capRemaining / 1000000).toFixed(1)}M
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #fff3e0, #ffe0b2)',
          padding: '20px',
          borderRadius: '8px',
          border: '2px solid #ffb74d',
        }}>
          <div style={{ fontSize: '14px', color: '#e65100', fontWeight: '600', marginBottom: '8px' }}>
            Голы
          </div>
          <div style={{ fontSize: '24px', color: '#e65100', fontWeight: '700' }}>
            {totalGoals}
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #f3e5f5, #e1bee7)',
          padding: '20px',
          borderRadius: '8px',
          border: '2px solid #ba68c8',
        }}>
          <div style={{ fontSize: '14px', color: '#6a1b9a', fontWeight: '600', marginBottom: '8px' }}>
            Очки
          </div>
          <div style={{ fontSize: '24px', color: '#6a1b9a', fontWeight: '700' }}>
            {totalPoints}
          </div>
        </div>
      </div>

      {/* Roster Table */}
      <div style={{ background: 'white', border: '2px solid #e0e0e0', borderRadius: '8px', padding: '20px' }}>
        <h2 style={{ marginTop: 0, color: '#000', fontWeight: '700', fontSize: '20px', marginBottom: '16px' }}>
          Состав команды
        </h2>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f5f5f5' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: '700' }}>Игрок</th>
              <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd', fontWeight: '700' }}>Поз</th>
              <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd', fontWeight: '700' }}>Команда</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd', fontWeight: '700' }}>Зарплата</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd', fontWeight: '700' }}>Голы</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd', fontWeight: '700' }}>Ассисты</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd', fontWeight: '700' }}>Очки</th>
            </tr>
          </thead>
          <tbody>
            {teamData.picks.map((player, i) => (
              <tr key={player.id} style={{ borderBottom: '1px solid #e0e0e0', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '12px', color: '#000', fontWeight: '600', fontSize: '14px' }}>
                  {player.firstName} {player.lastName}
                </td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#1565c0', fontWeight: '700', fontSize: '14px' }}>
                  {player.position}
                </td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#424242', fontWeight: '600' }}>
                  {player.team}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#d32f2f', fontWeight: '600' }}>
                  ${(player.capHit / 1000000).toFixed(1)}M
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#2e7d32', fontWeight: '700' }}>
                  {player.stats?.goals || 0}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#1565c0', fontWeight: '700' }}>
                  {player.stats?.assists || 0}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#6a1b9a', fontWeight: '700', fontSize: '16px' }}>
                  {player.stats?.points || 0}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot style={{ background: '#f5f5f5', fontWeight: '700' }}>
            <tr>
              <td colSpan={4} style={{ padding: '12px', textAlign: 'right', borderTop: '2px solid #ddd' }}>
                ИТОГО:
              </td>
              <td style={{ padding: '12px', textAlign: 'right', color: '#2e7d32', borderTop: '2px solid #ddd' }}>
                {totalGoals}
              </td>
              <td style={{ padding: '12px', textAlign: 'right', color: '#1565c0', borderTop: '2px solid #ddd' }}>
                {totalAssists}
              </td>
              <td style={{ padding: '12px', textAlign: 'right', color: '#6a1b9a', fontSize: '18px', borderTop: '2px solid #ddd' }}>
                {totalPoints}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
