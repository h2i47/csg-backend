const { S3Client } = require('@aws-sdk/client-s3');

/**
 * Cliente S3 apuntando a Cloudflare R2 (compatible con la API de S3).
 * Usa las credenciales de R2 ya configuradas en Railway:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * Bucket privado para aportes internos: R2_BUCKET_APORTES (por defecto 'aportes-csg').
 */
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const BUCKET_APORTES = process.env.R2_BUCKET_APORTES || 'aportes-csg';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

module.exports = { r2, BUCKET_APORTES };
