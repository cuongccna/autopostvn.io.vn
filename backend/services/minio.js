const Minio = require('minio');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const BUCKET = process.env.MINIO_BUCKET || 'autobot-uploads';

let client = null;

function getClient() {
  if (client) return client;

  const config = {
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
  };

  client = new Minio.Client(config);
  return client;
}

async function ensureBucket() {
  const mc = getClient();
  const exists = await mc.bucketExists(BUCKET);
  if (!exists) {
    await mc.makeBucket(BUCKET, 'ap-southeast-1');
    console.log(`[MinIO] Bucket "${BUCKET}" created`);
  }
  return BUCKET;
}

async function uploadFile(fileBuffer, originalName, mimeType) {
  const ext = path.extname(originalName).toLowerCase();
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const objectKey = `orders/${yearMonth}/${uuidv4()}${ext}`;

  await ensureBucket();
  const mc = getClient();

  await mc.putObject(BUCKET, objectKey, fileBuffer, fileBuffer.length, {
    'Content-Type': mimeType,
    'X-Amz-Meta-Original-Name': Buffer.from(originalName, 'utf8').toString('base64'),
    'X-Amz-Meta-Upload-Time': now.toISOString()
  });

  console.log(`[MinIO] Uploaded: ${objectKey} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
  return objectKey;
}

async function getPresignedUrl(objectKey, expirySeconds = 900) {
  const mc = getClient();
  try {
    return await mc.presignedGetObject(BUCKET, objectKey, expirySeconds);
  } catch (err) {
    if (err.code === 'NoSuchKey') return null;
    throw err;
  }
}

async function deleteFile(objectKey) {
  const mc = getClient();
  try {
    await mc.removeObject(BUCKET, objectKey);
    return true;
  } catch (err) {
    if (err.code === 'NoSuchKey') return false;
    throw err;
  }
}

module.exports = { uploadFile, getPresignedUrl, deleteFile, ensureBucket };
