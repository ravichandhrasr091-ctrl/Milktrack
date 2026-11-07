import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { completeGoogleSignIn } from '../services/auth';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    completeGoogleSignIn().then(
      () => {
        if (active) navigate('/app', { replace: true });
      },
      (signInError: unknown) => {
        if (active) {
          setError(
            signInError instanceof Error
              ? signInError.message
              : 'Google sign-in could not be completed.',
          );
        }
      },
    );
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="auth-loading">
      {error ? (
        <div className="site-error" role="alert">
          <p>{error}</p>
          <Link to="/login">Return to sign in</Link>
        </div>
      ) : (
        'Finishing your secure Google sign-in…'
      )}
    </main>
  );
}
