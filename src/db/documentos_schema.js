const { pool } = require('./database');

/**
 * Tabla documentos — aportes internos por licitación (facturas, presupuestos, ofertas…).
 * Los archivos viven en el bucket PRIVADO de R2 (aportes-csg). Aquí solo los metadatos.
 * La columna `key` es la ruta en R2: aportes/{licitacion_id}/{uuid}_{nombre}.
 */
async function initDocumentos() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS documentos (
        id            BIGSERIAL PRIMARY KEY,
        licitacion_id VARCHAR(120) NOT NULL,
        archivo       VARCHAR(300) NOT NULL,        -- nombre original del archivo
        key           VARCHAR(500) NOT NULL UNIQUE,  -- ruta/clave en R2
        tamano        BIGINT,                        -- bytes
        content_type  VARCHAR(150),
        subido_por    VARCHAR(120),                  -- usuario del token
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS documentos_licit_idx ON documentos(licitacion_id, created_at DESC);
    `);
    console.log('✅ Documentos table ready');
  } finally {
    client.release();
  }
}

module.exports = { initDocumentos };
