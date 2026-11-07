# MilkTrack --- VS Code Project Guide

**Product:** MilkTrack --- Dodla Dairy Cow Milk Collection Manager\
**Purpose:** Capture or upload milk collection receipts, extract and
verify exact printed values, preserve approved original photos, maintain
a digital register, generate an integrated Excel workbook, and display
period-based analytics.

> **Critical data rule:** Never invent, guess, silently normalize, or
> silently correct a receipt value. If a value is unclear, mark it for
> review. Do not permanently save a receipt or include it in financial
> totals until the user verifies and approves it.

------------------------------------------------------------------------

## 1. Product requirements

Build a mobile-first, installable Progressive Web App (PWA) that also
works in desktop browsers.

The repository also packages the web app as an Android application
(`com.milktrack.app`) and a Windows installer. Android APKs and Windows
installers are published as GitHub Release assets and listed on the `/releases`
page; never distribute an unsigned or debug Android build as a production
release.

### Main navigation

Use four primary sections:

1.  **Home**
    -   Premium dashboard.
    -   Main actions: **Capture Receipt** and **Upload Receipt**.
    -   Today's verified milk quantity and earnings.
    -   Morning/day and night shift summaries.
    -   Recent approved receipt activity.
2.  **Receipts**
    -   Gallery of approved original receipt photographs.
    -   Group by year and month.
    -   Search and filter by date and shift.
    -   Open original full-resolution image and its verified data.
3.  **Reports**
    -   Period tabs: **7 Days**, **15 Days**, **1 Month**, **1 Year**.
    -   Each tab opens a detailed report with graphs and receipt-level
        records.
    -   Each report is a live rolling window ending today; no manual
        start-date entry is required.
4.  **Excel**
    -   View workbook information and records inside the app.
    -   Generate/download the master `.xlsx` workbook.
    -   Export a selected report period.
    -   Provide backup and restore options.

### Design direction

Create a premium, modern, clean dairy-management experience. Avoid a
generic admin template.

-   Primary forest green: `#153D2E`
-   Mint: `#D9F0E2`
-   Soft background: `#F5F8F5`
-   White cards, subtle borders and restrained shadows.
-   Inter typography.
-   Rounded cards (approximately 16--22px).
-   Lucide outline icons.
-   Desktop: left sidebar.
-   Mobile: fixed bottom navigation with safe-area padding.
-   Responsive layouts for narrow phones, tablets and desktop.
-   Accessible contrast, clear labels, keyboard focus states and touch
    targets.
-   Do not use fabricated earnings or milk figures in production UI. Use
    empty states such as `—` until real verified records exist. Clearly
    label any development fixture as sample data and keep it out of the
    real database.

------------------------------------------------------------------------

## 2. Receipt capture and upload workflow

Both entry methods must use the same validation and approval rules.

### Home actions

Provide two separate buttons:

-   **Capture Receipt** --- open the phone's rear camera where
    supported.
-   **Upload Receipt** --- open the device's image picker/gallery.

Use mobile-friendly file inputs and support common image formats.
Preserve the original image bytes; do not overwrite the original with an
enhanced copy.

### Processing sequence

1.  Select or capture an image.
2.  Perform an image-quality gate before OCR.
3.  If the image is blurred, cut off, too dark, blank, or otherwise
    unreadable:
    -   Reject the attempt immediately.
    -   Explain the specific reason in plain language.
    -   Offer **Retake Photo** and **Reupload Photo**.
    -   Do not add it to the permanent Receipts Gallery.
    -   Do not create a database receipt record or Excel row.
    -   Temporary preview data must be discarded when the user retries
        or exits.
4.  If image quality passes, enhance a working copy for OCR (deskew,
    crop, contrast, resize as appropriate).
5.  Run receipt-specific OCR and parse fields using the known Dodla
    receipt layout.
6.  Show the original photo beside/above the extracted values.
7.  Show all extracted fields in a review form.
8.  Flag uncertain, missing, or conflicting values. Never guess.
9.  User checks/corrects values and explicitly presses **Verify &
    Save**.
10. Only after approval:
    -   Save the untouched original image permanently.
    -   Save the verified structured record.
    -   Update reports.
    -   Update/regenerate the master Excel workbook.

**Capture vs upload experience:** Capture should automatically start
quality checking and OCR after the photo is taken. Upload should also
automatically start quality checking and OCR, then present the extracted
fields for correction. Manual correction is available for both methods.
Neither method bypasses verification.

### OCR quality and honesty

Do not promise 100% OCR accuracy. Build a cautious pipeline:

-   Receipt layout/template detection.
-   Image quality checks.
-   OCR engine abstraction so the implementation can use a
    browser-compatible engine or a local/server OCR service.
-   Field-specific parsing based on labels and layout.
-   Preserve raw OCR text for diagnostics during the pending review
    session.
-   Field-level confidence/uncertainty status where supported by the OCR
    engine.
-   Cross-check independent OCR readings only if a second engine is
    actually configured.
-   Never display invented confidence percentages.
-   If OCR cannot confidently read a field, show **Needs review**.
-   If the receipt is not a recognized Dodla cow-milk receipt, reject it
    with a clear reason.
-   The initial target is the exact supplied Dodla receipt format. Do
    not pretend to support other receipt formats until tested.

### Important decimal and number rules

-   Preserve decimal points exactly as printed.
-   `1.2` litres must remain `1.2`, never `120`.
-   Never infer a missing decimal point or digit.
-   Do not round source values during extraction.
-   Store numeric values in a safe decimal representation (for example,
    decimal strings in the record, with explicit parsing for
    calculations) to avoid floating-point display errors.
-   Format values for display without changing the underlying verified
    value.
-   Never silently replace a value because a mathematical check
    disagrees. Flag the discrepancy for review.

------------------------------------------------------------------------

## 3. Receipt data model

Create a strongly typed receipt model. Include at least:

-   Unique internal record ID.
-   Dairy/receipt format identifier.
-   Milk type (only accept `Cow` for this app's current scope).
-   Receipt date.
-   Receipt time.
-   Shift (`Morning/Day` or `Night`, based on the receipt's printed
    information or an explicitly configured rule; do not guess if
    ambiguous).
-   Quantity in litres.
-   FAT.
-   SNF.
-   CLR.
-   Rate per litre.
-   Total amount.
-   Supplier/member code if present.
-   MCC code if present.
-   VLCC/collection-centre code if present.
-   Original image blob reference.
-   Original image filename and MIME type.
-   OCR raw text/reference for audit if appropriate.
-   Verification status and verification timestamp.
-   Created/updated timestamps.
-   Entry method (`camera` or `upload`).

Keep optional fields optional. Never invent absent receipt fields.

### Receipt states

Use explicit states such as:

-   `pending_quality_check`
-   `rejected_quality`
-   `pending_review`
-   `rejected_receipt_type`
-   `verified`

Only `verified` records are permanent approved records and eligible for
reports/Excel. Rejected and pending attempts must not appear in the
permanent gallery or financial totals.

### Original photo handling

-   Preserve the original photo unchanged.
-   OCR enhancement must operate on a separate temporary copy.
-   Store approved images in app-managed persistent storage (IndexedDB
    initially).
-   Organize the gallery by date/year/month using metadata; do not rely
    on fragile filesystem paths in a browser PWA.
-   A verified receipt detail screen must show the original photo and
    linked verified values.
-   If the user deletes a verified receipt, require confirmation and
    explain how totals and workbook exports will change.

------------------------------------------------------------------------

## 4. Database and storage

Use IndexedDB through Dexie as the on-device cache and offline store. When
production sync is configured, new verified receipts sync to the authenticated
account through the user-scoped AWS API; legacy local receipts are not
automatically imported.

Suggested tables:

-   `receipts` --- verified structured records.
-   `receiptImages` --- original image blobs linked by receipt ID.
-   `settings` --- app preferences and configured shift rule.
-   `reportCache` --- optional derived cache only; never the source of
    truth.

Use schema versioning and migrations. Add robust error handling for
storage quota and failed writes.

**Source of truth:** The local database is authoritative. Excel is a
generated/exportable workbook derived from verified records. Do not use
an Excel file as the primary database.

Use a transaction when saving a verified receipt and its original image
so a partial save cannot leave an orphan record. Update or regenerate
the workbook only after the database transaction succeeds.

Add a clear backup/export and restore process. Explain that browser
storage can be cleared by the user/device, so regular backups are
important. Cloud sync does not replace independent exports/backups.

------------------------------------------------------------------------

## 5. Excel integration

Generate a valid OOXML `.xlsx` workbook named:

`Dodla_Milk_Collection_Master.xlsx`

Create these worksheets:

1.  **All Records** --- one row per verified receipt.
2.  **Daily Summary** --- totals grouped by receipt date.
3.  **Morning Shift** --- verified day/morning records.
4.  **Night Shift** --- verified night records.
5.  **Period Reports** --- selected rolling-period daily summaries.
6.  **Yearly Summary** --- monthly totals grouped by receipt month.

Include all available receipt fields, unique receipt ID, verification
timestamp, entry method, and a reference to the original image/receipt
ID. Do not embed huge photos in the workbook by default; the app gallery
is the photo archive. The receipt ID links the workbook row to the
original photo in the app.

Requirements:

-   Generate the workbook from the verified database records.
-   Provide an in-app workbook preview/table.
-   Provide **Download Master Excel** and **Export Selected Report**.
-   Use INR currency formatting (`₹`) and appropriate date/time formats.
-   Keep quantity and decimal values faithful to verified receipt data.
-   Use formulas or recomputed summaries consistently; avoid
    double-counting.
-   Make export repeatable and deterministic.
-   Never include pending or rejected receipts.
-   Handle empty data gracefully with headers and a clear no-records
    message.

------------------------------------------------------------------------

## 6. Shift and reporting rules

### Shift handling

-   Keep receipt date and receipt time as separate fields.
-   Preserve the receipt's printed time.
-   Store the shift classification separately.
-   For the current Dodla format, derive Morning/Day from receipt times
    06:00 through 17:59; derive Night for all other valid times.
-   Derive the shift from the printed receipt time rather than OCR's
    potentially misread shift character. Keep the printed character for
    reference only (the receipt uses `N` for morning and `E` for night).
-   If the time is missing or invalid, leave shift unresolved and require
    review. If the time is corrected during review, recalculate the shift.

Parse the Dodla printed date as day/month/year and prefill the date
control. Preserve the printed date text for review; do not substitute the
device's current date.

### Report periods

Provide exactly four period tabs:

-   **7 Days**
-   **15 Days**
-   **1 Month**
-   **1 Year**

No 30 Days tab.

Use rolling date intervals ending today. The start date is calculated
automatically from the selected period and updates as the date changes:

-   7 Days: today and the previous 6 days.
-   15 Days: today and the previous 14 days.
-   1 Month: today and the previous 29 days.
-   1 Year: today and the previous 364 days.

Reports and charts update from verified receipts as they are saved.

### Report details

Each selected period opens a detailed report screen with:

-   Total verified earnings.
-   Total milk quantity (litres).
-   Morning/day shift quantity and earnings.
-   Night shift quantity and earnings.
-   Daily earnings graph.
-   Daily quantity graph.
-   Morning vs night comparison graph.
-   FAT trend.
-   SNF trend.
-   CLR trend.
-   Quantity-weighted average FAT and SNF, when the source data supports
    it.
-   Average rate per litre calculated as total amount / total quantity.
-   Receipt count.
-   Daily receipt table.
-   Highest and lowest collection days, only when records exist.
-   Export selected period to Excel.

All graphs and reports must be derived from the same verified database
records as the master workbook. No hardcoded sample chart values in
production.

------------------------------------------------------------------------

## 7. Suggested application structure

Use a modular folder structure:

``` text
milktrack/
├── public/
│   ├── icons/
│   └── manifest.webmanifest
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   └── routes.tsx
│   ├── components/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   ├── BottomNavigation.tsx
│   │   ├── StatCard.tsx
│   │   ├── EmptyState.tsx
│   │   └── ConfirmDialog.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Receipts.tsx
│   │   ├── ReceiptDetails.tsx
│   │   ├── ReceiptCapture.tsx
│   │   ├── OCRVerification.tsx
│   │   ├── Reports.tsx
│   │   ├── ReportDetails.tsx
│   │   └── Excel.tsx
│   ├── features/
│   │   └── receipts/
│   │       ├── components/
│   │       ├── hooks/
│   │       └── receiptWorkflow.ts
│   ├── services/
│   │   ├── database.ts
│   │   ├── imageQuality.ts
│   │   ├── imageProcessing.ts
│   │   ├── ocrEngine.ts
│   │   ├── receiptParser.ts
│   │   ├── validation.ts
│   │   ├── excelService.ts
│   │   └── reportService.ts
│   ├── types/
│   │   └── receipt.ts
│   ├── styles/
│   │   └── tokens.css
│   ├── main.tsx
│   └── index.css
├── README.md
├── package.json
└── vite.config.ts
```

Adapt the structure as needed, but keep OCR, validation, database, Excel
and reporting logic separate from UI components.

------------------------------------------------------------------------

## 8. Recommended implementation packages

Start with:

``` bash
npm create vite@latest milktrack -- --template react-ts
cd milktrack
npm install
npm install react-router-dom lucide-react framer-motion
npm install dexie exceljs recharts
npm install vite-plugin-pwa
npm install @fontsource/inter
```

OCR and image-processing dependencies must be selected after confirming
browser support and the chosen runtime. Tesseract.js can be used as an
initial browser OCR engine; do not claim PaddleOCR runs in-browser
unless a compatible deployment has actually been implemented. Keep OCR
behind an adapter interface so the engine can be replaced later.

Useful scripts:

``` bash
npm run dev
npm run build
npm run preview
```

------------------------------------------------------------------------

## 9. Required screens and UX states

Build and test all of these:

-   Home dashboard with Capture and Upload actions.
-   Camera permission denied state.
-   Camera unavailable state.
-   Image picker cancellation state.
-   Image quality checking/loading state.
-   Blurred image rejection with Retake and Reupload.
-   Clear image OCR processing state.
-   Unsupported/non-Cow receipt rejection state.
-   OCR field review with uncertain fields highlighted.
-   Editable verification form.
-   Validation mismatch warning.
-   Verify & Save confirmation.
-   Save failure/retry state.
-   Receipts Gallery empty and populated states.
-   Receipt details with original photo.
-   Reports empty and populated states.
-   Live rolling report graphs and populated records.
-   Excel preview, export success and export failure states.
-   Offline indicator and backup/restore controls.

Use accessible labels and clear error messages. Never rely on color
alone to communicate a status.

------------------------------------------------------------------------

## 10. Testing and acceptance criteria

Do not declare the app complete until these are tested:

1.  A clear supported Cow receipt can be captured and parsed.
2.  The same workflow works for an uploaded image.
3.  A blurred/cut-off image is rejected before permanent storage.
4.  Retake and reupload actions work.
5.  No rejected/pending image appears in the permanent gallery.
6.  No pending/rejected record appears in Excel or reports.
7.  A printed quantity of `1.2` remains `1.2`, never `120`.
8.  Decimal values are not silently rounded or altered.
9.  Unreadable fields require user correction.
10. User edits are stored as verified values, with appropriate audit
    metadata.
11. Original approved photo remains unchanged and viewable.
12. Morning and night totals are correctly separated.
13. Reports update from verified receipts over the selected rolling
    interval ending today.
14. Master Excel and in-app reports reconcile to the same verified
    records.
15. Refreshing or reopening the app does not lose saved records.
16. Export and restore work on the target browsers/devices.
17. Mobile camera and gallery flows are tested on an actual Android
    device.

Create unit tests for decimal parsing, receipt validation, shift
classification, date-range boundaries, weighted averages, and Excel
summary calculations.

------------------------------------------------------------------------

## 11. Development instructions for the VS Code AI assistant

Paste the following as the project-level instruction to your coding
assistant:

> You are the senior full-stack engineer responsible for building
> MilkTrack. Read this entire README before changing code. First inspect
> the existing project and report its current structure. Do not
> overwrite working files blindly.
>
> Build the application in small, testable milestones. Start with the
> responsive premium UI and navigation, then database/types, then
> receipt capture/upload and image-quality gate, then
> OCR/parser/verification, then permanent storage, then Excel, then
> reports, then PWA/backup and tests.
>
> Before each milestone, list the files you will create or modify.
> Implement complete working code, not pseudocode or placeholder
> buttons. After each milestone, run the available
> type-check/build/tests and fix errors before continuing. If a command
> fails, report the actual error and fix it rather than pretending it
> succeeded.
>
> Never fabricate receipt values, sample financial totals, OCR
> confidence, or successful test results. Use empty states until real
> verified data exists. Keep any sample fixtures isolated from
> production data and clearly label them.
>
> Do not permanently store an image or receipt record until the image
> passes quality checks, the receipt is recognized as an in-scope Cow
> receipt, all required fields are verified by the user, and the user
> presses Verify & Save. Rejected and pending items must not enter the
> permanent gallery, database financial records, Excel, or reports.
>
> Preserve original image bytes. Use enhanced copies only for OCR.
> Preserve decimal values and never silently correct them. If uncertain,
> ask for user review.
>
> Keep the local database as the source of truth. Generate Excel and
> graphs from verified database records. Use transactions for saving a
> verified receipt and its original image. Add error handling, tests,
> and backup/restore.
>
> Do not add unrequested features, cloud accounts, paid APIs, or
> external services without explaining the need and asking before
> introducing costs or credentials.
>
> At the end of each milestone, provide: what was built, files changed,
> commands run, test/build result, known limitations, and the exact next
> step. Never claim a feature is implemented unless it works.

------------------------------------------------------------------------

## 12. Build milestones

  Milestone   Deliverable
  ----------- ---------------------------------------------
  1           Premium UI and navigation
  2           Camera, upload and image-quality rejection
  3           Dodla receipt OCR and field parser
  4           Verification and approved receipt storage
  5           Receipts Gallery
  6           Master Excel integration
  7           7-day, 15-day, 1-month and 1-year analytics
  8           PWA, offline behavior, backup and restore
  9           Device testing and accuracy validation

### First milestone completion checklist

-   [ ] Project installs and runs.
-   [ ] Home dashboard is responsive.
-   [ ] Desktop sidebar works.
-   [ ] Mobile bottom navigation works.
-   [ ] Four main routes work.
-   [ ] Empty states use no fabricated financial data.
-   [ ] TypeScript build succeeds.

**Start with Milestone 1 only. Do not attempt to implement the entire
application in one response.**
