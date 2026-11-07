import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getCurrentUser } from '../services/auth';
import { bindLocalReceiptsToUser } from '../services/database';
import type { AuthUser } from '../services/auth';

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: AuthUser }
  | { status: 'error'; message: string };

export default function RequireAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const user = await getCurrentUser();
        if (user) await bindLocalReceiptsToUser(user.sub);
        if (active) {
          setState(user ? { status: 'signed-in', user } : { status: 'signed-out' });
        }
      } catch (error: unknown) {
        if (active) {
          setState({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Could not verify your MilkTrack sign-in.',
          });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'loading') {
    return <main className="auth-loading">Checking your secure sign-in…</main>;
  }
  if (state.status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: window.location.pathname }} />;
  }
  if (state.status === 'error') {
    return (
      <main className="auth-loading" role="alert">
        {state.message}
      </main>
    );
  }
  return <Outlet context={state.user} />;
}
