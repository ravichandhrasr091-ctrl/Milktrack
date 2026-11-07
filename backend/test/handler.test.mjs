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
