import { AlertCircle, ChartNoAxesCombined } from 'lucide-react';
import { liveQuery } from 'dexie';
import { useAuthUser } from '../components/useAuthUser';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getReceiptsForUser } from '../services/database';
import { buildReportData } from '../services/reportData';
import type { ReportDay } from '../services/reportData';
import type { VerifiedReceipt } from '../types/receipt';

const periods = [
  { label: '7 Days', days: 7 },
  { label: '15 Days', days: 15 },
  { label: '1 Month', days: 30 },
  { label: '1 Year', days: 365 },
] as const;

type ReportState =
  | { status: 'loading' }
  | { status: 'ready'; receipts: VerifiedReceipt[] }
  | { status: 'error'; message: string };

function formatDay(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T12:00:00`));
}

function formatValue(value: number, places: number): string {
  return (value / 10 ** places).toFixed(places);
}

function TrendChart({
  days,
  title,
  unit,
  color,
  valueKey,
  decimalPlaces,
}: {
  days: ReportDay[];
  title: string;
  unit: string;
  color: string;
  valueKey: 'litres' | 'earningsInr';
  decimalPlaces: number;
}) {
  const width = 760;
  const height = 220;
  const left = 48;
  const right = 744;
  const top = 18;
  const bottom = 174;
  const values = days.map((day) => Number(day[valueKey]));
  const max = Math.max(...values, 0);
  const scaleMax = max || 1;
  const points = values.map((value, index) => {
    const x =
      days.length < 2
        ? (left + right) / 2
        : left + (index / (days.length - 1)) * (right - left);
    const y = bottom - (value / scaleMax) * (bottom - top);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point}`).join(' ');
  const tickIndexes = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];

  return (
    <article className="panel trend-card">
      <div className="trend-heading">
        <div>
          <p className="eyebrow">{title}</p>
          <strong>
            {formatValue(max, decimalPlaces)} {unit}
          </strong>
        </div>
      </div>
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title} over the selected rolling report period`}
      >
        {[0, 0.5, 1].map((fraction) => {
          const y = bottom - fraction * (bottom - top);
          const value = max * fraction;
          return (
            <g key={fraction}>
              <line
                x1={left}
                x2={right}
                y1={y}
                y2={y}
                className="trend-gridline"
              />
              <text x={left - 8} y={y + 3} textAnchor="end" className="trend-axis-label">
                {formatValue(value, decimalPlaces)}
              </text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke={color} strokeWidth="3" />
        {values.map((value, index) => {
          if (value === 0 || days.length > 45 && index % 7 !== 0) return null;
          const [cx, cy] = points[index].split(',');
          return (
            <circle
              key={days[index].date}
              cx={cx}
              cy={cy}
              r="3"
              fill={color}
            >
              <title>
                {days[index].date}: {formatValue(value, decimalPlaces)} {unit}
              </title>
            </circle>
          );
        })}
        {tickIndexes.map((index) => {
          const x =
            days.length < 2
              ? (left + right) / 2
              : left + (index / (days.length - 1)) * (right - left);
          return (
            <text
              key={days[index].date}
              x={x}
              y={bottom + 24}
              textAnchor={index === 0 ? 'start' : index === days.length - 1 ? 'end' : 'middle'}
              className="trend-axis-label"
            >
              {formatDay(days[index].date)}
            </text>
          );
        })}
      </svg>
    </article>
  );
}

export default function Reports() {
  const user = useAuthUser();
  const [period, setPeriod] = useState<(typeof periods)[number]>(periods[0]);
  const [reportState, setReportState] = useState<ReportState>({
    status: 'loading',
  });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const subscription = liveQuery(() => getReceiptsForUser(user.sub)).subscribe({
      next: (receipts) => setReportState({ status: 'ready', receipts }),
      error: (error: unknown) =>
        setReportState({
          status: 'error',
          message:
            error instanceof Error
              ? `Could not read saved receipts: ${error.message}`
              : 'Could not read saved receipts from browser storage.',
        }),
    });
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      subscription.unsubscribe();
      window.clearInterval(timer);
    };
  }, [user.sub]);

  const receipts =
    reportState.status === 'ready' ? reportState.receipts : [];
  const report = useMemo(
    () => buildReportData(receipts, period.days, now),
    [receipts, period, now],
  );
  const periodReceipts = receipts
    .filter(
      (receipt) =>
        receipt.receiptDate >= report.from && receipt.receiptDate <= report.to,
    )
    .sort((a, b) =>
      `${b.receiptDate}T${b.receiptTime}`.localeCompare(
        `${a.receiptDate}T${a.receiptTime}`,
      ),
    );

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COLLECTION INSIGHTS</p>
          <h1>Reports</h1>
          <p className="page-subtitle">
            Live verified collection activity through today. The date range
            updates automatically.
          </p>
        </div>
      </div>

      <section className="panel report-controls" aria-label="Report period">
        <div className="period-tabs" role="tablist" aria-label="Choose a report period">
          {periods.map((item) => (
            <button
              className={`period-tab${period.label === item.label ? ' is-selected' : ''}`}
              key={item.label}
              type="button"
              role="tab"
              aria-selected={period.label === item.label}
              onClick={() => setPeriod(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="report-range">
          {formatDay(report.from)} – {formatDay(report.to)}
        </span>
      </section>

      {reportState.status === 'loading' && (
        <section className="panel report-empty" role="status">
          <p>Loading verified receipts…</p>
        </section>
      )}

      {reportState.status === 'error' && (
        <div className="intake-message is-rejected" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Report data could not be loaded</strong>
            <p>{reportState.message}</p>
          </div>
        </div>
      )}

      {reportState.status === 'ready' && (
        <>
          <section className="report-summary" aria-label="Selected period totals">
            <article className="panel report-summary-card">
              <span>Verified milk</span>
              <strong>{report.totals.litres} L</strong>
            </article>
            <article className="panel report-summary-card">
              <span>Verified earnings</span>
              <strong>₹{report.totals.earningsInr}</strong>
            </article>
            <article className="panel report-summary-card">
              <span>Approved receipts</span>
              <strong>{report.totals.receipts}</strong>
            </article>
          </section>

          {report.totals.receipts === 0 ? (
            <section className="panel report-empty">
              <span className="empty-icon">
                <ChartNoAxesCombined
                  size={25}
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
              </span>
              <h2>No collection data in this period</h2>
              <p>
                This live {period.label.toLowerCase()} report includes verified
                receipts dated {report.from} through {report.to}. No sample
                figures are shown.
              </p>
            </section>
          ) : (
            <>
              <section className="report-chart-grid" aria-label="Live collection graphs">
                <TrendChart
                  days={report.days}
                  title="Milk collected"
                  unit="L"
                  color="#2f8054"
                  valueKey="litres"
                  decimalPlaces={3}
                />
                <TrendChart
                  days={report.days}
                  title="Earnings"
                  unit="INR"
                  color="#b18836"
                  valueKey="earningsInr"
                  decimalPlaces={2}
                />
              </section>

              <section className="panel report-records">
                <div className="section-title-row">
                  <div>
                    <p className="eyebrow">VERIFIED REGISTER</p>
                    <h2>Recent receipts in this period</h2>
                  </div>
                  <span className="count-pill">{periodReceipts.length} receipts</span>
                </div>
                <div className="report-record-list">
                  {periodReceipts.slice(0, 10).map((receipt) => (
                    <Link
                      className="report-record-row"
                      to={`/app/receipts/${receipt.id}`}
                      key={receipt.id}
                    >
                      <span>
                        <strong>{receipt.receiptDate} · {receipt.receiptTime}</strong>
                        <small>{receipt.shift}</small>
                      </span>
                      <span>{receipt.quantityLitres} L</span>
                      <span>₹{receipt.totalAmount}</span>
                    </Link>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}

      <p className="data-note">
        Reports update when a verified receipt is saved. Receipts outside the
        selected rolling period are not included.
      </p>
    </div>
  );
}
