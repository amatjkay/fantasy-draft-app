import { useState } from 'react';

interface Props {
  onLoginSuccess: (userId: string, login: string, role?: 'user' | 'admin') => void;
}

export function LoginPage({ onLoginSuccess }: Props) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
      const body: any = { login, password };
      if (isRegistering) {
        body.teamName = teamName || login + "'s Team";
        body.logo = 'default-logo';
      }

      const res = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        onLoginSuccess(data.userId, data.login, data.role);
      } else {
        setError(data.error || 'Ошибка входа');
      }
    } catch (err) {
      setError('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #053950 0%, #072338 100%)',
      padding: '20px',
    }}>
      <div className="card" style={{
        padding: '40px',
        width: '100%',
        maxWidth: '400px',
      }}>
        <h1 style={{ textAlign: 'center', marginTop: 0, marginBottom: '8px', color: '#ffffff', fontWeight: '700', fontSize: '28px' }}>
          Shadow Hockey Draft
        </h1>
        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', marginBottom: '24px' }}>
          {isRegistering ? 'Создайте аккаунт' : 'Войдите в систему'}
        </p>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '16px' }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label className="label">
              Логин
            </label>
            <input
              type="text"
              value={login}
              onChange={e => setLogin(e.target.value)}
              required
              minLength={3}
              className="input"
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #334155',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: '#0a3d52',
                color: '#ffffff',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="label">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="input"
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #334155',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {isRegistering && (
            <div style={{ marginBottom: '16px' }}>
              <label className="label">
                Название команды (опционально)
              </label>
              <input
                type="text"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder={`${login}'s Team`}
                className="input"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #334155',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: '#0a3d52',
                  color: '#ffffff',
                }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? '#059669' : 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Загрузка...' : isRegistering ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px' }}>
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
            }}
            className="btn-link"
          >
            {isRegistering ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
          </button>
        </div>
      </div>
    </div>
  );
}
