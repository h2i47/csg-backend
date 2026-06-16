const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db/database');
const { firmarToken } = require('../auth/roles');

/** Normaliza nombre+apellido en un usuario tipo "nombre.apellido" sin acentos. */
function generarUsuario(nombre, apellidos) {
  const limpiar = s => (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quitar acentos
    .replace(/[^a-z0-9]+/g, '')                          // solo letras/números
    .trim();
  const n = limpiar(nombre);
  const a = limpiar((apellidos || '').split(' ')[0]);   // primer apellido
  return `${n}.${a}`;
}

/**
 * POST /api/auth/login
 * Body: { login, password }  — login puede ser usuario o email.
 * Devuelve { ok, token, user }.
 */
router.post('/login', async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) {
    return res.status(400).json({ ok: false, error: 'Faltan credenciales' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE (usuario = $1 OR email = $1) AND activo = true LIMIT 1`,
      [String(login).trim().toLowerCase()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });

    const token = firmarToken(user);
    res.json({
      ok: true,
      token,
      user: { id: user.id, usuario: user.usuario, nombre: user.nombre, apellidos: user.apellidos, rol: user.rol }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ ok: false, error: 'Error del servidor' });
  }
});

/**
 * POST /api/auth/seed
 * Crea el PRIMER usuario (super) UNA sola vez. Solo funciona si la tabla está vacía.
 * Protegido con x-admin-secret (ADMIN_SECRET) para que nadie más lo dispare.
 * Body: { nombre, apellidos, email, password }
 */
router.post('/seed', async (req, res) => {
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  try {
    const { rows: count } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
    if (count[0].n > 0) {
      return res.status(409).json({ ok: false, error: 'El sistema ya tiene usuarios. Seed deshabilitado.' });
    }

    const { nombre, apellidos, email, password } = req.body || {};
    if (!nombre || !apellidos || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Faltan datos (nombre, apellidos, email, password)' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const usuario = generarUsuario(nombre, apellidos);
    const hash = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
      `INSERT INTO users (usuario, email, nombre, apellidos, rol, password_hash, activo)
       VALUES ($1, $2, $3, $4, 'super', $5, true)
       RETURNING id, usuario, email, nombre, apellidos, rol`,
      [usuario, String(email).trim().toLowerCase(), nombre.trim(), apellidos.trim(), hash]
    );
    res.json({ ok: true, user: rows[0], message: 'Usuario propietario creado. Seed ya deshabilitado.' });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ ok: false, error: 'Error al crear el usuario inicial' });
  }
});

module.exports = router;
