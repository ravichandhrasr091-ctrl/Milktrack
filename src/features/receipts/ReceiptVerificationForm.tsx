import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  LoaderCircle,
  Save,
} from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type {
  BedrockVerification,
  ReceiptFieldKey,
} from '../../services/bedrockVerification';
import { getReceiptFieldLabel } from '../../services/bedrockVerification';
import { saveVerifiedReceipt } from '../../services/database';
import { getShiftFromReceiptTime } from '../../services/receiptParser';
import { validateReceiptReview } from '../../services/receiptValidation';
import type { ParsedDodlaReceipt, ParsedField } from '../../services/receiptParser';
import type {
  EntryMethod,
  ReceiptShift,
  VerifiedReceipt,
} from '../../types/receipt';

interface ReceiptVerificationFormProps {
  file: File;
  userId: string;
  entryMethod: EntryMethod;
  imageUrl: string;
  rawText: string;
  parsed: ParsedDodlaReceipt;
  aiCheck:
    | { status: 'checking' }
    | { status: 'unavailable'; message: string }
    | { status: 'completed'; result: BedrockVerification };
  onSaved: (
    receiptId: string,
    cloudSyncStatus: NonNullable<VerifiedReceipt['cloudSyncStatus']>,
    syncError?: string,
  ) => void;
}

interface ReviewValues {
  receiptDate: string;
  receiptTime: string;
  shift: ReceiptShift | '';
  milkType: string;
  quantityLitres: string;
  fat: string;
  snf: string;
  clr: string;
  ratePerLitre: string;
  totalAmount: string;
  supplierCode: string;
  mccCode: string;
  vlccCode: string;
}

function FieldSource({ field }: { field: ParsedField }) {
  if (!field.sourceText) {
    return <span className="review-field-source is-missing">Not read from photo</span>;
  }

  return (
    <span className="review-field-source">
      OCR read “{field.sourceText}”
      {field.needsReview ? ' · Needs review' : ' · Check against photo'}
      {field.confidence !== null && ` · Tesseract signal ${field.confidence}/100`}
    </span>
  );
}

export default function ReceiptVerificationForm({
  file,
  userId,
  entryMethod,
  imageUrl,
  rawText,
  parsed,
  aiCheck,
  onSaved,
}: ReceiptVerificationFormProps) {
  const [values, setValues] = useState<ReviewValues>({
    receiptDate: parsed.receiptDate.value,
    receiptTime: parsed.receiptTime.value,
    shift: getShiftFromReceiptTime(parsed.receiptTime.value),
    milkType: parsed.milkType.value,
    quantityLitres: parsed.quantityLitres.value,
    fat: parsed.fat.value,
    snf: parsed.snf.value,
    clr: parsed.clr.value,
    ratePerLitre: parsed.ratePerLitre.value,
    totalAmount: parsed.totalAmount.value,
    supplierCode: parsed.supplierCode.value,
    mccCode: parsed.mccCode.value,
    vlccCode: parsed.vlccCode.value,
  });
  const [confirmed, setConfirmed] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const validation = validateReceiptReview(values);

  function update<K extends keyof ReviewValues>(key: K, value: ReviewValues[K]) {
    setValues((current) => ({
      ...current,
      [key]: value,
      ...(key === 'receiptTime'
        ? { shift: getShiftFromReceiptTime(String(value)) }
        : {}),
    }));
    setConfirmed(false);
    setSaveError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttemptedSave(true);
    if (
      !validation.valid ||
      !confirmed ||
      isSaving ||
      aiCheck.status === 'checking'
    ) {
      return;
    }

    setIsSaving(true);
    setSaveError('');
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const receipt: VerifiedReceipt = {
      id,
      formatId: 'dodla-cow-provisional-slip-v1',
      milkType: 'Cow',
      receiptDate: values.receiptDate,
      receiptTime: values.receiptTime,
      shift: values.shift as ReceiptShift,
      quantityLitres: values.quantityLitres,
      fat: values.fat,
      snf: values.snf,
      clr: values.clr,
      ratePerLitre: values.ratePerLitre,
      totalAmount: values.totalAmount,
      ...(values.supplierCode.trim()
        ? { supplierCode: values.supplierCode.trim() }
        : {}),
      ...(values.mccCode.trim() ? { mccCode: values.mccCode.trim() } : {}),
      ...(values.vlccCode.trim() ? { vlccCode: values.vlccCode.trim() } : {}),
      originalImageRef: id,
      originalFilename: file.name,
      originalMimeType: file.type,
      ocrRawText: rawText,
      verificationStatus: 'verified',
      verificationTimestamp: now,
      createdAt: now,
      updatedAt: now,
      entryMethod,
    };

    try {
      const result = await saveVerifiedReceipt(receipt, file, userId);
      onSaved(id, result.cloudSyncStatus, result.syncError);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'The receipt could not be saved. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  function textField(
    label: string,
    key:
      | 'quantityLitres'
      | 'fat'
      | 'snf'
      | 'clr'
      | 'ratePerLitre'
      | 'totalAmount'
      | 'supplierCode'
      | 'mccCode'
      | 'vlccCode',
    extracted: ParsedField,
    hint: string,
    numeric = false,
  ) {
    const error = attemptedSave
      ? validation.errors[key as keyof typeof validation.errors]
      : undefined;

    return (
      <label className="review-field">
        <span className="review-field-label">
          {label}
          {!numeric && <span className="optional-label">Optional</span>}
        </span>
        <input
          type="text"
          inputMode={numeric ? 'decimal' : 'text'}
          value={values[key]}
          onChange={(event) => update(key, event.currentTarget.value)}
          autoComplete="off"
          aria-invalid={Boolean(error)}
        />
        <FieldSource field={extracted} />
        {error && <span className="field-error">{error}</span>}
        <span className="visually-hidden">{hint}</span>
      </label>
    );
  }

  function requiredSelect(
    label: string,
    key: 'milkType' | 'shift',
    extracted: ParsedField,
    options: { value: string; label: string }[],
    reviewText?: string,
  ) {
    const error = attemptedSave
      ? validation.errors[key as keyof typeof validation.errors]
      : undefined;
    return (
      <label className="review-field">
        <span className="review-field-label">{label}</span>
        <select
          value={values[key]}
          onChange={(event) =>
            update(key, event.currentTarget.value as ReviewValues[typeof key])
          }
          aria-invalid={Boolean(error)}
        >
          <option value="">Select after checking receipt</option>
          {options.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {reviewText ? (
          <span className="review-field-source is-missing">{reviewText}</span>
        ) : (
          <FieldSource field={extracted} />
        )}
        {error && <span className="field-error">{error}</span>}
      </label>
    );
  }

  const dateError = attemptedSave ? validation.errors.receiptDate : undefined;
  const timeError = attemptedSave ? validation.errors.receiptTime : undefined;

  return (
    <form className="verification-form" onSubmit={handleSubmit} noValidate>
      <div className="verification-photo">
        <img src={imageUrl} alt="Original receipt photo for verification" />
        <span>Original photo · unchanged</span>
      </div>

      <div className="verification-content">
        <div className="verification-heading">
          <div>
            <p className="eyebrow">VERIFY EVERY FIELD</p>
            <h3>Check the printed values</h3>
          </div>
          <span className="local-ocr-badge">
            <CheckCircle2 size={14} aria-hidden="true" />
            OCR runs on this device
          </span>
        </div>

        <p className="verification-intro">
          Compare each value with the original photo. The OCR signal is only an
          engine estimate, not a guarantee of accuracy. Nova Lite receives a
          temporary compressed photo and the extracted fields for one
          cross-check; MilkTrack does not save that AI request or response.
        </p>

        <BedrockCheckPanel aiCheck={aiCheck} />

        <div className="review-fields">
          <label className="review-field">
            <span className="review-field-label">Receipt date</span>
            <input
              type="date"
              value={values.receiptDate}
              onChange={(event) =>
                update('receiptDate', event.currentTarget.value)
              }
              aria-invalid={Boolean(dateError)}
            />
            <span className="review-field-source is-missing">
              Printed date: “{parsed.receiptDateText || 'not detected'}”.
              Automatically interpreted as DD/MM/YY.
            </span>
            {dateError && <span className="field-error">{dateError}</span>}
          </label>

          <label className="review-field">
            <span className="review-field-label">Receipt time</span>
            <input
              type="time"
              value={values.receiptTime}
              onChange={(event) =>
                update('receiptTime', event.currentTarget.value)
              }
              aria-invalid={Boolean(timeError)}
            />
            <FieldSource field={parsed.receiptTime} />
            {timeError && <span className="field-error">{timeError}</span>}
          </label>

          <label className="review-field">
            <span className="review-field-label">Shift</span>
            <input
              type="text"
              value={
                values.shift === 'Morning/Day'
                  ? 'Morning / Day'
                  : values.shift
              }
              readOnly
              aria-invalid={Boolean(
                attemptedSave && validation.errors.shift,
              )}
            />
            <span className="review-field-source">
              {values.receiptTime
                ? `Automatically derived from receipt time ${values.receiptTime}: 06:00–17:59 is Morning / Day; other times are Night.`
                : 'Enter a valid receipt time to determine the shift.'}
              {parsed.shiftText &&
                ` Printed shift mark “${parsed.shiftText}” is shown for reference only.`}
            </span>
            {attemptedSave && validation.errors.shift && (
              <span className="field-error">{validation.errors.shift}</span>
            )}
          </label>

          {requiredSelect(
            'Milk type',
            'milkType',
            parsed.milkType,
            [{ value: 'Cow', label: 'Cow' }],
          )}

          {textField(
            'Quantity (litres)',
            'quantityLitres',
            parsed.quantityLitres,
            'Use the exact decimal printed on the receipt.',
            true,
          )}
          {textField('FAT', 'fat', parsed.fat, 'FAT value as printed.', true)}
          {textField('SNF', 'snf', parsed.snf, 'SNF value as printed.', true)}
          {textField('CLR', 'clr', parsed.clr, 'CLR value as printed.', true)}
          {textField(
            'Rate per litre',
            'ratePerLitre',
            parsed.ratePerLitre,
            'Rate as printed.',
            true,
          )}
          {textField(
            'Total amount',
            'totalAmount',
            parsed.totalAmount,
            'Amount as printed.',
            true,
          )}
          {textField(
            'Member / supplier code',
            'supplierCode',
            parsed.supplierCode,
            'Optional code as printed.',
          )}
          {textField(
            'MCC code',
            'mccCode',
            parsed.mccCode,
            'Optional MCC code as printed.',
          )}
          {textField(
            'VLCC code',
            'vlccCode',
            parsed.vlccCode,
            'Optional VLCC code as printed.',
          )}
        </div>

        {validation.amountMismatch && (
          <div className="verification-warning" role="status">
            <AlertTriangle size={17} aria-hidden="true" />
            <span>
              Quantity × rate does not match the printed amount to the nearest
              paisa. Check both source values; neither is changed automatically.
            </span>
          </div>
        )}

        <details className="ocr-diagnostics">
          <summary>Show raw OCR text (temporary review diagnostics)</summary>
          <pre>{rawText}</pre>
        </details>

        <label className="approval-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
          />
          <span>
            I checked the values against the original photo and approve them
            for saving as a verified receipt.
          </span>
        </label>

        {saveError && (
          <div className="intake-message is-rejected" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>Receipt was not saved</strong>
              <p>{saveError}</p>
              <p>The original photo remains temporary. Correct the issue and retry.</p>
            </div>
          </div>
        )}

        <div className="verification-actions">
          <button
            className="button button-primary"
            type="submit"
            disabled={
              !confirmed || isSaving || aiCheck.status === 'checking'
            }
          >
            {aiCheck.status === 'checking' ? (
              <>
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
                Waiting for AI cross-check…
              </>
            ) : isSaving ? (
              <>
                <span className="button-spinner" aria-hidden="true" />
                Saving original photo and receipt…
              </>
            ) : (
              <>
                <Save size={16} aria-hidden="true" />
                Verify &amp; Save
              </>
            )}
          </button>
        </div>

        <p className="storage-disclaimer">
          Saved locally on this device in your browser. Browser data can be
          cleared; regular backups will be added in a later milestone.
        </p>
      </div>
    </form>
  );
}

function BedrockCheckPanel({
  aiCheck,
}: {
  aiCheck:
    | { status: 'checking' }
    | { status: 'unavailable'; message: string }
    | { status: 'completed'; result: BedrockVerification };
}) {
  if (aiCheck.status === 'checking') {
    return (
      <div className="ai-check-panel is-checking" role="status">
        <LoaderCircle className="spin" size={17} aria-hidden="true" />
        <div>
          <strong>Checking extracted fields with Nova Lite</strong>
          <p>
            This receipt photo is being sent to Amazon Bedrock once for a
            comparison. Your original stays unchanged on this device.
          </p>
        </div>
      </div>
    );
  }

  if (aiCheck.status === 'unavailable') {
    return (
      <div className="ai-check-panel is-unavailable" role="status">
        <CircleHelp size={17} aria-hidden="true" />
        <div>
          <strong>AI cross-check unavailable</strong>
          <p>{aiCheck.message}</p>
          <p>You can continue by checking every value against the photo.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="ai-check-panel is-complete" aria-label="Nova Lite cross-check results">
      <div className="ai-check-heading">
        <CheckCircle2 size={17} aria-hidden="true" />
        <div>
          <strong>Nova Lite cross-check suggestions</strong>
          <p>AI can make mistakes. Compare each result with the printed receipt.</p>
        </div>
      </div>
      <div className="ai-check-results">
        {aiCheck.result.checks.map((check) => (
          <AIFieldCheck
            key={check.field}
            field={check.field}
            status={check.status}
            ocrValue={check.ocrValue}
            imageValue={check.imageValue}
            note={check.note}
          />
        ))}
      </div>
    </section>
  );
}

function AIFieldCheck({
  field,
  status,
  ocrValue,
  imageValue,
  note,
}: {
  field: ReceiptFieldKey;
  status: 'match' | 'mismatch' | 'uncertain';
  ocrValue: string;
  imageValue: string | null;
  note: string;
}) {
  const StatusIcon =
    status === 'match'
      ? CheckCircle2
      : status === 'mismatch'
        ? AlertTriangle
        : CircleHelp;

  return (
    <div className={`ai-check-result is-${status}`}>
      <StatusIcon size={15} aria-hidden="true" />
      <div>
        <strong>{getReceiptFieldLabel(field)}</strong>
        <p>
          OCR: {ocrValue || 'not detected'} · Image: {imageValue || 'unclear'}
        </p>
        <span>{note}</span>
      </div>
      <span className="ai-check-status">
        {status === 'match'
          ? 'Looks consistent'
          : status === 'mismatch'
            ? 'Please check'
            : 'Uncertain'}
      </span>
    </div>
  );
}
