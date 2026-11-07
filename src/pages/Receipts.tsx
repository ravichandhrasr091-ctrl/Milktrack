import { AlertCircle, CalendarDays, Image, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { useAuthUser } from '../components/useAuthUser';
import { getReceiptImageForUser, getReceiptsForUser } from '../services/database';
import type { VerifiedReceipt } from '../types/receipt';

type ReceiptsState =
  | { status: 'loading' }
  | { status: 'ready'; receipts: VerifiedReceipt[] }
  | { status: 'error'; message: string };

function ReceiptThumbnail({
  receiptId,
  userId,
}: {
  receiptId: string;
  userId: string;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let activeUrl: string | null = null;
    const subscription = liveQuery(() => getReceiptImageForUser(userId, receiptId))
      .subscribe({
        next: (image) => {
          if (!active) return;
          if (activeUrl) URL.revokeObjectURL(activeUrl);
          activeUrl = image ? URL.createObjectURL(image.blob) : null;
          setImageUrl(activeUrl);
        },
        error: () => {
          if (active) setImageUrl(null);
        },
      });

    return () => {
      active = false;
      subscription.unsubscribe();
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [receiptId, userId]);

  return imageUrl ? (
    <img className="receipt-thumbnail" src={imageUrl} alt="Original receipt" />
  ) : (
    <span className="receipt-thumbnail-placeholder">
      <Image size={20} aria-hidden="true" />
    </span>
  );
}

function monthLabel(date: string): string {
  const parsedDate = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsedDate.getTime())
    ? 'Unknown date'
    : new Intl.DateTimeFormat(undefined, {
        month: 'long',
        year: 'numeric',
      }).format(parsedDate);
}

function formatAmount(value: string): string {
  return `₹${value}`;
}

export default function Receipts() {
  const user = useAuthUser();
  const [state, setState] = useState<ReceiptsState>({ status: 'loading' });
  const [search, setSearch] = useState('');
  const [shiftFilter, setShiftFilter] = useState('all');

  useEffect(() => {
    const subscription = liveQuery(() => getReceiptsForUser(user.sub)).subscribe({
      next: (receipts) => setState({ status: 'ready', receipts }),
      error: (error: unknown) =>
        setState({
          status: 'error',
          message:
            error instanceof Error
              ? `Could not read saved receipts: ${error.message}`
              : 'Could not read saved receipts from browser storage.',
        }),
    });
    return () => subscription.unsubscribe();
  }, [user.sub]);

  const receipts = state.status === 'ready' ? state.receipts : [];
  const filtered = receipts.filter((receipt) => {
    const query = search.trim().toLowerCase();
    const matchesText =
      !query ||
      [
        receipt.receiptDate,
        receipt.receiptTime,
        receipt.mccCode,
        receipt.vlccCode,
        receipt.supplierCode,
        receipt.quantityLitres,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    const matchesShift = shiftFilter === 'all' || receipt.shift === shiftFilter;
    return matchesText && matchesShift;
  });

  const groupedReceipts = new Map<string, VerifiedReceipt[]>();
  for (const receipt of filtered) {
    const key = receipt.receiptDate.slice(0, 7);
    groupedReceipts.set(key, [...(groupedReceipts.get(key) ?? []), receipt]);
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR VERIFIED REGISTER</p>
          <h1>Receipts</h1>
          <p className="page-subtitle">
            Original receipt photos and the values you have approved.
          </p>
        </div>
        <span className="count-pill">
          {state.status === 'ready' ? receipts.length : '—'} approved
        </span>
      </div>

      <div className="filter-bar" aria-label="Receipt filters">
        <label className="search-control">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search receipts"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            aria-label="Search receipts"
          />
        </label>
        <span className="filter-button filter-date-caption">
          <CalendarDays size={16} aria-hidden="true" />
          Grouped by month
        </span>
        <label className="filter-button">
          <span className="visually-hidden">Filter by shift</span>
          <select
            value={shiftFilter}
            onChange={(event) => setShiftFilter(event.currentTarget.value)}
            aria-label="Filter by shift"
          >
            <option value="all">All shifts</option>
            <option value="Morning/Day">Morning / Day</option>
            <option value="Night">Night</option>
          </select>
        </label>
      </div>

      {state.status === 'error' && (
        <div className="intake-message is-rejected" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Storage could not be read</strong>
            <p>{state.message}</p>
          </div>
        </div>
      )}

      {state.status === 'loading' && (
        <section className="panel gallery-empty" role="status">
          <p>Loading saved receipts from this device…</p>
        </section>
      )}

      {state.status === 'ready' && receipts.length === 0 && (
        <section className="panel gallery-empty" aria-labelledby="receipts-empty-title">
          <span className="empty-icon">
            <Image size={24} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <h2 id="receipts-empty-title">Your receipt gallery is ready</h2>
          <p>
            Once you verify and save a receipt, its original photo and approved
            details will be organized here by month.
          </p>
          <span className="muted-status">No approved receipts to display</span>
        </section>
      )}

      {state.status === 'ready' &&
        receipts.length > 0 &&
        filtered.length === 0 && (
          <section className="panel gallery-empty">
            <h2>No receipts match these filters</h2>
            <p>Change the search or shift filter to see saved receipts.</p>
          </section>
        )}

      {state.status === 'ready' &&
        Array.from(groupedReceipts.entries()).map(([month, monthReceipts]) => (
          <section className="receipt-month" key={month}>
            <div className="receipt-month-heading">
              <CalendarDays size={16} aria-hidden="true" />
              <h2>{monthLabel(`${month}-01`)}</h2>
              <span>{monthReceipts.length}</span>
            </div>
            <div className="receipt-gallery-grid">
              {monthReceipts.map((receipt) => (
                <Link
                  className="receipt-gallery-card"
                  to={`/app/receipts/${receipt.id}`}
                  key={receipt.id}
                >
                  <ReceiptThumbnail receiptId={receipt.id} userId={user.sub} />
                  <div className="receipt-card-copy">
                    <span className="receipt-card-date">
                      {receipt.receiptDate} · {receipt.receiptTime}
                    </span>
                    <strong>{receipt.quantityLitres} litres</strong>
                    <span className="receipt-card-amount">
                      {formatAmount(receipt.totalAmount)}
                    </span>
                    <span className="receipt-card-shift">{receipt.shift}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
