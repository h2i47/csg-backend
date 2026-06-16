const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { requireToken } = require('../auth/roles');

// Autenticación por token JWT (cualquier usuario logueado puede usar el pipeline).
const requireAuth = requireToken;

const ESTADOS_VALIDOS   = ['Nuevo','En análisis','Oferta enviada','Ganada','Perdida','Descartada'];
const PRIORIDADES_VALIDAS = ['Alta','Media','Baja'];

/**
 * GET /api/pipeline
 * Devuelve todos los estados guardados. El CRM los cruza con el CSV por licitacion_id.
 */
router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT licitacion_id, estado, prioridad, nota, responsable, extra,
              actualizado_por, updated_at
       FROM pipeline_estados`
    );
    // Devolver como objeto { licitacion_id: {...} } para que el CRM lo aplique fácil
    const mapa = {};
    for (const r of rows) mapa[r.licitacion_id] = r;
    res.json({ ok: true, estados: mapa });
  } catch (err) {
    console.error('Pipeline GET error:', err);
    res.status(500).json({ ok: false, error: 'Error al leer el pipeline' });
  }
});

/**
 * PUT /api/pipeline/:id
 * Crea o actualiza (UPSERT) el estado de una licitación.
 * Body: { estado, prioridad, nota, responsable, extra, actualizado_por }
 * Todos opcionales; solo se actualiza lo que llega.
 */
router.put('/:id', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'Falta licitacion_id' });

  const { estado, prioridad, nota, responsable, extra } = req.body || {};
  // La autoría sale del token (no se fía de lo que mande el frontend)
  const actualizado_por = req.user.usuario;

  // Validaciones suaves (no bloquean si no llega el campo)
  if (estado && !ESTADOS_VALIDOS.includes(estado))
    return res.status(400).json({ ok: false, error: 'Estado no válido' });
  if (prioridad && !PRIORIDADES_VALIDAS.includes(prioridad))
    return res.status(400).json({ ok: false, error: 'Prioridad no válida' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO pipeline_estados
         (licitacion_id, estado, prioridad, nota, responsable, extra, actualizado_por, updated_at)
       VALUES ($1,
               COALESCE($2,'Nuevo'),
               COALESCE($3,'Media'),
               $4, $5,
               COALESCE($6,'{}')::jsonb,
               $7, NOW())
       ON CONFLICT (licitacion_id) DO UPDATE SET
         estado          = COALESCE(EXCLUDED.estado, pipeline_estados.estado),
         prioridad       = COALESCE(EXCLUDED.prioridad, pipeline_estados.prioridad),
         nota            = COALESCE(EXCLUDED.nota, pipeline_estados.nota),
         responsable     = COALESCE(EXCLUDED.responsable, pipeline_estados.responsable),
         extra           = COALESCE(EXCLUDED.extra, pipeline_estados.extra),
         actualizado_por = COALESCE(EXCLUDED.actualizado_por, pipeline_estados.actualizado_por),
         updated_at      = NOW()
       RETURNING *`,
      [
        id,
        estado || null,
        prioridad || null,
        nota ?? null,
        responsable ?? null,
        extra ? JSON.stringify(extra) : null,
        actualizado_por ?? null
      ]
    );
    res.json({ ok: true, estado: rows[0] });
  } catch (err) {
    console.error('Pipeline PUT error:', err);
    res.status(500).json({ ok: false, error: 'Error al guardar' });
  }
});

module.exports = router;
