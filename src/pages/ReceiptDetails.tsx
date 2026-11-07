import { ArrowLeft, AlertCircle, Image } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { useAuthUser } from '../components/useAuthUser';
import {
  getReceiptForUser,
  getReceiptImageForUser,
} from '../services/database';
import type { ReceiptImage, VerifiedReceipt } from '../types/receipt';

type DetailsState =
  | { status: 'loading' }
  | { status: 'ready'; receipt: VerifiedReceipt; image?: ReceiptImage }
  | { status: 'missing' }
  | { status: 'error'; message: string };

const details = [
  ['Receipt date', (receipt: VerifiedReceipt) => receipt.receiptDate],
  ['Receipt time', (receipt: VerifiedReceipt) => receipt.receiptTime],
  ['Shift', (receipt: VerifiedReceipt) => receipt.shift],
  ['Milk type', (receipt: VerifiedReceipt) => receipt.milkType],
  ['Quantity', (receipt: VerifiedReceipt) => `${receipt.quantityLitres} L`],
  ['FAT', (receipt: VerifiedReceipt) => receipt.fat],
  ['SNF', (receipt: VerifiedReceipt) => receipt.snf],
  ['CLR', (receipt: VerifiedReceipt) => receipt.clr],
  ['Rate per litre', (receipt: VerifiedReceipt) => `₹${receipt.ratePerLitre}`],
  ['Total amount', (receipt: VerifiedReceipt) => `₹${receipt.totalAmount}`],
  ['Member / supplier code', (receipt: VerifiedReceipt) => receipt.supplierCode],
  ['MCC code', (receipt: VerifiedReceipt) => receipt.mccCode],
  ['VLCC code', (receipt: VerifiedReceipt) => receipt.vlccCode],
] as const;

export default function ReceiptDetails() {
  const user = useAuthUser();
  const { receiptId } = useParams();
  const [state, setState] = useState<DetailsState>({ status: 'loading' });
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!receiptId) {
      setState({ status: 'missing' });
      return;
    }

    const subscription = liveQuery(async () => {
      const [receipt, image] = await Promise.all([
        getReceiptForUser(user.sub, receiptId),
        getReceiptImageForUser(user.sub, receiptId),
      ]);
      return receipt ? { receipt, image } : undefined;
    }).subscribe({
      next: (result) =>
        setState(
          result
            ? { status: 'ready', receipt: result.receipt, image: result.image }
            : { status: 'missing' },
        ),
      error: (error: unknown) =>
        setState({
          status: 'error',
          message:
            error instanceof Error
              ? `Could not read the saved receipt: ${error.message}`
              : 'Could not read the saved receipt from browser storage.',
        }),
    });

    return () => subscription.unsubscribe();
  }, [receiptId, user.sub]);

  useEffect(() => {
    if (state.status !== 'ready' || !state.image) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(state.image.blob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [state]);

  if (state.status === 'loading') {
    return (
      <div className="page-stack">
        <p>Loading saved receipt…</p>
      </div>
    );
  }

  if (state.status === 'missing') {
    return (
      <div className="page-stack">
        <Link className="text-link" to="/app/receipts">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to receipts
        </Link>
        <section className="panel gallery-empty">
          <h1>Receipt not found</h1>
          <p>This verified receipt is not available in this browser’s storage.</p>
        </section>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-stack">
        <Link className="text-link" to="/app/receipts">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to receipts
        </Link>
        <div className="intake-message is-rejected" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  const { receipt } = state;
  return (
    <div className="page-stack">
      <Link className="text-link" to="/app/receipts">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to receipts
      </Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">VERIFIED RECEIPT</p>
          <h1>{receipt.receiptDate}</h1>
          <p className="page-subtitle">
            {receipt.receiptTime} · {receipt.shift} · {receipt.quantityLitres} L
          </p>
        </div>
        <span className="count-pill">Verified</span>
      </div>

      <div className="receipt-detail-layout">
        <section className="panel receipt-original-panel">
          <h2>Original receipt photo</h2>
          {imageUrl ? (
            <img
              className="receipt-original-image"
              src={imageUrl}
              alt="Untouched original receipt photo"
            />
          ) : (
            <div className="receipt-image-unavailable" role="alert">
              <Image size={22} aria-hidden="true" />
              <span>Original photo could not be loaded from storage.</span>
            </div>
          )}
          <p className="storage-disclaimer">
            {receipt.originalFilename} · {receipt.originalMimeType}
          </p>
        </section>

        <section className="panel receipt-verified-panel">
          <p className="eyebrow">USER-APPROVED VALUES</p>
          <h2>Collection details</h2>
          <dl className="receipt-detail-list">
            {details.map(([label, getter]) => {
              const value = getter(receipt);
              return value ? (
                <div className="receipt-detail-row" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ) : null;
            })}
          </dl>
          <p className="storage-disclaimer">
            Verified {new Date(receipt.verificationTimestamp).toLocaleString()}
          </p>
          <p className="storage-disclaimer">
            {receipt.cloudSyncStatus === 'synced'
              ? 'Synced to your private account'
              : receipt.cloudSyncStatus === 'pending'
                ? 'Saved on this device · cloud sync pending'
                : 'Saved on this device only'}
          </p>
        </section>
      </div>
    </div>
  );
}
