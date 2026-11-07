import {
  ChartColumnIncreasing,
  Cloud,
  CloudAlert,
  FileSpreadsheet,
  House,
  Milk,
  ReceiptText,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import FinanceAssistant from './FinanceAssistant';
import { signOut, type AuthUser } from '../services/auth';
import { getPendingReceiptCount, synchronizeAccountReceipts } from '../services/receiptSync';
import { isReceiptCloudConfigured } from '../services/receiptCloud';

const navigation = [
  { label: 'Home', to: '/app', icon: House, end: true },
  { label: 'Receipts', to: '/app/receipts', icon: ReceiptText },
  { label: 'Reports', to: '/app/reports', icon: ChartColumnIncreasing },
  { label: 'Excel', to: '/app/excel', icon: FileSpreadsheet },
];

export default function AppShell() {
  const user = useOutletContext<AuthUser>();
  const [syncNotice, setSyncNotice] = useState('');
  const [syncFailed, setSyncFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let running = false;
    let configured: boolean;
    try {
      configured = isReceiptCloudConfigured();
    } catch (error) {
      setSyncFailed(true);
      setSyncNotice(
        error instanceof Error
          ? error.message
          : 'Cloud receipt sync configuration is invalid.',
      );
      return;
    }
    if (!configured) return;

    const synchronize = async () => {
      if (running) return;
      running = true;
      if (active) {
        setSyncFailed(false);
        setSyncNotice('Syncing verified receipts to your private account…');
      }
      try {
        await synchronizeAccountReceipts(user.sub);
        const pending = await getPendingReceiptCount(user.sub);
        if (active) {
          setSyncFailed(pending > 0);
          setSyncNotice(
            pending > 0
              ? `${pending} receipt${pending === 1 ? '' : 's'} saved on this device are waiting to sync.`
              : '',
          );
        }
      } catch (error) {
        const pending = await getPendingReceiptCount(user.sub).catch(() => 0);
        if (active) {
          setSyncFailed(true);
          setSyncNotice(
            error instanceof Error
              ? `${error.message} Your local receipts remain available on this device.`
              : `${pending} receipt${pending === 1 ? '' : 's'} could not sync. Your local receipts remain available on this device.`,
          );
        }
      } finally {
        running = false;
      }
    };

    const onOnline = () => void synchronize();
    void synchronize();
    const interval = window.setInterval(() => void synchronize(), 60_000);
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [user.sub]);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <NavLink className="brand" to="/app" aria-label="MilkTrack home">
          <span className="brand-mark">
            <Milk size={21} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span className="brand-copy">
            <strong>MilkTrack</strong>
            <small>COLLECTION MANAGER</small>
          </span>
        </NavLink>

        <p className="nav-caption">WORKSPACE</p>
        <nav className="primary-nav">
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `nav-link${isActive ? ' is-active' : ''}`
              }
            >
              <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-note">
          <span className="sidebar-note-icon">
            <Milk size={16} aria-hidden="true" />
          </span>
          <p>Made for careful, verified milk collection records.</p>
        </div>
        <div className="sidebar-footer">
          <span className="privacy-dot" aria-hidden="true" />
          <span>{user.email ?? 'Signed in with Google'}</span>
          <button type="button" className="sidebar-sign-out" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main-column">
        <header className="mobile-header">
          <NavLink className="brand" to="/app" aria-label="MilkTrack home">
            <span className="brand-mark">
              <Milk size={20} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="brand-copy">
              <strong>MilkTrack</strong>
            </span>
          </NavLink>
          <button type="button" className="mobile-sign-out" onClick={signOut}>
            Sign out
          </button>
        </header>
        <main className="page-content">
          {syncNotice && (
            <div
              className={`cloud-sync-notice${syncFailed ? ' is-error' : ''}`}
              role={syncFailed ? 'alert' : 'status'}
            >
              {syncFailed ? (
                <CloudAlert size={18} aria-hidden="true" />
              ) : (
                <Cloud size={18} aria-hidden="true" />
              )}
              <span>{syncNotice}</span>
            </div>
          )}
          <Outlet context={user} />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Main navigation">
        {navigation.map(({ label, to, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `bottom-nav-link${isActive ? ' is-active' : ''}`
            }
          >
            <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <FinanceAssistant userId={user.sub} />
    </div>
  );
}
