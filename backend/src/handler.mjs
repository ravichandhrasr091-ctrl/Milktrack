import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const RECEIPT_FIELDS = [
  'id',
  'formatId',
  'milkType',
  'receiptDate',
  'receiptTime',
  'shift',
  'quantityLitres',
  'fat',
  'snf',
  'clr',
  'ratePerLitre',
  'totalAmount',
  'supplierCode',
  'mccCode',
  'vlccCode',
  'originalImageRef',
  'originalFilename',
  'originalMimeType',
  'ocrRawText',
  'verificationStatus',
  'verificationTimestamp',
  'createdAt',
  'updatedAt',
  'entryMethod',
];
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function handler(event) {
  try {
    const userId = getUserId(event);
    const receiptId = event.pathParameters?.receiptId;
    const method = event.requestContext?.http?.method;
    const path = event.rawPath;

    if (method === 'GET' && path === '/receipts') {
      return await listReceipts(userId, event.queryStringParameters?.nextToken);
    }
    if (method === 'POST' && path === '/receipts') {
      return await saveReceipt(userId, parseJsonBody(event));
    }
    if (method === 'POST' && path === `/receipts/${receiptId}/image-upload`) {
      return await createImageUploadUrl(userId, receiptId, parseJsonBody(event));
    }
    if (method === 'GET' && path === `/receipts/${receiptId}/image-download`) {
      return await createImageDownloadUrl(userId, receiptId);
    }
    throw new HttpError(404, 'The requested API route was not found.');
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(error.statusCode, { error: error.message });
    }
    console.error('MilkTrack API request failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
      requestId: event?.requestContext?.requestId,
    });
    return jsonResponse(500, { error: 'The request could not be completed.' });
  }
}

function getUserId(event) {
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new HttpError(401, 'A valid sign-in session is required.');
  }
  return userId;
}

function parseJsonBody(event) {
  if (!event.body) throw new HttpError(400, 'A JSON request body is required.');
  try {
    return JSON.parse(event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body);
  } catch {
    throw new HttpError(400, 'The request body must be valid JSON.');
  }
}

async function createImageUploadUrl(userId, receiptId, body) {
  if (!isReceiptId(receiptId)) throw new HttpError(400, 'Invalid receipt ID.');
  const contentType = body?.contentType;
  const contentLength = body?.contentLength;
  if (!IMAGE_TYPES.has(contentType)) {
    throw new HttpError(400, 'This receipt photo format is not supported.');
  }
  if (
    !Number.isInteger(contentLength) ||
    contentLength < 1 ||
    contentLength > MAX_IMAGE_BYTES
  ) {
    throw new HttpError(400, 'Receipt photos must be between 1 byte and 10 MB.');
  }

  const existing = await getReceipt(userId, receiptId);
  if (existing) return jsonResponse(200, { alreadySaved: true });

  const imageKey = `${userId}/${receiptId}`;
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: process.env.RECEIPT_IMAGES_BUCKET,
    Key: imageKey,
    Fields: { 'Content-Type': contentType },
    Conditions: [
      ['content-length-range', 1, MAX_IMAGE_BYTES],
      ['eq', '$Content-Type', contentType],
    ],
    Expires: 300,
  });
  return jsonResponse(200, { uploadUrl: url, fields, expiresIn: 300 });
}

async function saveReceipt(userId, body) {
  const receipt = validateReceipt(body);
  const imageKey = `${userId}/${receipt.id}`;
  const image = await s3.send(new HeadObjectCommand({
    Bucket: process.env.RECEIPT_IMAGES_BUCKET,
    Key: imageKey,
  })).catch((error) => {
    if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
      throw new HttpError(400, 'Upload the original receipt photo before saving.');
    }
    throw error;
  });

  if (
    !Number.isInteger(image.ContentLength) ||
    image.ContentLength < 1 ||
    image.ContentLength > MAX_IMAGE_BYTES ||
    image.ContentType !== receipt.originalMimeType
  ) {
    throw new HttpError(400, 'The uploaded receipt photo does not match the receipt.');
  }

  const item = {
    userId,
    ...receipt,
    imageKey,
    imageSize: image.ContentLength,
    syncedAt: new Date().toISOString(),
  };
  try {
    await dynamo.send(new PutCommand({
      TableName: process.env.RECEIPTS_TABLE,
      Item: item,
      ConditionExpression:
        'attribute_not_exists(#userId) AND attribute_not_exists(#id)',
      ExpressionAttributeNames: { '#userId': 'userId', '#id': 'id' },
    }));
  } catch (error) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return jsonResponse(200, { receipt });
    }
    throw error;
  }
  return jsonResponse(201, { receipt });
}

async function listReceipts(userId, nextToken) {
  const exclusiveStartKey = decodeNextToken(nextToken, userId);
  const result = await dynamo.send(new QueryCommand({
    TableName: process.env.RECEIPTS_TABLE,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': userId },
    ProjectionExpression: RECEIPT_FIELDS.map((field) => `#${field}`).join(', '),
    ExpressionAttributeNames: Object.fromEntries(
      RECEIPT_FIELDS.map((field) => [`#${field}`, field]),
    ),
    ExclusiveStartKey: exclusiveStartKey,
    Limit: 100,
    ScanIndexForward: false,
  }));
  const response = {
    receipts: result.Items ?? [],
    ...(result.LastEvaluatedKey
      ? { nextToken: encodeNextToken(result.LastEvaluatedKey) }
      : {}),
  };
  return jsonResponse(200, response);
}

async function createImageDownloadUrl(userId, receiptId) {
  if (!isReceiptId(receiptId)) throw new HttpError(400, 'Invalid receipt ID.');
  const receipt = await getReceipt(userId, receiptId);
  if (!receipt) throw new HttpError(404, 'Receipt not found.');
  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: process.env.RECEIPT_IMAGES_BUCKET,
      Key: receipt.imageKey,
      ResponseContentDisposition: `inline; filename="${receiptId}"`,
      ResponseContentType: receipt.originalMimeType,
    }),
    { expiresIn: 300 },
  );
  return jsonResponse(200, { downloadUrl, expiresIn: 300 });
}

async function getReceipt(userId, receiptId) {
  const result = await dynamo.send(new GetCommand({
    TableName: process.env.RECEIPTS_TABLE,
    Key: { userId, id: receiptId },
    ProjectionExpression: '#userId, #id, #imageKey',
    ExpressionAttributeNames: {
      '#userId': 'userId',
      '#id': 'id',
      '#imageKey': 'imageKey',
    },
  }));
  return result.Item;
}

function validateReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Receipt details are required.');
  }
  const receipt = Object.fromEntries(
    RECEIPT_FIELDS
      .filter((field) => Object.hasOwn(value, field))
      .map((field) => [field, value[field]]),
  );
  if (
    !isReceiptId(receipt.id) ||
    receipt.originalImageRef !== receipt.id ||
    receipt.formatId !== 'dodla-cow-provisional-slip-v1' ||
    receipt.milkType !== 'Cow' ||
    receipt.verificationStatus !== 'verified' ||
    !['Morning/Day', 'Night'].includes(receipt.shift) ||
    !['camera', 'upload'].includes(receipt.entryMethod) ||
    !isValidDate(receipt.receiptDate) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(receipt.receiptTime) ||
    receipt.shift !== shiftForTime(receipt.receiptTime) ||
    !IMAGE_TYPES.has(receipt.originalMimeType) ||
    typeof receipt.originalFilename !== 'string' ||
    receipt.originalFilename.length < 1 ||
    receipt.originalFilename.length > 255 ||
    typeof receipt.ocrRawText !== 'string' ||
    receipt.ocrRawText.length > 20_000 ||
    !isIsoTimestamp(receipt.verificationTimestamp) ||
    !isIsoTimestamp(receipt.createdAt) ||
    !isIsoTimestamp(receipt.updatedAt) ||
    !['quantityLitres', 'fat', 'snf', 'clr', 'ratePerLitre', 'totalAmount']
      .every((field) => isNumericString(receipt[field])) ||
    !['supplierCode', 'mccCode', 'vlccCode']
      .every((field) => receipt[field] === undefined || isShortString(receipt[field], 80))
  ) {
    throw new HttpError(400, 'Receipt details are incomplete or invalid.');
  }
  return receipt;
}

function isReceiptId(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isIsoTimestamp(value) {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function isNumericString(value) {
  return typeof value === 'string' &&
    /^\d{1,8}(?:\.\d{1,4})?$/.test(value) &&
    Number.isFinite(Number(value));
}

function isShortString(value, maxLength) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function shiftForTime(time) {
  const hour = Number(time.slice(0, 2));
  return hour >= 6 && hour < 18 ? 'Morning/Day' : 'Night';
}

function encodeNextToken(key) {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

function decodeNextToken(token, userId) {
  if (!token) return undefined;
  if (typeof token !== 'string' || token.length > 2048) {
    throw new HttpError(400, 'Invalid pagination token.');
  }
  try {
    const key = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (
      !key ||
      typeof key !== 'object' ||
      key.userId !== userId ||
      typeof key.id !== 'string'
    ) {
      throw new Error('Invalid key.');
    }
    return { userId: key.userId, id: key.id };
  } catch {
    throw new HttpError(400, 'Invalid pagination token.');
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}
