import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../src/handler.mjs';

const userId = 'cognito-user-123';
const validId = '123e4567-e89b-42d3-a456-426614174000';

function request({ method = 'GET', path = '/receipts', claims = { sub: userId }, body } = {}) {
  return {
    rawPath: path,
    body,
    requestContext: {
      requestId: 'request-test',
      http: { method },
      authorizer: claims ? { jwt: { claims } } : undefined,
    },
    pathParameters: { receiptId: validId },
  };
}

test('requires a verified Cognito user before accessing receipt routes', async () => {
  const response = await handler(request({ claims: null }));
  assert.equal(response.statusCode, 401);
});

test('requires a verified Cognito user before using the assistant', async () => {
  const response = await handler(request({
    method: 'POST',
    path: '/assistant',
    claims: null,
    body: JSON.stringify({ question: 'What can you do?', history: [] }),
  }));
  assert.equal(response.statusCode, 401);
});

test('answers assistant questions with only validated aggregate context', async () => {
  let command;
  const response = await handler(request({
    method: 'POST',
    path: '/assistant',
    body: JSON.stringify({
      question: 'How much did I earn?',
      history: [{ role: 'user', content: 'Hello' }],
      context: {
        currency: 'INR',
        verifiedReceipts: 2,
        totals: { receipts: 2, litres: '4.5', earningsInr: '220.00' },
        monthlyTotals: [{
          month: '2026-11',
          receipts: 2,
          litres: '4.5',
          earningsInr: '220.00',
          receiptId: 'must-not-be-sent',
        }],
        receiptId: 'must-not-be-sent',
      },
    }),
  }), {
    bedrockClient: {
      send: async (value) => {
        command = value;
        return { output: { message: { content: [{ text: 'You earned INR 220.' }] } } };
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).answer, 'You earned INR 220.');
  assert.equal(command.input.modelId, 'amazon.nova-lite-v1:0');
  const prompt = command.input.messages[1].content[0].text;
  assert.match(prompt, /"earningsInr":"220.00"/);
  assert.doesNotMatch(prompt, /must-not-be-sent/);
});

test('rejects invalid assistant summaries without calling Bedrock', async () => {
  let called = false;
  const response = await handler(request({
    method: 'POST',
    path: '/assistant',
    body: JSON.stringify({
      question: 'How much did I earn?',
      history: [],
      context: {
        currency: 'INR',
        verifiedReceipts: 1,
        totals: { receipts: 1, litres: 'unknown', earningsInr: '100.00' },
      },
    }),
  }), {
    bedrockClient: {
      send: async () => {
        called = true;
        return {};
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});

test('rejects unknown API routes', async () => {
  const response = await handler(request({ path: '/not-a-route' }));
  assert.equal(response.statusCode, 404);
});

test('rejects unsupported image types before issuing an upload URL', async () => {
  const response = await handler(request({
    method: 'POST',
    path: `/receipts/${validId}/image-upload`,
    body: JSON.stringify({ contentType: 'image/svg+xml', contentLength: 100 }),
  }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /format is not supported/i);
});

test('rejects receipt writes that do not contain verified receipt data', async () => {
  const response = await handler(request({
    method: 'POST',
    path: '/receipts',
    body: JSON.stringify({ id: validId }),
  }));
  assert.equal(response.statusCode, 400);
});

test('rejects malformed JSON request bodies', async () => {
  const response = await handler(request({
    method: 'POST',
    path: '/receipts',
    body: '{',
  }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /valid JSON/i);
});
