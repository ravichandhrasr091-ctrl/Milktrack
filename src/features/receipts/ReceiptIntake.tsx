import {
  AlertCircle,
  Camera,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import ReceiptVerificationForm from './ReceiptVerificationForm';
import { verifyReceiptWithBedrock } from '../../services/bedrockVerification';
import type { BedrockVerification } from '../../services/bedrockVerification';
import { checkReceiptImage } from '../../services/imageQuality';
import { recognizeReceipt } from '../../services/ocrEngine';
import type { OCRProgress, OCRResult } from '../../services/ocrEngine';
import {
  getReceiptTypeRejectionReason,
  parseDodlaReceipt,
  type ParsedDodlaReceipt,
} from '../../services/receiptParser';
import type { EntryMethod, VerifiedReceipt } from '../../types/receipt';

type IntakeState =
  | { status: 'quality-checking' }
  | { status: 'recognizing'; progress: OCRProgress }
  | { status: 'quality-rejected'; reason: string }
  | { status: 'error'; message: string }
  | { status: 'unsupported'; reason: string; rawText: string }
  | {
      status: 'review';
      ocr: OCRResult;
      parsed: ParsedDodlaReceipt;
      aiCheck: AICheckState;
    };

type SaveNotice = {
  id: string;
  cloudSyncStatus: NonNullable<VerifiedReceipt['cloudSyncStatus']>;
  syncError?: string;
};

type AICheckState =
  | { status: 'checking' }
  | { status: 'unavailable'; message: string }
  | { status: 'completed'; result: BedrockVerification };

type CameraState =
  | { status: 'starting' }
  | { status: 'ready' }
  | { status: 'capturing' }
  | { status: 'error'; message: string };

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Camera permission was denied. Allow camera access in your browser settings, then try again.';
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return 'No usable camera was found on this device.';
    }
    if (error.name === 'NotReadableError' || error.name === 'AbortError') {
      return 'The camera could not start. It may be in use by another app.';
    }
  }

  return error instanceof Error
    ? `The live camera could not start: ${error.message}`
    : 'The live camera could not start. Try again or use Upload receipt instead.';
}

function stageDescription(progress: OCRProgress): string {
  if (progress.stage.includes('load language')) return 'Loading local English OCR data…';
  if (progress.stage.includes('load')) return 'Preparing the on-device OCR engine…';
  if (progress.stage.includes('recogniz')) return 'Reading receipt text on this device…';
  return 'Preparing a separate OCR copy of the photo…';
}

export default function ReceiptIntake({ userId }: { userId: string }) {
  const uploadInput = useRef<HTMLInputElement>(null);
  const videoElement = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);
  const processingRequest = useRef(0);
  const aiRequest = useRef<AbortController | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [entryMethod, setEntryMethod] = useState<EntryMethod>('upload');
  const [intakeState, setIntakeState] = useState<IntakeState | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<CameraState | null>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  useEffect(() => {
    if (!activeStream || !videoElement.current) return;

    const video = videoElement.current;
    video.srcObject = activeStream;
    void video.play().then(
      () => {
        if (cameraStream.current === activeStream) {
          setCameraState({ status: 'ready' });
        }
      },
      (error: unknown) => {
        if (cameraStream.current === activeStream) {
          stopActiveStream();
          setCameraState({ status: 'error', message: cameraErrorMessage(error) });
        }
      },
    );

    return () => {
      video.srcObject = null;
    };
  }, [activeStream]);

  function stopActiveStream() {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    setActiveStream(null);
  }

  function stopCamera() {
    cameraRequest.current += 1;
    stopActiveStream();
    setCameraState(null);
  }

  function clearTemporaryAttempt() {
    processingRequest.current += 1;
    aiRequest.current?.abort();
    aiRequest.current = null;
    setSelectedFile(null);
    setIntakeState(null);
    if (uploadInput.current) uploadInput.current.value = '';
  }

  function closeDialogs() {
    stopCamera();
    clearTemporaryAttempt();
  }

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDialogs();
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  });

  useEffect(
    () => () => {
      cameraRequest.current += 1;
      processingRequest.current += 1;
      cameraStream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function processSelectedFile(file: File, method: EntryMethod) {
    const requestId = ++processingRequest.current;
    setEntryMethod(method);
    setSelectedFile(file);
    setIntakeState({ status: 'quality-checking' });
    try {
      const quality = await checkReceiptImage(file);
      if (requestId !== processingRequest.current) return;

      if (quality.status === 'rejected') {
        setIntakeState({ status: 'quality-rejected', reason: quality.reason });
        return;
      }

      setIntakeState({
        status: 'recognizing',
        progress: { stage: 'Preparing local OCR', progress: 0 },
      });
      const ocr = await recognizeReceipt(file, (progress) => {
        if (requestId === processingRequest.current) {
          setIntakeState({ status: 'recognizing', progress });
        }
      });
      if (requestId !== processingRequest.current) return;

      const parsed = parseDodlaReceipt(ocr.rawText, ocr.words);
      const rejectionReason = getReceiptTypeRejectionReason(parsed);
      if (rejectionReason) {
        setIntakeState({
          status: 'unsupported',
          reason: rejectionReason,
          rawText: ocr.rawText,
        });
        return;
      }

      const controller = new AbortController();
      aiRequest.current = controller;
      setIntakeState({
        status: 'review',
        ocr,
        parsed,
        aiCheck: { status: 'checking' },
      });

      try {
        const result = await verifyReceiptWithBedrock(file, parsed, controller.signal);
        if (requestId !== processingRequest.current) return;
        setIntakeState({
          status: 'review',
          ocr,
          parsed,
          aiCheck: { status: 'completed', result },
        });
      } catch (error) {
        if (requestId !== processingRequest.current) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setIntakeState({
          status: 'review',
          ocr,
          parsed,
          aiCheck: {
            status: 'unavailable',
            message:
              error instanceof Error
                ? error.message
                : 'AWS verification failed. You can continue checking the receipt manually.',
          },
        });
      } finally {
        if (aiRequest.current === controller) aiRequest.current = null;
      }
    } catch (error) {
      if (requestId !== processingRequest.current) return;
      setIntakeState({
        status: 'error',
        message:
          error instanceof Error
            ? `Receipt processing failed: ${error.message}`
            : 'Receipt processing failed. Try another photo or upload.',
      });
    }
  }

  async function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) await processSelectedFile(file, 'upload');
  }

  async function openLiveCamera() {
    stopCamera();
    clearTemporaryAttempt();
    setEntryMethod('camera');
    setCameraState({ status: 'starting' });
    const requestId = cameraRequest.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState({
        status: 'error',
        message:
          'Live camera access is unavailable here. Open MilkTrack over HTTPS on your phone, or use Upload receipt instead.',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          height: { ideal: 1920 },
          width: { ideal: 1920 },
        },
      });

      if (requestId !== cameraRequest.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      cameraStream.current = stream;
      setActiveStream(stream);
    } catch (error) {
      if (requestId === cameraRequest.current) {
        setCameraState({ status: 'error', message: cameraErrorMessage(error) });
      }
    }
  }

  function openUploadPicker() {
    stopCamera();
    clearTemporaryAttempt();
    uploadInput.current?.click();
  }

  async function captureLivePhoto() {
    const video = videoElement.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraState({
        status: 'error',
        message: 'The live preview is not ready yet. Wait a moment and try again.',
      });
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser could not capture the camera frame.');

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      setCameraState({ status: 'capturing' });
      const imageBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.95),
      );
      if (!imageBlob) throw new Error('The photo could not be captured.');

      const timestamp = new Date().toISOString().replaceAll(':', '-');
      const photo = new File([imageBlob], `milktrack-capture-${timestamp}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      stopCamera();
      await processSelectedFile(photo, 'camera');
    } catch (error) {
      setCameraState({ status: 'error', message: cameraErrorMessage(error) });
    }
  }

  const activeReview =
    intakeState?.status === 'review' && selectedFile && previewUrl
      ? {
          ...intakeState,
          file: selectedFile,
          imageUrl: previewUrl,
        }
      : null;

  return (
    <>
      <div className="welcome-actions">
        <button
          className="button button-light"
          type="button"
          onClick={() => void openLiveCamera()}
        >
          <Camera size={17} aria-hidden="true" />
          Capture receipt
        </button>
        <button
          className="button button-outline-light"
          type="button"
          onClick={openUploadPicker}
        >
          <ImagePlus size={17} aria-hidden="true" />
          Upload receipt
        </button>
      </div>

      {saveNotice && (
        <div className="saved-toast" role="status">
          {saveNotice.cloudSyncStatus === 'synced'
            ? 'Receipt and original photo synced securely to your account.'
            : saveNotice.cloudSyncStatus === 'pending'
              ? `Receipt saved on this device. Cloud sync is pending.${saveNotice.syncError ? ` ${saveNotice.syncError}` : ''}`
              : 'Receipt and original photo saved on this device only.'}
          <Link to={`/app/receipts/${saveNotice.id}`}>View saved receipt</Link>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss saved message"
            onClick={() => setSaveNotice(null)}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      <input
        ref={uploadInput}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload a receipt photo"
        onChange={handleUploadChange}
      />

      {cameraState && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialogs();
          }}
        >
          <section
            className="intake-dialog camera-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="camera-title"
          >
            <header className="intake-header">
              <div>
                <p className="eyebrow">LIVE CAMERA</p>
                <h2 id="camera-title">Capture your receipt</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close camera"
                onClick={closeDialogs}
              >
                <X size={19} aria-hidden="true" />
              </button>
            </header>

            {cameraState.status !== 'error' && (
              <div className="live-camera-preview">
                <video
                  ref={videoElement}
                  autoPlay
                  muted
                  playsInline
                  aria-label="Live phone camera preview"
                />
                {(cameraState.status === 'starting' ||
                  cameraState.status === 'capturing') && (
                  <div className="camera-loading" role="status">
                    <LoaderCircle className="spin" size={23} aria-hidden="true" />
                    <span>
                      {cameraState.status === 'starting'
                        ? 'Starting live camera…'
                        : 'Capturing photo…'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {cameraState.status === 'error' ? (
              <div className="intake-message is-rejected" role="alert">
                <AlertCircle size={19} aria-hidden="true" />
                <div>
                  <strong>Could not open live camera</strong>
                  <p>{cameraState.message}</p>
                </div>
              </div>
            ) : (
              <p className="intake-caveat">
                Point the rear camera at the full receipt. Capture opens the
                camera preview; it does not select an existing photo.
              </p>
            )}

            <footer className="intake-actions">
              {cameraState.status === 'error' ? (
                <>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void openLiveCamera()}
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    Try camera again
                  </button>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={openUploadPicker}
                  >
                    <ImagePlus size={15} aria-hidden="true" />
                    Use upload instead
                  </button>
                </>
              ) : (
                <button
                  className="button button-primary shutter-button"
                  type="button"
                  disabled={cameraState.status !== 'ready'}
                  onClick={() => void captureLivePhoto()}
                >
                  <Camera size={17} aria-hidden="true" />
                  Take photo
                </button>
              )}
            </footer>
          </section>
        </div>
      )}

      {selectedFile && intakeState && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialogs();
          }}
        >
          <section
            className={`intake-dialog ${
              intakeState.status === 'review' ? 'review-dialog' : ''
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="intake-title"
          >
            {intakeState.status === 'review' && activeReview ? (
              <>
                <header className="intake-header">
                  <div>
                    <p className="eyebrow">
                      {entryMethod === 'camera' ? 'CAMERA CAPTURE' : 'PHOTO UPLOAD'}
                    </p>
                    <h2 id="intake-title">Review and verify receipt</h2>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Discard receipt review"
                    onClick={closeDialogs}
                  >
                    <X size={19} aria-hidden="true" />
                  </button>
                </header>
                <ReceiptVerificationForm
                  key={`${activeReview.file.name}-${activeReview.file.lastModified}`}
                  file={activeReview.file}
                  userId={userId}
                  entryMethod={entryMethod}
                  imageUrl={activeReview.imageUrl}
                  rawText={activeReview.ocr.rawText}
                  parsed={activeReview.parsed}
                  aiCheck={activeReview.aiCheck}
                  onSaved={(id, cloudSyncStatus, syncError) => {
                    closeDialogs();
                    setSaveNotice({ id, cloudSyncStatus, syncError });
                  }}
                />
              </>
            ) : (
              <>
                <header className="intake-header">
                  <div>
                    <p className="eyebrow">
                      {entryMethod === 'camera' ? 'CAMERA CAPTURE' : 'PHOTO UPLOAD'}
                    </p>
                    <h2 id="intake-title">
                      {intakeState.status === 'unsupported'
                        ? 'Receipt format not recognized'
                        : 'Checking receipt photo'}
                    </h2>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Close receipt processing"
                    onClick={closeDialogs}
                  >
                    <X size={19} aria-hidden="true" />
                  </button>
                </header>

                {previewUrl && (
                  <div className="intake-preview">
                    <img
                      src={previewUrl}
                      alt="Temporary preview of original receipt photo"
                    />
                  </div>
                )}

                <div className="intake-file-name" title={selectedFile.name}>
                  {selectedFile.name || 'Captured receipt photo'}
                </div>

                {(intakeState.status === 'quality-checking' ||
                  intakeState.status === 'recognizing') && (
                  <div className="intake-message" role="status">
                    <LoaderCircle className="spin" size={19} aria-hidden="true" />
                    <div className="progress-copy">
                      <strong>
                        {intakeState.status === 'quality-checking'
                          ? 'Checking photo quality'
                          : 'Reading receipt text'}
                      </strong>
                      <p>
                        {intakeState.status === 'quality-checking'
                          ? 'Checking light, focus, contrast and resolution.'
                          : `${stageDescription(intakeState.progress)} ${
                              intakeState.progress.progress > 0
                                ? `${Math.round(intakeState.progress.progress * 100)}%`
                                : ''
                            }`}
                      </p>
                      {intakeState.status === 'recognizing' &&
                        intakeState.progress.progress > 0 && (
                          <progress
                            max="1"
                            value={intakeState.progress.progress}
                            aria-label="OCR progress"
                          />
                        )}
                    </div>
                  </div>
                )}

                {(intakeState.status === 'quality-rejected' ||
                  intakeState.status === 'error' ||
                  intakeState.status === 'unsupported') && (
                  <div className="intake-message is-rejected" role="alert">
                    <AlertCircle size={19} aria-hidden="true" />
                    <div>
                      <strong>
                        {intakeState.status === 'quality-rejected'
                          ? 'Photo needs another try'
                          : intakeState.status === 'unsupported'
                            ? 'This photo cannot be saved as a supported receipt'
                            : 'Receipt processing could not finish'}
                      </strong>
                      <p>
                        {intakeState.status === 'quality-rejected'
                          ? intakeState.reason
                          : intakeState.status === 'unsupported'
                            ? intakeState.reason
                            : intakeState.message}
                      </p>
                    </div>
                  </div>
                )}

                {intakeState.status === 'unsupported' && (
                  <details className="ocr-diagnostics">
                    <summary>Show raw OCR text</summary>
                    <pre>{intakeState.rawText}</pre>
                  </details>
                )}

                {intakeState.status === 'error' && (
                  <p className="intake-caveat">
                    OCR assets and language data are loaded from this app; the
                    photo is not sent to an OCR service.
                  </p>
                )}

                {[
                  'quality-rejected',
                  'error',
                  'unsupported',
                ].includes(intakeState.status) && (
                  <footer className="intake-actions">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() =>
                        entryMethod === 'camera'
                          ? void openLiveCamera()
                          : openUploadPicker()
                      }
                    >
                      {entryMethod === 'camera' ? (
                        <>
                          <Camera size={15} aria-hidden="true" />
                          Retake photo
                        </>
                      ) : (
                        <>
                          <ImagePlus size={15} aria-hidden="true" />
                          Choose another photo
                        </>
                      )}
                    </button>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={openUploadPicker}
                    >
                      <ImagePlus size={15} aria-hidden="true" />
                      Reupload photo
                    </button>
                  </footer>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
