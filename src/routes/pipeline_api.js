const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { requireToken, nivelDe } = require('../auth/roles');

// Autenticación por token JWT (cualquier usuario logueado puede usar el pipeline).
const requireAuth = requireToken;

const ESTADOS_VALIDOS   = ['Nuevo','En análisis','Oferta enviada','Ganada','Perdida','Descartada'];
const PRIORIDADES_VALIDAS = ['Alta','Media','Baja'];
// Orden de fases para detectar transición desde "Nuevo"
const ORDEN_FASE = { 'Nuevo':0, 'En análisis':1, 'Oferta enviada':2, 'Ganada':3, 'Perdida':3, 'Descartada':3 };

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
  const actualizado_por = req.user.usuario;
  const esAdmin = nivelDe(req.user.rol) >= nivelDe('admin');

  if (estado && !ESTADOS_VALIDOS.includes(estado))
    return res.status(400).json({ ok: false, error: 'Estado no válido' });
  if (prioridad && !PRIORIDADES_VALIDAS.includes(prioridad))
    return res.status(400).json({ ok: false, error: 'Prioridad no válida' });

  try {
    // Estado actual de la licitación (para aplicar reglas de permisos)
    const { rows: prev } = await pool.query(
      'SELECT estado, responsable FROM pipeline_estados WHERE licitacion_id = $1', [id]
    );
    const actual = prev[0] || { estado: 'Nuevo', responsable: null };
    const esResponsable = actual.responsable && actual.responsable === req.user.usuario;

    // --- REGLA 1: salir de "Nuevo" hacia valoración solo admin+ ---
    if (estado && estado !== actual.estado) {
      const saleDeNuevo = actual.estado === 'Nuevo' && ORDEN_FASE[estado] > 0;
      if (saleDeNuevo && !esAdmin) {
        return res.status(403).json({ ok: false, error: 'Solo un administrador puede pasar una licitación a valoración' });
      }
      // --- REGLA 2: una vez en valoración, solo el responsable o admin+ pueden moverla ---
      if (actual.estado !== 'Nuevo' && !esAdmin && !esResponsable) {
        return res.status(403).json({ ok: false, error: 'Solo el responsable o un administrador pueden modificar esta licitación' });
      }
    }

    // --- REGLA 3: asignar/cambiar responsable solo admin+ ---
    let responsableFinal = responsable;
    if (responsable !== undefined && responsable !== null && !esAdmin) {
      return res.status(403).json({ ok: false, error: 'Solo un administrador puede asignar el responsable' });
    }

    // --- Para nota/prioridad/extra en licitación ya en valoración: responsable o admin ---
    if (actual.estado !== 'Nuevo' && (nota !== undefined || prioridad !== undefined || extra !== undefined) && estado === undefined) {
      if (!esAdmin && !esResponsable) {
        return res.status(403).json({ ok: false, error: 'Solo el responsable o un administrador pueden modificar esta licitación' });
      }
    }

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
        responsableFinal ?? null,
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
