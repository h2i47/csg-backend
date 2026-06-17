const { pool } = require('./database');

/**
 * Tabla actividad — bitácora de eventos relevantes por licitación.
 * Una fila por evento. Robusta (no usa JSONB compartido, sin riesgo de pisarse).
 * Se registran solo eventos relevantes: cambio de estado, responsable,
 * anomalía de fecha y creación en el pipeline (no notas/checks/prioridad).
 */
async function initActividad() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS actividad (
        id             BIGSERIAL PRIMARY KEY,
        licitacion_id  VARCHAR(120) NOT NULL,        -- 'id' del CSV (misma clave que pipeline)
        usuario        VARCHAR(120),                 -- autor (del token)
        accion         VARCHAR(40)  NOT NULL,        -- tipo: estado | responsable | anomalia | alta
        detalle        TEXT,                         -- texto legible del evento
        created_at     TIMESTAMPTZ  DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS actividad_licit_idx  ON actividad(licitacion_id, created_at DESC);
    `);
    console.log('✅ Actividad table ready');
  } finally {
    client.release();
  }
}

/**
 * Registra un evento en la bitácora. No lanza si falla (la bitácora no debe
 * bloquear la operación principal del pipeline).
 */
async function registrarActividad(licitacion_id, usuario, accion, detalle) {
  try {
    await pool.query(
      `INSERT INTO actividad (licitacion_id, usuario, accion, detalle)
       VALUES ($1, $2, $3, $4)`,
      [licitacion_id, usuario || null, accion, detalle || null]
    );
  } catch (err) {
    console.warn('No se pudo registrar actividad:', err.message);
  }
}

module.exports = { initActividad, registrarActividad };
