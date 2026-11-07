import {
  Bot,
  LoaderCircle,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import {
  buildFinanceContext,
  questionNeedsFinancialData,
} from '../services/financeContext';
import { askFinanceAssistant } from '../services/financeAssistant';
import type { FinanceAssistantMessage } from '../services/financeAssistant';
import { database } from '../services/database';

const welcomeMessage: FinanceAssistantMessage = {
  role: 'assistant',
  content:
    'Hi! I can help you use MilkTrack, explain what’s available, or answer questions about your verified collection totals. What would you like to know?',
};

const suggestions = [
  'What can I do in MilkTrack?',
  'How do I add a receipt?',
  'How much did I earn this month?',
];

export default function FinanceAssistant({ userId }: { userId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<FinanceAssistantMessage[]>([
    welcomeMessage,
  ]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [isAtBottom, setIsAtBottom] = useState(true);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    if (isAtBottom && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [isOpen, isAtBottom, messages, isSending]);

  useEffect(() => {
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) setIsOpen(false);
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  useEffect(
    () => () => requestRef.current?.abort(),
    [],
  );

  async function sendMessage(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isSending) return;

    setDraft('');
    setError('');
    setIsSending(true);
    const history = getUsableHistory(messages);
    setMessages((current) => [...current, { role: 'user', content: trimmed }]);
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      let context = null;
      if (questionNeedsFinancialData(trimmed)) {
        const receipts = await database.receipts
          .where('[ownerId+verificationStatus]')
          .equals([userId, 'verified'])
          .toArray();
        context = buildFinanceContext(trimmed, receipts);
      }

      const answer = await askFinanceAssistant(
        trimmed,
        history,
        context,
        controller.signal,
      );
      setMessages((current) => [...current, { role: 'assistant', content: answer }]);
    } catch (sendError) {
      if (sendError instanceof DOMException && sendError.name === 'AbortError') {
        return;
      }
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'Could not get an answer. Please try again.',
      );
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  function clearConversation() {
    requestRef.current?.abort();
    requestRef.current = null;
    setMessages([welcomeMessage]);
    setDraft('');
    setError('');
    setIsSending(false);
  }

  return (
    <div className="finance-assistant">
      {isOpen && (
        <section
          ref={panelRef}
          className="finance-assistant-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="finance-assistant-title"
        >
          <header className="finance-assistant-header">
            <span className="finance-assistant-avatar">
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <div className="finance-assistant-title">
              <strong id="finance-assistant-title">MilkTrack assistant</strong>
              <span>App help &amp; collection insights</span>
            </div>
            <button
              className="finance-assistant-icon-button"
              type="button"
              onClick={clearConversation}
              aria-label="Clear assistant conversation"
              title="Clear conversation"
            >
              <span aria-hidden="true">↻</span>
            </button>
            <button
              className="finance-assistant-icon-button"
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close assistant"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </header>

          <div
            ref={messagesRef}
            className="finance-assistant-messages"
            aria-live="polite"
            onScroll={(event) => {
              const { scrollTop, scrollHeight, clientHeight } =
                event.currentTarget;
              setIsAtBottom(scrollHeight - scrollTop - clientHeight < 48);
            }}
          >
            <div className="finance-assistant-privacy">
              <Bot size={14} aria-hidden="true" />
              <span>
                Read-only help powered by Nova Lite. Finance questions send
                relevant totals only—never receipt photos or member codes.
                AWS usage may incur charges.
              </span>
            </div>
            {messages.map((message, index) => (
              <div
                className={`finance-assistant-message is-${message.role}`}
                key={`${index}-${message.role}`}
              >
                {message.content}
              </div>
            ))}
            {isSending && (
              <div className="finance-assistant-message is-assistant is-loading" role="status">
                <LoaderCircle className="spin" size={15} aria-hidden="true" />
                <span>Thinking…</span>
              </div>
            )}
            {error && (
              <div className="finance-assistant-error" role="alert">
                {error}
                <button
                  type="button"
                  onClick={() =>
                    void sendMessage(
                      [...messages].reverse().find((item) => item.role === 'user')
                        ?.content ?? '',
                    )
                  }
                  disabled={isSending}
                >
                  Try again
                </button>
              </div>
            )}
            {messages.length === 1 && (
              <div className="finance-assistant-suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void sendMessage(suggestion)}
                    disabled={isSending}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="finance-assistant-composer" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask about MilkTrack or your collections…"
              aria-label="Message the MilkTrack assistant"
              maxLength={1000}
              rows={2}
              disabled={isSending}
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!draft.trim() || isSending}
            >
              {isSending ? (
                <LoaderCircle className="spin" size={17} aria-hidden="true" />
              ) : (
                <Send size={17} aria-hidden="true" />
              )}
            </button>
            <span>Enter to send · Shift+Enter for a new line</span>
          </form>
        </section>
      )}

      <button
        className={`finance-assistant-trigger${isOpen ? ' is-open' : ''}`}
        type="button"
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close MilkTrack assistant' : 'Ask MilkTrack assistant'}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? <X size={21} aria-hidden="true" /> : <MessageCircle size={21} aria-hidden="true" />}
        <span>{isOpen ? 'Close' : 'Ask me'}</span>
      </button>
    </div>
  );
}

function getUsableHistory(
  messages: FinanceAssistantMessage[],
): FinanceAssistantMessage[] {
  const normalized: FinanceAssistantMessage[] = [];
  for (const message of messages) {
    if (message === welcomeMessage) continue;

    const last = normalized.at(-1);
    if (message.role === 'user') {
      if (last?.role === 'user') normalized.pop();
      normalized.push(message);
    } else if (last?.role === 'user') {
      normalized.push(message);
    }
  }

  if (normalized.at(-1)?.role === 'user') normalized.pop();
  const recent = normalized.slice(-6);
  if (recent[0]?.role === 'assistant') recent.shift();
  return recent;
}
