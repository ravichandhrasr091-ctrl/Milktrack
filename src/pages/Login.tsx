import { ArrowRight, Check, Cloud, LockKeyhole, Milk } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { beginGoogleSignIn, isGoogleSignInConfigured } from '../services/auth';

export default function Login() {
  const [error, setError] = useState('');
  const configured = isGoogleSignInConfigured();

  async function handleGoogleSignIn() {
    setError('');
    try {
      await beginGoogleSignIn();
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : 'Google sign-in could not start.',
      );
    }
  }

  return (
    <main className="login-page">
      <Link className="public-brand" to="/" aria-label="MilkTrack website home">
        <span className="public-brand-mark">
          <Milk size={22} aria-hidden="true" />
        </span>
        <span>
          <strong>MilkTrack</strong>
          <small>MILK COLLECTION MANAGER</small>
        </span>
      </Link>

      <section className="login-card">
        <span className="login-icon">
          <LockKeyhole size={23} aria-hidden="true" />
        </span>
        <p className="site-eyebrow">YOUR PRIVATE WORKSPACE</p>
        <h1>Sign in to MilkTrack</h1>
        <p className="login-intro">
          Use Google to securely open your MilkTrack dashboard. Cross-device
          cloud sync is not active until the AWS sync service is configured.
        </p>
        <button
          className="google-sign-in"
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={!configured}
        >
          <GoogleMark />
          Continue with Google
          <ArrowRight size={17} aria-hidden="true" />
        </button>
        {!configured && (
          <div className="setup-notice" role="status">
            Google sign-in will be enabled after the AWS Cognito and Google
            OAuth settings are configured for this website.
          </div>
        )}
        {error && (
          <div className="site-error" role="alert">
            {error}
          </div>
        )}
        <div className="login-benefits">
          <span>
            <Check size={15} aria-hidden="true" /> Your account, your records
          </span>
          <span>
            <Cloud size={15} aria-hidden="true" /> AWS sync setup required
          </span>
        </div>
        <p className="login-terms">
          Sign in is required to open the MilkTrack dashboard. MilkTrack never
          asks for or stores your Google password.
        </p>
      </section>
      <Link className="login-back-link" to="/releases">
        Browse Android APK releases
      </Link>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" width="19" height="19">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3A12 12 0 1 1 32 15.1l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.4-.4-3.5Z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8A12 12 0 0 1 32 15.1l5.7-5.7A20 20 0 0 0 6.3 14.7Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.1 0 9.8-2 13.3-5.2l-6.1-5.2A12 12 0 0 1 12.8 28l-6.5 5A20 20 0 0 0 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.1 5.2A20 20 0 0 0 44 24c0-1.2-.1-2.4-.4-3.5Z"
      />
    </svg>
  );
}
