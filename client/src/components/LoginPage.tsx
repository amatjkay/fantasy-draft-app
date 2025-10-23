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
    <div className="page page-gradient">
      <div className="card p-40 w-full max-w-400">
        <h1 className="heading-xl text-center mb-8">
          Shadow Hockey Draft
        </h1>
        <p className="text-center subtitle mb-24">
          {isRegistering ? 'Создайте аккаунт' : 'Войдите в систему'}
        </p>

        {error && (
          <div className="alert alert-danger mb-16">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-16">
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
            />
          </div>

          <div className="mb-16">
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
            />
          </div>

          {isRegistering && (
            <div className="mb-16">
              <label className="label">
                Название команды (опционально)
              </label>
              <input
                type="text"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder={`${login}'s Team`}
                className="input"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-block"
          >
            {loading ? 'Загрузка...' : isRegistering ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </form>

        <div className="text-center mt-16">
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
