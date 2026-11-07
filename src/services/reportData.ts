import type { VerifiedReceipt } from '../types/receipt';

export interface ReportDay {
  date: string;
  litres: string;
  earningsInr: string;
  receipts: number;
}

export interface ReportData {
  from: string;
  to: string;
  totals: Omit<ReportDay, 'date'>;
  days: ReportDay[];
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shiftDate(date: Date, days: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    12,
  );
}

function parseScaledValue(value: string, places: number): number {
  const normalized = value.replace(/,/g, '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return 0;
  return Math.round(Number(normalized) * 10 ** places);
}

function formatScaledValue(value: number, places: number): string {
  return (value / 10 ** places).toFixed(places);
}

export function buildReportData(
  receipts: VerifiedReceipt[],
  periodDays: number,
  now = new Date(),
): ReportData {
  const today = toISODate(now);
  const from = toISODate(shiftDate(now, 1 - periodDays));
  const dayTotals = new Map<string, { litres: number; earnings: number; receipts: number }>();

  for (let offset = 1 - periodDays; offset <= 0; offset += 1) {
    dayTotals.set(toISODate(shiftDate(now, offset)), {
      litres: 0,
      earnings: 0,
      receipts: 0,
    });
  }

  for (const receipt of receipts) {
    if (receipt.verificationStatus !== 'verified') continue;
    const totals = dayTotals.get(receipt.receiptDate);
    if (!totals) continue;

    totals.litres += parseScaledValue(receipt.quantityLitres, 3);
    totals.earnings += parseScaledValue(receipt.totalAmount, 2);
    totals.receipts += 1;
  }

  const days = [...dayTotals.entries()].map(([date, totals]) => ({
    date,
    litres: formatScaledValue(totals.litres, 3),
    earningsInr: formatScaledValue(totals.earnings, 2),
    receipts: totals.receipts,
  }));
  const totals = days.reduce(
    (sum, day) => ({
      litres: sum.litres + parseScaledValue(day.litres, 3),
      earnings: sum.earnings + parseScaledValue(day.earningsInr, 2),
      receipts: sum.receipts + day.receipts,
    }),
    { litres: 0, earnings: 0, receipts: 0 },
  );

  return {
    from,
    to: today,
    totals: {
      litres: formatScaledValue(totals.litres, 3),
      earningsInr: formatScaledValue(totals.earnings, 2),
      receipts: totals.receipts,
    },
    days,
  };
}
