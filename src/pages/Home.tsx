import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { useAuthUser } from '../components/useAuthUser';
import ReceiptIntake from '../features/receipts/ReceiptIntake';
import { buildFinanceContext } from '../services/financeContext';
import { getReceiptsForUser } from '../services/database';
import type { VerifiedReceipt } from '../types/receipt';

type ReceiptsState =
  | { status: 'loading' }
  | { status: 'ready'; receipts: VerifiedReceipt[] }
  | { status: 'error'; message: string };

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function Home() {
  const user = useAuthUser();
  const [receiptsState, setReceiptsState] = useState<ReceiptsState>({
    status: 'loading',
  });

  useEffect(() => {
    const subscription = liveQuery(() => getReceiptsForUser(user.sub)).subscribe({
      next: (receipts) => setReceiptsState({ status: 'ready', receipts }),
      error: (error: unknown) =>
        setReceiptsState({
          status: 'error',
          message:
            error instanceof Error
              ? `Could not read saved receipts: ${error.message}`
              : 'Could not read saved receipts from browser storage.',
        }),
    });
    return () => subscription.unsubscribe();
  }, [user.sub]);

  const todayTotals = useMemo(() => {
    if (receiptsState.status !== 'ready') return null;
    return buildFinanceContext(
      'today',
      receiptsState.receipts,
      new Date(),
    ).totals;
  }, [receiptsState]);
  const hasTodayReceipts = Boolean(todayTotals?.receipts);
  const recentReceipts =
    receiptsState.status === 'ready'
      ? [...receiptsState.receipts]
          .sort((a, b) =>
            `${b.receiptDate}T${b.receiptTime}`.localeCompare(
              `${a.receiptDate}T${a.receiptTime}`,
            ),
          )
          .slice(0, 3)
      : [];
  const statValues = [
    {
      label: 'Verified milk today',
      value: hasTodayReceipts ? todayTotals!.litres : '—',
      unit: 'litres',
      icon: Sun,
    },
    {
      label: 'Verified earnings',
      value: hasTodayReceipts ? todayTotals!.earningsInr : '—',
      unit: 'INR',
      icon: ArrowUpRight,
    },
    {
      label: 'Approved receipts',
      value:
        receiptsState.status === 'ready'
          ? String(receiptsState.receipts.length)
          : '—',
      unit: 'receipts',
      icon: Check,
    },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading home-heading">
        <div>
          <p className="eyebrow">YOUR COLLECTION, AT A GLANCE</p>
          <h1>Good day.</h1>
          <p className="page-subtitle">
            A clear, dependable record starts with a verified receipt.
          </p>
        </div>
        <div className="local-badge">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>Private by design</span>
        </div>
      </div>

      <section className="welcome-card" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <span className="welcome-kicker">MILK COLLECTION, MADE SIMPLE</span>
          <h2 id="welcome-title">Every collection, clearly accounted for.</h2>
          <p>
            Add a receipt to begin building your trusted digital register.
            Nothing is saved until you review and approve it.
          </p>
          <ReceiptIntake userId={user.sub} />
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-ring art-ring-one" />
          <div className="art-ring art-ring-two" />
          <div className="art-leaf art-leaf-one" />
          <div className="art-leaf art-leaf-two" />
          <div className="art-orbit">
            <span className="art-drop">
              <span />
            </span>
          </div>
          <span className="art-spark art-spark-one">✳</span>
          <span className="art-spark art-spark-two">✳</span>
        </div>
        <span className="welcome-watermark">MILKTRACK</span>
      </section>

      <section className="stat-grid" aria-label="Today's verified totals">
        {statValues.map(({ label, value, unit, icon: Icon }) => (
          <article className="stat-card" key={label}>
            <div className="stat-topline">
              <span>{label}</span>
              <span className="stat-icon">
                <Icon size={17} aria-hidden="true" />
              </span>
            </div>
            <div className="stat-value">{value}</div>
            <span className="stat-unit">{unit}</span>
          </article>
        ))}
      </section>

      {receiptsState.status === 'error' && (
        <div className="intake-message is-rejected" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Dashboard data could not be loaded</strong>
            <p>{receiptsState.message}</p>
          </div>
        </div>
      )}

      <section className="dashboard-lower">
        <div className="panel shift-panel">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">TODAY</p>
              <h2>Shift overview</h2>
            </div>
            <span className="subtle-label">Verified records only</span>
          </div>
          <div className="shift-list">
            <div className="shift-row">
              <span className="shift-icon morning">
                <Sun size={18} aria-hidden="true" />
              </span>
              <span className="shift-name">Morning / Day</span>
              <span className="shift-value">
                {todayTotals?.shifts.morningDay.receipts
                  ? todayTotals.shifts.morningDay.litres
                  : '—'}{' '}
                <small>L</small>
              </span>
              <span className="shift-earnings">
                {todayTotals?.shifts.morningDay.receipts
                  ? `₹${todayTotals.shifts.morningDay.earningsInr}`
                  : '—'}
              </span>
            </div>
            <div className="shift-row">
              <span className="shift-icon night">
                <Moon size={18} aria-hidden="true" />
              </span>
              <span className="shift-name">Night</span>
              <span className="shift-value">
                {todayTotals?.shifts.night.receipts
                  ? todayTotals.shifts.night.litres
                  : '—'}{' '}
                <small>L</small>
              </span>
              <span className="shift-earnings">
                {todayTotals?.shifts.night.receipts
                  ? `₹${todayTotals.shifts.night.earningsInr}`
                  : '—'}
              </span>
            </div>
          </div>
          <p className="panel-footnote">
            Totals include verified receipts dated {toISODate(new Date())}.
          </p>
        </div>

        <div className="panel recent-panel">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">YOUR REGISTER</p>
              <h2>Recent receipts</h2>
            </div>
            <Link className="text-link" to="/app/receipts">
              View all <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {receiptsState.status === 'loading' && (
            <div className="compact-empty" role="status">
              <p>Loading saved receipts…</p>
            </div>
          )}
          {receiptsState.status === 'ready' &&
            recentReceipts.length === 0 && (
              <div className="compact-empty">
                <span className="empty-icon small-empty-icon">
                  <Clock3 size={19} aria-hidden="true" />
                </span>
                <div>
                  <strong>No receipts yet</strong>
                  <p>Your approved collection history will show here.</p>
                </div>
              </div>
            )}
          {recentReceipts.map((receipt) => (
            <Link
              className="dashboard-recent-receipt"
              to={`/app/receipts/${receipt.id}`}
              key={receipt.id}
            >
              <span className="empty-icon small-empty-icon">
                <Clock3 size={19} aria-hidden="true" />
              </span>
              <span className="dashboard-recent-copy">
                <strong>
                  {receipt.quantityLitres} litres · ₹{receipt.totalAmount}
                </strong>
                <span>
                  {receipt.receiptDate} · {receipt.receiptTime} · {receipt.shift}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
