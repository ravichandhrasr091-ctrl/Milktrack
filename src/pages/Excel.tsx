import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  HardDrive,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { liveQuery } from 'dexie';
import { useAuthUser } from '../components/useAuthUser';
import { useEffect, useMemo, useState } from 'react';
import { createXlsxBytes } from '../services/xlsxWorkbook';
import type { XlsxWorksheet } from '../services/xlsxWorkbook';
import { getReceiptsForUser } from '../services/database';
import { buildReportData } from '../services/reportData';
import type { VerifiedReceipt } from '../types/receipt';

const reportPeriods = [
  { label: '7 Days', days: 7 },
  { label: '15 Days', days: 15 },
  { label: '1 Month', days: 30 },
  { label: '1 Year', days: 365 },
] as const;

type ReceiptsState =
  | { status: 'loading' }
  | { status: 'ready'; receipts: VerifiedReceipt[] }
  | { status: 'error'; message: string };

function toWorkbookRows(receipts: VerifiedReceipt[]): Record<string, string>[] {
  return receipts.map((receipt) => ({
    'Receipt ID': receipt.id,
    'Original image ref': receipt.originalImageRef,
    Date: receipt.receiptDate,
    Time: receipt.receiptTime,
    Shift: receipt.shift,
    'Milk type': receipt.milkType,
    'Quantity (litres)': receipt.quantityLitres,
    FAT: receipt.fat,
    SNF: receipt.snf,
    CLR: receipt.clr,
    'Rate per litre (INR)': receipt.ratePerLitre,
    'Total amount (INR)': receipt.totalAmount,
    'Supplier code': receipt.supplierCode ?? '',
    'MCC code': receipt.mccCode ?? '',
    'VLCC code': receipt.vlccCode ?? '',
    'Entry method': receipt.entryMethod,
    'Verified at': receipt.verificationTimestamp,
  }));
}

function parseScaledValue(value: string, places: number): number {
  const normalized = value.replace(/,/g, '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return 0;
  return Math.round(Number(normalized) * 10 ** places);
}

function formatScaledValue(value: number, places: number): string {
  return (value / 10 ** places).toFixed(places);
}

function summarizeReceipts(
  receipts: VerifiedReceipt[],
  groupBy: (receipt: VerifiedReceipt) => string,
  firstColumn: string,
): XlsxWorksheet {
  const totals = new Map<
    string,
    {
      morningLitres: number;
      nightLitres: number;
      totalLitres: number;
      earnings: number;
      receipts: number;
    }
  >();

  for (const receipt of receipts) {
    const key = groupBy(receipt);
    const value = totals.get(key) ?? {
      morningLitres: 0,
      nightLitres: 0,
      totalLitres: 0,
      earnings: 0,
      receipts: 0,
    };
    const litres = parseScaledValue(receipt.quantityLitres, 3);
    value.totalLitres += litres;
    value.earnings += parseScaledValue(receipt.totalAmount, 2);
    value.receipts += 1;
    if (receipt.shift === 'Night') value.nightLitres += litres;
    else value.morningLitres += litres;
    totals.set(key, value);
  }

  return {
    name: firstColumn === 'Date' ? 'Daily Summary' : 'Yearly Summary',
    headers: [
      firstColumn,
      'Morning / Day Litres',
      'Night Litres',
      'Total Litres',
      'Earnings (INR)',
      'Receipts',
    ],
    rows: [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [
        key,
        formatScaledValue(value.morningLitres, 3),
        formatScaledValue(value.nightLitres, 3),
        formatScaledValue(value.totalLitres, 3),
        formatScaledValue(value.earnings, 2),
        String(value.receipts),
      ]),
  };
}

function toWorksheet(
  name: string,
  rows: Record<string, string>[],
): XlsxWorksheet {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ['No records'];
  return {
    name,
    headers,
    rows: rows.map((row) => headers.map((header) => row[header] ?? '')),
  };
}

function buildWorkbookSheets(
  receipts: VerifiedReceipt[],
  periodDays: number,
  now: Date,
): XlsxWorksheet[] {
  const report = buildReportData(receipts, periodDays, now);
  return [
    toWorksheet('All Records', toWorkbookRows(receipts)),
    summarizeReceipts(receipts, (receipt) => receipt.receiptDate, 'Date'),
    toWorksheet(
      'Morning Shift',
      toWorkbookRows(receipts.filter((receipt) => receipt.shift === 'Morning/Day')),
    ),
    toWorksheet(
      'Night Shift',
      toWorkbookRows(receipts.filter((receipt) => receipt.shift === 'Night')),
    ),
    {
      name: 'Period Reports',
      headers: ['Date', 'Milk (litres)', 'Earnings (INR)', 'Receipts'],
      rows: report.days.map((day) => [
        day.date,
        day.litres,
        day.earningsInr,
        String(day.receipts),
      ]),
    },
    summarizeReceipts(
      receipts,
      (receipt) => receipt.receiptDate.slice(0, 7),
      'Month',
    ),
  ];
}

async function downloadWorkbook(
  receipts: VerifiedReceipt[],
  filename: string,
  title: string,
  periodDays: number,
  now: Date,
): Promise<void> {
  if (receipts.length === 0) {
    throw new Error(`${title} has no verified receipts to export.`);
  }

  const data = createXlsxBytes(buildWorkbookSheets(receipts, periodDays, now));
  const url = URL.createObjectURL(
    new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Excel() {
  const user = useAuthUser();
  const [receiptsState, setReceiptsState] = useState<ReceiptsState>({
    status: 'loading',
  });
  const [reportPeriod, setReportPeriod] =
    useState<(typeof reportPeriods)[number]>(reportPeriods[0]);
  const [now, setNow] = useState(() => new Date());
  const [exportError, setExportError] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const subscription = liveQuery(() => getReceiptsForUser(user.sub)).subscribe({
      next: (receipts) =>
        setReceiptsState({
          status: 'ready',
          receipts: receipts.filter(
            (receipt) => receipt.verificationStatus === 'verified',
          ),
        }),
      error: (error: unknown) =>
        setReceiptsState({
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
    receiptsState.status === 'ready' ? receiptsState.receipts : [];
  const report = useMemo(
    () => buildReportData(receipts, reportPeriod.days, now),
    [receipts, reportPeriod, now],
  );
  const reportReceipts = receipts.filter(
    (receipt) =>
      receipt.receiptDate >= report.from && receipt.receiptDate <= report.to,
  );

  async function exportReceipts(
    selected: VerifiedReceipt[],
    filename: string,
    title: string,
  ) {
    setExportError('');
    setExportMessage('');
    setIsExporting(true);
    try {
      await downloadWorkbook(
        selected,
        filename,
        title,
        reportPeriod.days,
        now,
      );
      setExportMessage(`${title} downloaded.`);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : `Could not export ${title.toLowerCase()}.`,
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR DATA, YOUR WORKBOOK</p>
          <h1>Excel</h1>
          <p className="page-subtitle">
            Preview and export your verified collection register.
          </p>
        </div>
        <span className="file-format-badge">
          <FileSpreadsheet size={16} aria-hidden="true" />
          .XLSX WORKBOOK
        </span>
      </div>

      <section className="panel workbook-card">
        <div className="workbook-icon">
          <FileSpreadsheet size={25} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div className="workbook-copy">
          <span className="eyebrow">MASTER WORKBOOK</span>
          <h2>Dodla_Milk_Collection_Master.xlsx</h2>
          <p>
            Generated from your verified receipts saved on this device. Pending
            or rejected entries are excluded.
          </p>
        </div>
        <div className="workbook-actions">
          <button
            className="button button-primary"
            type="button"
            disabled={receiptsState.status !== 'ready' || isExporting}
            onClick={() => {
              void exportReceipts(
                receipts,
                'Dodla_Milk_Collection_Master.xlsx',
                'Master workbook',
              );
            }}
          >
            <Download size={15} aria-hidden="true" />
            {isExporting ? 'Preparing Excel…' : 'Download master Excel'}
          </button>
          <span>
            {receiptsState.status === 'ready'
              ? `${receipts.length} verified ${receipts.length === 1 ? 'receipt' : 'receipts'}`
              : 'Loading verified receipts…'}
          </span>
        </div>
      </section>

      {exportError && (
        <div className="intake-message is-rejected" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{exportError}</p>
        </div>
      )}
      {exportMessage && (
        <div className="setup-notice" role="status">
          {exportMessage}
        </div>
      )}
      {receiptsState.status === 'error' && (
        <div className="intake-message is-rejected" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Saved receipts could not be loaded</strong>
            <p>{receiptsState.message}</p>
          </div>
        </div>
      )}

      <div className="workbook-grid">
        <section className="panel workbook-preview">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">IN-APP PREVIEW</p>
              <h2>All Records</h2>
            </div>
            <span className="count-pill">
              {receiptsState.status === 'ready'
                ? `${receipts.length} ${receipts.length === 1 ? 'record' : 'records'}`
                : '—'}
            </span>
          </div>
          {receiptsState.status === 'loading' && (
            <div className="table-empty" role="status">
              <p>Loading verified receipt records…</p>
            </div>
          )}
          {receiptsState.status === 'ready' && receipts.length === 0 && (
            <div className="table-empty">
              <p>Verified receipt records will appear here after you approve and save them.</p>
            </div>
          )}
          {receiptsState.status === 'ready' && receipts.length > 0 && (
            <div className="workbook-table-wrap">
              <table className="workbook-table">
                <thead>
                  <tr>
                    <th>Date / time</th>
                    <th>Shift</th>
                    <th>Litres</th>
                    <th>FAT</th>
                    <th>SNF</th>
                    <th>Rate</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((receipt) => (
                    <tr key={receipt.id}>
                      <td>
                        {receipt.receiptDate} {receipt.receiptTime}
                      </td>
                      <td>{receipt.shift}</td>
                      <td>{receipt.quantityLitres}</td>
                      <td>{receipt.fat}</td>
                      <td>{receipt.snf}</td>
                      <td>{receipt.ratePerLitre}</td>
                      <td>{receipt.totalAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel storage-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">STORAGE</p>
              <h2>Designed around your records</h2>
            </div>
            <HardDrive size={19} className="subtle-icon" aria-hidden="true" />
          </div>
          <div className="storage-feature">
            <span><LockKeyhole size={16} aria-hidden="true" /></span>
            <p><strong>Local-first</strong>Receipts are stored in this browser on this device.</p>
          </div>
          <div className="storage-feature">
            <span><ShieldCheck size={16} aria-hidden="true" /></span>
            <p><strong>Verified data only</strong>Exports contain approved receipt values only.</p>
          </div>
          <label className="report-export-period">
            Export period
            <select
              value={reportPeriod.label}
              onChange={(event) => {
                const nextPeriod = reportPeriods.find(
                  (item) => item.label === event.currentTarget.value,
                );
                if (nextPeriod) setReportPeriod(nextPeriod);
              }}
            >
              {reportPeriods.map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label} · {report.from} to {report.to}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-secondary full-width"
            type="button"
            disabled={receiptsState.status !== 'ready' || isExporting}
            onClick={() => {
              void exportReceipts(
                reportReceipts,
                `Dodla_Milk_Collection_${reportPeriod.label.replace(' ', '_')}.xlsx`,
                `${reportPeriod.label} report`,
              );
            }}
          >
            {isExporting ? 'Preparing Excel…' : 'Export selected report'}
          </button>
        </section>
      </div>
    </div>
  );
}
