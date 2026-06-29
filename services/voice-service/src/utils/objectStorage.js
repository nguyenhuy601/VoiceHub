const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { logger } = require('@enterprise/shared');

let s3Client = null;

function isEnabled() {
  return !!(
    process.env.MINIO_ENDPOINT &&
    process.env.MINIO_ACCESS_KEY &&
    process.env.MINIO_SECRET_KEY &&
    process.env.MINIO_BUCKET
  );
}

function getBucket() {
  return String(process.env.MINIO_BUCKET || 'meeting-recordings').trim();
}

function getClient() {
  if (!isEnabled()) return null;
  if (!s3Client) {
    const endpoint = String(process.env.MINIO_ENDPOINT).trim().replace(/\/+$/, '');
    const useSsl = String(process.env.MINIO_USE_SSL || 'false').toLowerCase() === 'true';
    s3Client = new S3Client({
      region: process.env.MINIO_REGION || 'us-east-1',
      endpoint,
      forcePathStyle: true,
      tls: useSsl,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY,
        secretAccessKey: process.env.MINIO_SECRET_KEY,
      },
    });
  }
  return s3Client;
}

function assertStorage() {
  const client = getClient();
  if (!client) {
    throw new Error('Object storage (MinIO) is not configured');
  }
  return client;
}

async function putObject(storagePath, body, contentType) {
  const client = assertStorage();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: storagePath,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    })
  );
  return storagePath;
}

async function getObjectStream(storagePath) {
  const client = assertStorage();
  const res = await client.send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: storagePath,
    })
  );
  return res.Body;
}

async function deleteObject(storagePath) {
  if (!storagePath || !isEnabled()) return false;
  try {
    const client = assertStorage();
    await client.send(
      new DeleteObjectCommand({
        Bucket: getBucket(),
        Key: storagePath,
      })
    );
    return true;
  } catch (err) {
    logger.warn(`objectStorage.deleteObject failed path=${storagePath}: ${err.message}`);
    return false;
  }
}

async function deleteObjects(storagePaths = []) {
  const paths = [...new Set((storagePaths || []).map((p) => String(p || '').trim()).filter(Boolean))];
  await Promise.all(paths.map((p) => deleteObject(p)));
  return paths.length;
}

async function objectExists(storagePath) {
  if (!storagePath || !isEnabled()) return false;
  try {
    const client = assertStorage();
    await client.send(
      new HeadObjectCommand({
        Bucket: getBucket(),
        Key: storagePath,
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function getSignedReadUrl(storagePath, ttlSeconds = 3600) {
  const client = assertStorage();
  const cmd = new GetObjectCommand({
    Bucket: getBucket(),
    Key: storagePath,
  });
  return getSignedUrl(client, cmd, { expiresIn: Math.min(Math.max(ttlSeconds, 60), 7 * 24 * 3600) });
}

module.exports = {
  isEnabled,
  getBucket,
  putObject,
  getObjectStream,
  deleteObject,
  deleteObjects,
  objectExists,
  getSignedReadUrl,
};
