import {
  ArrowDownToLine,
  ArrowRight,
  Camera,
  Cloud,
  FileCheck2,
  Milk,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const highlights = [
  {
    icon: Camera,
    title: 'Capture or upload',
    description:
      'Use your phone camera or choose a receipt photo to start a collection record.',
  },
  {
    icon: FileCheck2,
    title: 'Review before saving',
    description:
      'On-device OCR reads supported Dodla Cow slips; you check every value before it is saved.',
  },
  {
    icon: Cloud,
    title: 'Prepare for device sync',
    description:
      'Google sign-in and the AWS sync service must be configured before records can sync across devices.',
  },
];

export default function PublicHome() {
  return (
    <div className="public-site">
      <header className="public-header">
        <Link className="public-brand" to="/" aria-label="MilkTrack website home">
          <span className="public-brand-mark">
            <Milk size={21} aria-hidden="true" />
          </span>
          <span>
            <strong>MilkTrack</strong>
            <small>MILK COLLECTION MANAGER</small>
          </span>
        </Link>
        <nav className="public-nav" aria-label="Website navigation">
          <Link to="/releases">Android APK releases</Link>
          <Link className="public-nav-signin" to="/login">
            Sign in <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main className="public-main">
        <section className="public-hero">
          <div className="public-hero-copy">
            <span className="public-pill">
              <ShieldCheck size={14} aria-hidden="true" />
              Made for verified records
            </span>
            <p className="site-eyebrow">A CLEARER WAY TO KEEP YOUR REGISTER</p>
            <h1>Every milk collection, carefully recorded.</h1>
            <p className="public-hero-description">
              MilkTrack helps you turn collection slips into a simple digital
              register—reviewed by you and stored on your device. Cross-device
              sync will be available after the AWS services are configured.
            </p>
            <div className="public-hero-actions">
              <Link className="site-button site-button-primary" to="/login">
                Open MilkTrack <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link className="site-button site-button-secondary" to="/releases">
                <ArrowDownToLine size={17} aria-hidden="true" />
                Android app releases
              </Link>
            </div>
            <p className="public-hero-note">
              You review and approve receipt details before they become saved
              records.
            </p>
          </div>
          <div className="public-hero-art" aria-hidden="true">
            <div className="public-art-glow" />
            <div className="public-art-card">
              <div className="public-art-card-top">
                <span className="public-art-icon">
                  <Milk size={20} />
                </span>
                <span>COLLECTION REGISTER</span>
                <span className="public-art-dots">•••</span>
              </div>
              <div className="public-art-date">SAMPLE PREVIEW · NOT REAL DATA</div>
              <div className="public-art-amount">2.25 <small>litres</small></div>
              <div className="public-art-divider" />
              <div className="public-art-row">
                <span>Receipt status</span>
                <strong><CheckMark /> Reviewed by you</strong>
              </div>
              <div className="public-art-row">
                <span>Original photo</span>
                <strong>Kept with record</strong>
              </div>
              <div className="public-art-footer">
                <ShieldCheck size={16} aria-hidden="true" />
                ILLUSTRATIVE EXAMPLE
              </div>
            </div>
            <div className="public-art-spark">
              <Sparkles size={18} />
            </div>
          </div>
        </section>

        <section className="public-highlights" aria-labelledby="how-title">
          <div className="public-section-heading">
            <p className="site-eyebrow">SIMPLE BY DESIGN</p>
            <h2 id="how-title">From paper slip to trusted register</h2>
          </div>
          <div className="public-highlight-grid">
            {highlights.map(({ icon: Icon, title, description }, index) => (
              <article className="public-highlight-card" key={title}>
                <span className="public-highlight-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="public-highlight-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="public-release-cta">
          <div>
            <p className="site-eyebrow">ANDROID APP</p>
            <h2>Find the latest MilkTrack APK</h2>
            <p>
              Visit the separate releases page for published versions, update
              notes, and APK downloads.
            </p>
          </div>
          <Link className="site-button site-button-light" to="/releases">
            View releases <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>

        <section className="public-privacy">
          <ShieldCheck size={20} aria-hidden="true" />
          <p>
            <strong>Your records, under your control.</strong> Receipt reading
            starts on your device. Google sign-in and cross-device AWS sync
            still need to be configured. Receipt AI verification is optional
            and uses AWS Bedrock when enabled.
          </p>
          <Link to="/login">Sign in securely</Link>
        </section>
      </main>

      <footer className="public-footer">
        <Link className="public-footer-brand" to="/">MilkTrack</Link>
        <span>Milk collection records, made clear.</span>
        <Link to="/releases">Android releases</Link>
      </footer>
    </div>
  );
}

function CheckMark() {
  return <span className="public-art-check" aria-hidden="true">✓</span>;
}
