const { pool } = require('./database');

/**
 * Tabla users — usuarios del sistema con jerarquía de roles.
 * Niveles (de mayor a menor): super > admin > interno / asociado
 * - super:    propietario, intocable, gestiona todo lo de debajo.
 * - admin:    gestiona usuarios de nivel interno/asociado.
 * - interno:  accede a panel + CRM, no gestiona usuarios.
 * - asociado: accede solo al CRM.
 */
async function initUsers() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id             SERIAL PRIMARY KEY,
        usuario        VARCHAR(120) UNIQUE NOT NULL,   -- nombre.apellido (login)
        email          VARCHAR(255) UNIQUE NOT NULL,   -- email (login alternativo)
        nombre         VARCHAR(120) NOT NULL,
        apellidos      VARCHAR(160) NOT NULL,
        rol            VARCHAR(20)  NOT NULL DEFAULT 'asociado',  -- super|admin|interno|asociado
        password_hash  VARCHAR(255) NOT NULL,
        activo         BOOLEAN      DEFAULT true,
        created_at     TIMESTAMPTZ  DEFAULT NOW(),
        updated_at     TIMESTAMPTZ  DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS users_usuario_idx ON users(usuario);
      CREATE INDEX IF NOT EXISTS users_email_idx   ON users(email);
    `);
    console.log('✅ Users table ready');
  } finally {
    client.release();
  }
}

module.exports = { initUsers };
