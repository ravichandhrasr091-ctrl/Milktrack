import type { FinanceContext } from './financeContext';

export interface FinanceAssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function askFinanceAssistant(
  question: string,
  history: FinanceAssistantMessage[],
  context: FinanceContext | null,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch('/api/ai/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history: history.slice(-6), context }),
    signal,
  });

  const responseText = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(
      'The local assistant returned an invalid response. Restart MilkTrack and try again.',
    );
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : 'The assistant could not answer right now.';
    throw new Error(message);
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('answer' in payload) ||
    typeof payload.answer !== 'string' ||
    !payload.answer.trim()
  ) {
    throw new Error('The assistant returned an empty or invalid answer.');
  }

  return payload.answer.trim();
}
