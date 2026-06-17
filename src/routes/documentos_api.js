const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { pool } = require('../db/database');
const { requireToken, nivelDe } = require('../auth/roles');
const { r2, BUCKET_APORTES } = require('../r2/client');

const MAX_BYTES = 25 * 1024 * 1024;   // 25 MB por archivo
const URL_EXPIRA = 300;               // URLs firmadas válidas 5 min

/**
 * ¿Puede el usuario acceder a los documentos de esta licitación?
 * admin+ siempre; interno/asociado solo si son el responsable.
 */
async function puedeAcceder(user, licitacionId) {
  if (nivelDe(user.rol) >= nivelDe('admin')) return true;
  const { rows } = await pool.query(
    'SELECT responsable FROM pipeline_estados WHERE licitacion_id = $1', [licitacionId]
  );
  const resp = rows[0] && rows[0].responsable;
  return resp && resp === user.usuario;
}

// Sanitiza el nombre de archivo (evita rutas y caracteres raros)
function nombreSeguro(nombre) {
  return String(nombre || 'archivo')
    .replace(/[\/\\]/g, '_')
    .replace(/[^\w.\- ]+/g, '')
    .slice(0, 200) || 'archivo';
}

/**
 * POST /api/documentos/:licitacionId/presign-upload
 * Body: { archivo, content_type, tamano }
 * Devuelve { uploadUrl, key, docId } para subir directo a R2 con PUT.
 * Registra el documento en BD al pedir la URL (estado optimista).
 */
router.post('/:licitacionId/presign-upload', requireToken, async (req, res) => {
  const licitacionId = String(req.params.licitacionId || '').trim();
  if (!licitacionId) return res.status(400).json({ ok: false, error: 'Falta licitacion_id' });

  const { archivo, content_type, tamano } = req.body || {};
  if (!archivo) return res.status(400).json({ ok: false, error: 'Falta el nombre del archivo' });
  if (tamano && Number(tamano) > MAX_BYTES) {
    return res.status(400).json({ ok: false, error: 'El archivo supera el máximo de 25 MB' });
  }

  try {
    if (!(await puedeAcceder(req.user, licitacionId))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a los documentos de esta licitación' });
    }

    const limpio = nombreSeguro(archivo);
    const key = `aportes/${licitacionId}/${crypto.randomUUID()}_${limpio}`;

    const cmd = new PutObjectCommand({
      Bucket: BUCKET_APORTES,
      Key: key,
      ContentType: content_type || 'application/octet-stream'
    });
    const uploadUrl = await getSignedUrl(r2, cmd, { expiresIn: URL_EXPIRA });

    // Registrar metadatos (la subida la confirma el cliente; si falla, queda huérfano y se puede limpiar luego)
    const { rows } = await pool.query(
      `INSERT INTO documentos (licitacion_id, archivo, key, tamano, content_type, subido_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [licitacionId, limpio, key, tamano || null, content_type || null, req.user.usuario]
    );
    res.json({ ok: true, uploadUrl, key, docId: rows[0].id });
  } catch (err) {
    console.error('Presign upload error:', err);
    res.status(500).json({ ok: false, error: 'Error al preparar la subida' });
  }
});

/**
 * GET /api/documentos/:licitacionId
 * Lista los documentos de una licitación (si el usuario puede acceder).
 */
router.get('/:licitacionId', requireToken, async (req, res) => {
  const licitacionId = String(req.params.licitacionId || '').trim();
  if (!licitacionId) return res.status(400).json({ ok: false, error: 'Falta licitacion_id' });
  try {
    if (!(await puedeAcceder(req.user, licitacionId))) {
      return res.status(403).json({ ok: false, error: 'Sin acceso' });
    }
    const { rows } = await pool.query(
      `SELECT id, archivo, tamano, content_type, subido_por, created_at
       FROM documentos WHERE licitacion_id = $1 ORDER BY created_at DESC`,
      [licitacionId]
    );
    res.json({ ok: true, documentos: rows });
  } catch (err) {
    console.error('Documentos GET error:', err);
    res.status(500).json({ ok: false, error: 'Error al listar documentos' });
  }
});

/**
 * GET /api/documentos/:licitacionId/:docId/presign-download
 * Devuelve una URL firmada temporal para descargar el archivo.
 */
router.get('/:licitacionId/:docId/presign-download', requireToken, async (req, res) => {
  const licitacionId = String(req.params.licitacionId || '').trim();
  const docId = parseInt(req.params.docId, 10);
  if (!licitacionId || !docId) return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
  try {
    if (!(await puedeAcceder(req.user, licitacionId))) {
      return res.status(403).json({ ok: false, error: 'Sin acceso' });
    }
    const { rows } = await pool.query(
      'SELECT archivo, key FROM documentos WHERE id = $1 AND licitacion_id = $2',
      [docId, licitacionId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });

    const cmd = new GetObjectCommand({
      Bucket: BUCKET_APORTES,
      Key: rows[0].key,
      ResponseContentDisposition: `attachment; filename="${rows[0].archivo}"`
    });
    const downloadUrl = await getSignedUrl(r2, cmd, { expiresIn: URL_EXPIRA });
    res.json({ ok: true, downloadUrl });
  } catch (err) {
    console.error('Presign download error:', err);
    res.status(500).json({ ok: false, error: 'Error al preparar la descarga' });
  }
});

module.exports = router;
