import { ArrowDownToLine, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Milk } from 'lucide-react';
import {
  parseGitHubReleases,
  parseReleaseManifest,
  type AppRelease,
} from '../services/releaseData';

type ReleaseState =
  | { status: 'loading' }
  | { status: 'ready'; releases: AppRelease[] }
  | { status: 'error'; message: string };

export default function Releases() {
  const [state, setState] = useState<ReleaseState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const repository = import.meta.env.VITE_GITHUB_REPOSITORY;
    const releasesUrl = repository
      ? `https://api.github.com/repos/${repository}/releases?per_page=30`
      : `${import.meta.env.BASE_URL}releases.json`;
    fetch(releasesUrl, {
      cache: 'no-store',
      signal: controller.signal,
      headers: repository ? { Accept: 'application/vnd.github+json' } : undefined,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load releases (HTTP ${response.status}).`);
        }
        const data: unknown = await response.json();
        const releases = repository
          ? parseGitHubReleases(data, repository)
          : parseReleaseManifest(data, window.location.origin);
        setState({ status: 'ready', releases });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Could not load the published app releases.',
        });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="public-site">
      <header className="public-header">
        <Link className="public-brand" to="/" aria-label="MilkTrack website home">
          <span className="public-brand-mark">
            <Milk size={21} aria-hidden="true" />
          </span>
          <span>
            <strong>MilkTrack</strong>
            <small>APP RELEASES</small>
          </span>
        </Link>
        <nav className="public-nav" aria-label="Website navigation">
          <Link to="/">About MilkTrack</Link>
          <Link className="public-nav-signin" to="/login">Sign in</Link>
        </nav>
      </header>

      <main className="releases-main">
        <Link className="site-back-link" to="/">
          <ArrowLeft size={15} aria-hidden="true" /> Back to MilkTrack
        </Link>
        <section className="releases-hero">
          <span className="releases-hero-icon">
            <ArrowDownToLine size={22} aria-hidden="true" />
          </span>
          <p className="site-eyebrow">ANDROID APK DOWNLOADS</p>
          <h1>MilkTrack app releases</h1>
          <p>
            Version history, release notes, and downloads for published Android
            APKs.
          </p>
        </section>

        <section className="release-list-section" aria-labelledby="release-list-title">
          <div className="release-list-heading">
            <div>
              <p className="site-eyebrow">VERSION HISTORY</p>
              <h2 id="release-list-title">MilkTrack app releases</h2>
            </div>
            {state.status === 'ready' && (
              <span className="release-count">
                {state.releases.length}{' '}
                {state.releases.length === 1 ? 'version' : 'versions'}
              </span>
            )}
          </div>
          {state.status === 'loading' && (
            <p className="release-loading" role="status">Loading published versions…</p>
          )}
          {state.status === 'error' && (
            <p className="release-error" role="alert">{state.message}</p>
          )}
          {state.status === 'ready' &&
            (state.releases.length === 0 ? (
              <div className="release-empty">
                <span className="release-empty-icon">
                  <ArrowDownToLine size={20} aria-hidden="true" />
                </span>
                <h3>No APK versions published yet</h3>
                <p>
                  A version will appear here after you publish a GitHub Release
                  with its signed Android APK attached.
                </p>
              </div>
            ) : (
              <div className="release-cards">
                {state.releases.map((release, index) => (
                  <article className="release-card" key={release.version}>
                    <div className="release-card-heading">
                      <div>
                        <span className="release-version-label">APP RELEASE</span>
                        <h3>MilkTrack v{release.version}</h3>
                      </div>
                      {index === 0 && (
                        <span className="release-latest">Latest</span>
                      )}
                    </div>
                    <p className="release-date">
                      {release.date ? `Released ${release.date}` : 'Release date not provided'}
                    </p>
                    <p className="release-notes">
                      {release.notes || 'No release notes provided.'}
                    </p>
                    <div className="release-downloads">
                      {release.apk && (
                        <a
                          className="release-download"
                          href={release.apk}
                          aria-label={`Download MilkTrack v${release.version} Android APK`}
                        >
                          <ArrowDownToLine size={16} aria-hidden="true" />
                          Android APK
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ))}
        </section>

        <aside className="release-install-note">
          <ShieldCheck size={19} aria-hidden="true" />
          <div>
            <strong>Install updates safely</strong>
            <p>
              Only install APKs from a source you trust. Updates must be signed
              with the same developer key as your installed app. Android may
              ask you to allow installation from your browser.
            </p>
          </div>
        </aside>
      </main>

      <footer className="public-footer">
        <Link className="public-footer-brand" to="/">MilkTrack</Link>
        <span>Android APK downloads are provided through GitHub Releases.</span>
        <Link to="/">Website home</Link>
      </footer>
    </div>
  );
}
