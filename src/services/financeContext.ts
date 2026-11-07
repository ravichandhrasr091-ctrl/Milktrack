import type { VerifiedReceipt } from '../types/receipt';

export interface FinanceRollup {
  receipts: number;
  litres: string;
  earningsInr: string;
  shifts: {
    morningDay: FinanceTotals;
    night: FinanceTotals;
  };
}

export interface FinanceTotals {
  receipts: number;
  litres: string;
  earningsInr: string;
}

export interface FinanceContext {
  currency: 'INR';
  verifiedReceipts: number;
  period: { from: string | null; to: string | null };
  totals: FinanceRollup;
  monthlyTotals: ({ month: string } & FinanceRollup)[];
  dailyTotals: ({ date: string } & FinanceRollup)[];
}

export function questionNeedsFinancialData(question: string): boolean {
  const directFinancialMeasure =
    /\b(financ\w*|earn\w*|income|money|rupees?|inr|amount|revenue|profit|payment|paid|rate|litres?|liters?|quantity)\b|₹/i.test(
      question,
    );
  if (directFinancialMeasure) return true;

  const asksForSummary =
    /\b(total|average|compare|versus|vs\.?|trend|how much|how many|number of|summari[sz]e|most|fewest|highest|lowest)\b/i.test(
      question,
    );
  const collectionTopic =
    /\b(receipts?|collections?|collected|shifts?|milk|morning|night)\b/i.test(
      question,
    );
  const mentionsPeriod =
    /\b(today|yesterday|week|month|year|last|this)\b/i.test(question);

  return (
    (asksForSummary && collectionTopic) ||
    (mentionsPeriod && collectionTopic)
  );
}

interface RequestedPeriod {
  from: string | null;
  to: string | null;
}

interface MutableTotals {
  receipts: number;
  litresMilli: number;
  earningsPaise: number;
  shifts: {
    morningDay: Omit<MutableTotals, 'shifts'>;
    night: Omit<MutableTotals, 'shifts'>;
  };
}

const EMPTY_TOTALS = (): MutableTotals => ({
  receipts: 0,
  litresMilli: 0,
  earningsPaise: 0,
  shifts: {
    morningDay: { receipts: 0, litresMilli: 0, earningsPaise: 0 },
    night: { receipts: 0, litresMilli: 0, earningsPaise: 0 },
  },
});

export function buildFinanceContext(
  question: string,
  receipts: VerifiedReceipt[],
  now = new Date(),
): FinanceContext {
  const period = getRequestedPeriod(question, now);
  const verified = receipts.filter(
    (receipt) =>
      receipt.verificationStatus === 'verified' &&
      isValidISODate(receipt.receiptDate) &&
      (!period.from || receipt.receiptDate >= period.from) &&
      (!period.to || receipt.receiptDate <= period.to),
  );
  const total = EMPTY_TOTALS();
  const months = new Map<string, MutableTotals>();
  const days = new Map<string, MutableTotals>();

  for (const receipt of verified) {
    const litresMilli = parseScaledValue(receipt.quantityLitres, 3);
    const earningsPaise = parseScaledValue(receipt.totalAmount, 2);
    const shiftKey = receipt.shift === 'Night' ? 'night' : 'morningDay';
    const monthKey = receipt.receiptDate.slice(0, 7);
    const dayKey = receipt.receiptDate;
    const month = months.get(monthKey) ?? EMPTY_TOTALS();
    const day = days.get(dayKey) ?? EMPTY_TOTALS();

    addReceipt(total, shiftKey, litresMilli, earningsPaise);
    addReceipt(month, shiftKey, litresMilli, earningsPaise);
    addReceipt(day, shiftKey, litresMilli, earningsPaise);
    months.set(monthKey, month);
    days.set(dayKey, day);
  }

  const dailyRequested =
    /\b(day|daily|date|shift|morning|night|today|yesterday|week)\b/i.test(
      question,
    );
  const orderedDays = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  const selectedDays = dailyRequested ? orderedDays.slice(-90) : [];

  return {
    currency: 'INR',
    verifiedReceipts: verified.length,
    period,
    totals: formatTotals(total),
    monthlyTotals: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({ month, ...formatTotals(values) })),
    dailyTotals: selectedDays.map(([date, values]) => ({
      date,
      ...formatTotals(values),
    })),
  };
}

function getRequestedPeriod(question: string, now: Date): RequestedPeriod {
  const today = toISODate(now);
  const normalized = question.toLowerCase();
  const isComparison =
    /\b(compare|versus|vs\.?|compared\s+with)\b/.test(normalized);

  if (
    isComparison &&
    /\bthis\s+month\b/.test(normalized) &&
    /\blast\s+month\b/.test(normalized)
  ) {
    const firstOfThisMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      12,
    );
    const lastOfLastMonth = shiftDate(firstOfThisMonth, -1);
    return {
      from: `${lastOfLastMonth.slice(0, 7)}-01`,
      to: today,
    };
  }
  if (
    isComparison &&
    /\bthis\s+week\b/.test(normalized) &&
    /\blast\s+week\b/.test(normalized)
  ) {
    const dayOfWeek = (now.getDay() + 6) % 7;
    return { from: shiftDate(now, -dayOfWeek - 7), to: today };
  }

  if (/\btoday\b/.test(normalized)) return { from: today, to: today };
  if (/\byesterday\b/.test(normalized)) {
    const yesterday = shiftDate(now, -1);
    return { from: yesterday, to: yesterday };
  }
  if (/\blast\s+7\s+days?\b/.test(normalized)) {
    return { from: shiftDate(now, -6), to: today };
  }
  const lastDays = normalized.match(/\blast\s+(\d{1,3})\s+days?\b/);
  if (lastDays) {
    const count = Math.min(365, Math.max(1, Number(lastDays[1])));
    return { from: shiftDate(now, -(count - 1)), to: today };
  }
  if (/\bthis\s+week\b/.test(normalized)) {
    const dayOfWeek = (now.getDay() + 6) % 7;
    return { from: shiftDate(now, -dayOfWeek), to: today };
  }
  if (/\blast\s+week\b/.test(normalized)) {
    const dayOfWeek = (now.getDay() + 6) % 7;
    const end = shiftDate(now, -dayOfWeek - 1);
    return { from: shiftDate(now, -dayOfWeek - 7), to: end };
  }
  if (/\bthis\s+month\b/.test(normalized)) {
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }
  if (/\blast\s+month\b/.test(normalized)) {
    const firstOfThisMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      12,
    );
    const lastOfLastMonth = shiftDate(firstOfThisMonth, -1);
    return {
      from: `${lastOfLastMonth.slice(0, 7)}-01`,
      to: lastOfLastMonth,
    };
  }
  if (/\bthis\s+year\b/.test(normalized)) {
    return { from: `${now.getFullYear()}-01-01`, to: today };
  }
  if (/\blast\s+year\b/.test(normalized)) {
    const year = now.getFullYear() - 1;
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  const explicitDate = normalized.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (explicitDate && isValidISODate(explicitDate[1])) {
    return { from: explicitDate[1], to: explicitDate[1] };
  }

  return { from: null, to: null };
}

function addReceipt(
  totals: MutableTotals,
  shift: 'morningDay' | 'night',
  litresMilli: number,
  earningsPaise: number,
) {
  totals.receipts += 1;
  totals.litresMilli += litresMilli;
  totals.earningsPaise += earningsPaise;
  totals.shifts[shift].receipts += 1;
  totals.shifts[shift].litresMilli += litresMilli;
  totals.shifts[shift].earningsPaise += earningsPaise;
}

function formatTotals(totals: MutableTotals): FinanceRollup {
  return {
    receipts: totals.receipts,
    litres: formatScaledValue(totals.litresMilli, 3),
    earningsInr: formatScaledValue(totals.earningsPaise, 2),
    shifts: {
      morningDay: formatSimpleTotals(totals.shifts.morningDay),
      night: formatSimpleTotals(totals.shifts.night),
    },
  };
}

function formatSimpleTotals(
  totals: Omit<MutableTotals, 'shifts'>,
): FinanceTotals {
  return {
    receipts: totals.receipts,
    litres: formatScaledValue(totals.litresMilli, 3),
    earningsInr: formatScaledValue(totals.earningsPaise, 2),
  };
}

function parseScaledValue(value: string, decimalPlaces: number): number {
  const normalized = value.replace(/,/g, '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return 0;
  return Math.round(Number(normalized) * 10 ** decimalPlaces);
}

function formatScaledValue(value: number, decimalPlaces: number): string {
  return (value / 10 ** decimalPlaces).toFixed(decimalPlaces);
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && toISODate(date) === value;
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(date: Date, days: number): string {
  const shifted = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    12,
  );
  return toISODate(shifted);
}
