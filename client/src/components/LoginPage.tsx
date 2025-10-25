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
    <div className="page-centered animate-fade-in">
      <div className="card max-w-md w-full animate-slide-up" style={{ maxWidth: '440px' }}>
        <div className="card-header text-center">
          <h1 style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '0.5rem', background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            🏒 Fantasy Draft
          </h1>
          <p className="card-subtitle" style={{ fontSize: '1rem' }}>
            {isRegistering ? 'Создайте аккаунт для начала' : 'Войдите в систему'}
          </p>
        </div>

        <div className="card-body">
          {error && (
            <div className="alert alert-danger animate-slide-up" style={{ marginBottom: '1.5rem' }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Логин</label>
              <input
                type="text"
                className="form-input"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                required
                disabled={loading}
                autoComplete="username"
                placeholder="Введите логин"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Пароль</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete={isRegistering ? 'new-password' : 'current-password'}
                placeholder="Введите пароль"
              />
            </div>

            {isRegistering && (
              <div className="form-group">
                <label className="form-label">Название команды (опционально)</label>
                <input
                  type="text"
                  className="form-input"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  disabled={loading}
                  placeholder={login ? `${login}'s Team` : 'Моя команда'}
                />
                <div className="form-help">Оставьте пустым для автоматического названия</div>
              </div>
            )}

            <button 
              type="submit" 
              className="btn btn-primary btn-lg btn-block" 
              disabled={loading}
              style={{ marginTop: '1.5rem' }}
            >
              {loading ? '⏳ Загрузка...' : isRegistering ? '📝 Зарегистрироваться' : '🔑 Войти'}
            </button>
          </form>
        </div>

        <div className="card-footer text-center">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
            }}
            disabled={loading}
          >
            {isRegistering ? 'Уже есть аккаунт? Войти →' : 'Нет аккаунта? Зарегистрироваться →'}
          </button>
        </div>
      </div>
    </div>
  );
}
