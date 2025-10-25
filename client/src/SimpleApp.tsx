import { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { Lobby } from './components/Lobby';
import { DraftRoom } from './components/DraftRoom';
import { AdminPanel } from './components/AdminPanel';
import TeamView from './components/TeamView';
import AllTeams from './components/AllTeams';

type View = 'login' | 'lobby' | 'draft' | 'admin' | 'team' | 'allteams';

export function SimpleApp() {
  const [view, setView] = useState<View>('login');
  const [userId, setUserId] = useState<string | null>(null);
  const [userLogin, setUserLogin] = useState<string>('');
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user');
  const [roomId, setRoomId] = useState<string>('');
  const getRoomIdFromUrl = () => {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('roomId') || 'weekly-draft';
    } catch {
      return 'weekly-draft';
    }
  };

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
            const rid = getRoomIdFromUrl();
            setRoomId(rid);
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
    
    // Prefer roomId from URL if provided, fallback to weekly-draft
    const rid = getRoomIdFromUrl();
    setRoomId(rid);
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

  const openAllTeams = () => setView('allteams');
  const backFromAllTeams = () => setView('lobby');

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
        <div style={{ position: 'fixed', top: '10px', left: '10px', zIndex: 999 }}>
          <button
            onClick={openAllTeams}
            className="btn btn-secondary"
          >
            📋 Все команды
          </button>
        </div>
        <Lobby
          roomId={roomId}
          userId={userId!}
          userLogin={userLogin}
          userRole={userRole}
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
        userId={userId!}
        onExit={handleExitDraft}
        onNavigateToTeam={() => setView('team')}
      />
    );
  }

  if (view === 'team') {
    return <TeamView />;
  }

  if (view === 'allteams' && roomId) {
    return <AllTeams roomId={roomId} onBack={backFromAllTeams} />;
  }

  return <div>Loading...</div>;
}
