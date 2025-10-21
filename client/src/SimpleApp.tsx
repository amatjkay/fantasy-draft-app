import { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { Lobby } from './components/Lobby';
import { DraftRoom } from './components/DraftRoom';
import { AdminPanel } from './components/AdminPanel';
import TeamView from './components/TeamView';

type View = 'login' | 'lobby' | 'draft' | 'admin' | 'team';

export function SimpleApp() {
  const [view, setView] = useState<View>('login');
  const [userId, setUserId] = useState<string>('');
  const [userLogin, setUserLogin] = useState<string>('');
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user');
  const [roomId, setRoomId] = useState<string>('');

  // Check if already logged in and if there's an active draft
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const meRes = await fetch('http://localhost:3001/api/auth/me', { credentials: 'include' });
        const meData = await meRes.json();
        
        if (meData.userId) {
          console.log('[SimpleApp] User authenticated:', meData.login);
          setUserId(meData.userId);
          setUserLogin(meData.login);
          setUserRole(meData.role || 'user');
          
          // Check if user has an active draft
          const draftRes = await fetch('http://localhost:3001/api/draft/active', { credentials: 'include' });
          const draftData = await draftRes.json();
          
          if (draftData.hasActiveDraft) {
            console.log('[SimpleApp] Found active draft, rejoining:', draftData.roomId);
            setRoomId(draftData.roomId);
            setView('draft'); // Go directly to draft
          } else {
            console.log('[SimpleApp] No active draft, going to lobby');
            setRoomId('weekly-draft');
            setView('lobby');
          }
        }
      } catch (err) {
        console.error('[SimpleApp] Auth check failed:', err);
        // Not logged in or error
      }
    };
    
    checkAuth();
  }, []);

  const handleLoginSuccess = (uid: string, login: string, role?: 'user' | 'admin') => {
    setUserId(uid);
    setUserLogin(login);
    setUserRole(role || 'user');
    
    // Fixed room for weekly draft - all users join the same room
    setRoomId('weekly-draft');
    setView('lobby');
  };

  const handleStartDraft = () => {
    setView('draft');
  };

  const handleExitLobby = async () => {
    await fetch('http://localhost:3001/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    setView('login');
    setUserId('');
    setUserLogin('');
    setRoomId('');
  };

  const handleExitDraft = () => {
    setView('lobby');
  };

  if (view === 'login') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (view === 'admin') {
    return (
      <AdminPanel
        onExit={() => setView('lobby')}
      />
    );
  }

  if (view === 'lobby' && roomId) {
    return (
      <>
        {userRole === 'admin' && (
          <div style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 999 }}>
            <button
              onClick={() => setView('admin')}
              style={{
                padding: '8px 16px',
                background: '#ff9800',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              🔧 Admin Panel
            </button>
          </div>
        )}
        <Lobby
          roomId={roomId}
          userId={userId}
          userLogin={userLogin}
          onStartDraft={handleStartDraft}
          onExit={handleExitLobby}
        />
      </>
    );
  }

  if (view === 'draft' && roomId) {
    return (
      <DraftRoom
        roomId={roomId}
        userId={userId}
        onExit={handleExitDraft}
        onNavigateToTeam={() => setView('team')}
      />
    );
  }

  if (view === 'team') {
    return <TeamView />;
  }

  return <div>Loading...</div>;
}
