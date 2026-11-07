export interface OcrWord {
  text: string;
  confidence: number;
}

export interface ParsedField {
  value: string;
  sourceText: string;
  confidence: number | null;
  needsReview: boolean;
}

export interface ParsedDodlaReceipt {
  recognized: boolean;
  rejectionReason?: string;
  receiptDate: ParsedField;
  receiptDateText: string;
  receiptTime: ParsedField;
  shift: ParsedField;
  shiftText: string;
  milkType: ParsedField;
  quantityLitres: ParsedField;
  fat: ParsedField;
  snf: ParsedField;
  clr: ParsedField;
  ratePerLitre: ParsedField;
  totalAmount: ParsedField;
  supplierCode: ParsedField;
  mccCode: ParsedField;
  vlccCode: ParsedField;
}

const NEEDS_REVIEW_THRESHOLD = 80;
const missing = (): ParsedField => ({
  value: '',
  sourceText: '',
  confidence: null,
  needsReview: true,
});

function findConfidence(source: string, words: OcrWord[]): number | null {
  const candidates = source
    .split(/\s+/)
    .map((part) => part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.%/_-]+$/g, ''))
    .filter(Boolean);

  const confidences = candidates.flatMap((candidate) => {
    const word = words.find((item) => {
      const normalized = item.text.replace(
        /^[^A-Za-z0-9]+|[^A-Za-z0-9.%/_-]+$/g,
        '',
      );
      return normalized.toLowerCase() === candidate.toLowerCase();
    });
    return word ? [word.confidence] : [];
  });

  return confidences.length > 0
    ? confidences.reduce((sum, confidence) => sum + confidence, 0) /
        confidences.length
    : null;
}

function field(
  sourceText: string | undefined,
  words: OcrWord[],
  forceReview = false,
): ParsedField {
  if (!sourceText) return missing();
  const confidence = findConfidence(sourceText, words);
  return {
    value: sourceText,
    sourceText,
    confidence,
    needsReview:
      forceReview ||
      confidence === null ||
      confidence < NEEDS_REVIEW_THRESHOLD,
  };
}

function matchValue(text: string, expression: RegExp): string | undefined {
  return expression.exec(text)?.[1]?.trim();
}

function removeTrailingPunctuation(value: string | undefined): string | undefined {
  return value?.replace(/[%.,;:]+$/g, '');
}

function parseDodlaReceiptDate(value: string): string {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(value);
  if (!match) return '';

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return '';
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeDodlaReceiptTime(value: string): string {
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  if (!match) return '';
  const hour = Number(match[1]);
  return hour <= 23
    ? `${String(hour).padStart(2, '0')}:${match[2]}`
    : '';
}

export function getShiftFromReceiptTime(
  time: string,
): 'Morning/Day' | 'Night' | '' {
  const normalizedTime = normalizeDodlaReceiptTime(time);
  if (!normalizedTime) return '';

  const hour = Number(normalizedTime.slice(0, 2));
  return hour >= 6 && hour < 18 ? 'Morning/Day' : 'Night';
}

export function parseDodlaReceipt(
  rawText: string,
  words: OcrWord[] = [],
): ParsedDodlaReceipt {
  const text = rawText.replace(/\r/g, '');
  const looksLikeDodla = /\bdodla\b/i.test(text);
  const looksLikeCow = /\bcow\b/i.test(text);
  const looksLikeCollectionSlip =
    /provisional\s+acknowledg(?:e)?ment/i.test(text) ||
    /\bquantity\b/i.test(text);

  if (!looksLikeDodla || !looksLikeCow || !looksLikeCollectionSlip) {
    return {
      recognized: false,
      rejectionReason:
        'This photo does not clearly match the supported Dodla Cow collection slip format.',
      receiptDate: missing(),
      receiptDateText: '',
      receiptTime: missing(),
      shift: missing(),
      shiftText: '',
      milkType: missing(),
      quantityLitres: missing(),
      fat: missing(),
      snf: missing(),
      clr: missing(),
      ratePerLitre: missing(),
      totalAmount: missing(),
      supplierCode: missing(),
      mccCode: missing(),
      vlccCode: missing(),
    };
  }

  const dateText =
    matchValue(text, /\bdate\s*:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i) ?? '';
  const normalizedDate = parseDodlaReceiptDate(dateText);

  const timeText =
    matchValue(
      text,
      /\b(?:time|ting|t1me)\s*:\s*(\d{1,2}:\d{2}(?::\d{2})?)/i,
    ) ?? '';
  const normalizedTime = normalizeDodlaReceiptTime(timeText);
  const shiftFromTime = getShiftFromReceiptTime(normalizedTime);
  const shiftText =
    matchValue(text, /\bshift\s*:\s*([A-Za-z£€0-9])/i) ?? '';
  const milkTypeText = matchValue(text, /\bmilk\s*type\s*:\s*(cow)\b/i) ?? '';
  const quantityText = matchValue(
    text,
    /\bquantity\s*:\s*(\d+(?:[.,]\d+)?)/i,
  );
  const fatText = removeTrailingPunctuation(
    matchValue(text, /\bfat\s*:\s*(\d+(?:[.,]\d+)?%?)/i),
  );
  const snfText = removeTrailingPunctuation(
    matchValue(text, /\b(?:snf|ske)\s*:\s*(\d+(?:[.,]\d+)?%?)/i),
  );
  const clrText = matchValue(text, /\bclr\s*:\s*(\d+(?:[.,]\d+)?)/i);
  const rateText = matchValue(
    text,
    /\brate\s*\(?(?:rs\.?)?\)?\s*:\s*(\d+(?:[.,]\d+)?)/i,
  );
  const amountText = removeTrailingPunctuation(
    matchValue(text, /\bamount\s*:\s*(\d+(?:[.,]\d+)?)/i),
  );

  const mccText = matchValue(
    text,
    /\b(?:mcc|hcc|ncc)\s*code\s*:\s*([A-Z0-9_-]+)/i,
  );
  const vlccText = matchValue(
    text,
    /\b(?:vlcc|ulcc)\s*code\s*:\s*([A-Z0-9_-]+)/i,
  );
  const supplierCodeText = matchValue(
    text,
    /\bcode\s*:\s*(\d+\s+\d{4,})/i,
  );

  const mccLabel = /\bMCC\s*Code\b/i.test(text);
  const vlccLabel = /\bVLCC\s*Code\b/i.test(text);
  const snfLabel = /\bSNF\s*:/i.test(text);
  return {
    recognized: true,
    receiptDate: { ...field(dateText, words, !normalizedDate), value: normalizedDate },
    receiptDateText: dateText,
    receiptTime: {
      ...field(timeText, words, !normalizedTime),
      value: normalizedTime,
    },
    shift: {
      value: shiftFromTime,
      sourceText: normalizedTime ? `Derived from ${normalizedTime}` : '',
      confidence: null,
      needsReview: !shiftFromTime,
    },
    shiftText,
    milkType: field(milkTypeText, words),
    quantityLitres: field(quantityText, words),
    fat: field(fatText, words),
    snf: field(snfText, words, !snfLabel),
    clr: field(clrText, words),
    ratePerLitre: field(rateText, words),
    totalAmount: field(amountText, words),
    supplierCode: field(supplierCodeText, words),
    mccCode: field(mccText, words, !mccLabel),
    vlccCode: field(vlccText, words, !vlccLabel),
  };
}

export function getReceiptTypeRejectionReason(
  parsed: ParsedDodlaReceipt,
): string | undefined {
  return parsed.recognized ? undefined : parsed.rejectionReason;
}

export function getSupportedLayoutName(rawText: string): string | undefined {
  return /\bdodla\b/i.test(rawText.toLowerCase())
    ? 'Dodla Cow provisional acknowledgement slip'
    : undefined;
}

export function hasRecognizedLabels(rawText: string): boolean {
  const text = rawText.toLowerCase();
  return (
    /\bquantity\s*:/.test(text) &&
    /\bfat\s*:/.test(text) &&
    /\b(?:snf|ske)\s*:/.test(text)
  );
}

export function getParserDebugSummary(parsed: ParsedDodlaReceipt): string {
  return parsed.recognized
    ? 'Dodla Cow receipt template detected; field values remain subject to user verification.'
    : 'Receipt format not recognized.';
}

export function getRawLineContaining(rawText: string, label: string): string {
  return rawText
    .split(/\r?\n/)
    .find((line) => line.toLowerCase().includes(label.toLowerCase()))
    ?.trim() ?? '';
}

export function normalizeDateInput(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

export function normalizeTimeInput(value: string): string {
  return /^\d{2}:\d{2}$/.test(value) ? value : '';
}
