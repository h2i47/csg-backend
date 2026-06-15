const { pool } = require('./database');

/**
 * Tabla pipeline_estados — estado de trabajo de cada licitación del CRM.
 * Independiente de la tabla `leads`. Diseñada para crecer:
 *   - lo estructurado y frecuente va en columnas propias
 *   - lo eventual/futuro va en la columna JSONB `extra` (sin migrar la tabla)
 */
async function initPipeline() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS pipeline_estados (
        licitacion_id    VARCHAR(120) PRIMARY KEY,   -- columna 'id' del CSV (única y estable)
        estado           VARCHAR(40)  DEFAULT 'Nuevo',
        prioridad        VARCHAR(20)  DEFAULT 'Media',
        nota             TEXT,
        responsable      VARCHAR(120),               -- quién la lleva (idea futura, nullable)
        extra            JSONB        DEFAULT '{}'::jsonb,  -- campo flexible para datos futuros
        actualizado_por  VARCHAR(120),               -- autoría del último cambio
        updated_at       TIMESTAMPTZ  DEFAULT NOW(),
        created_at       TIMESTAMPTZ  DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS pipeline_estado_idx   ON pipeline_estados(estado);
      CREATE INDEX IF NOT EXISTS pipeline_updated_idx  ON pipeline_estados(updated_at DESC);
    `);
    console.log('✅ Pipeline table ready');
  } finally {
    client.release();
  }
}

module.exports = { initPipeline };
