const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db/database');
const { firmarToken, requireToken } = require('../auth/roles');

/** Normaliza nombre+apellido en un usuario tipo "nombre.apellido" sin acentos. */
function generarUsuario(nombre, apellidos) {
  const limpiar = s => (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quitar acentos
    .replace(/[^a-z0-9]+/g, '')                          // solo letras/números
    .trim();
  const n = limpiar(nombre);
  const a = limpiar((apellidos || '').split(' ')[0]).slice(0, 12);  // 1er apellido (máx 12)
  const inicial = n.slice(0, 1);
  return `${inicial}${a}`;   // inicial del nombre + primer apellido (ej. alorenzo)
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
      user: { id: user.id, usuario: user.usuario, nombre: user.nombre, apellidos: user.apellidos, email: user.email, rol: user.rol }
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

/**
 * POST /api/auth/cambiar-password
 * Cualquier usuario cambia SU PROPIA contraseña. Requiere token + contraseña actual.
 * Body: { actual, nueva }
 */
router.post('/cambiar-password', requireToken, async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!actual || !nueva) {
    return res.status(400).json({ ok: false, error: 'Faltan la contraseña actual y la nueva' });
  }
  if (String(nueva).length < 8) {
    return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const ok = await bcrypt.compare(actual, user.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'La contraseña actual no es correcta' });

    const hash = await bcrypt.hash(nueva, 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, user.id]);
    res.json({ ok: true, message: 'Contraseña actualizada' });
  } catch (err) {
    console.error('Cambiar password error:', err);
    res.status(500).json({ ok: false, error: 'Error al cambiar la contraseña' });
  }
});

/**
 * GET /api/auth/yo — devuelve los datos frescos del usuario del token.
 * Útil para "Mi cuenta" cuando la sesión local no tiene todos los campos.
 */
router.get('/yo', requireToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, usuario, email, nombre, apellidos, rol FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    console.error('Yo error:', err);
    res.status(500).json({ ok: false, error: 'Error' });
  }
});

/**
 * PATCH /api/auth/mi-cuenta
 * El usuario edita SUS PROPIOS datos personales: nombre, apellidos, email.
 * NO permite cambiar usuario, rol ni activo (eso es cosa de la gestión de usuarios).
 * Body: { nombre?, apellidos?, email? }
 */
router.patch('/mi-cuenta', requireToken, async (req, res) => {
  const { nombre, apellidos, email, usuario } = req.body || {};
  const sets = [], vals = [];
  let i = 1;
  if (nombre !== undefined) {
    if (!String(nombre).trim()) return res.status(400).json({ ok: false, error: 'El nombre no puede estar vacío' });
    sets.push(`nombre = $${i++}`); vals.push(String(nombre).trim());
  }
  if (apellidos !== undefined) {
    if (!String(apellidos).trim()) return res.status(400).json({ ok: false, error: 'Los apellidos no pueden estar vacíos' });
    sets.push(`apellidos = $${i++}`); vals.push(String(apellidos).trim());
  }
  if (email !== undefined) {
    const e = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ ok: false, error: 'Email no válido' });
    sets.push(`email = $${i++}`); vals.push(e);
  }
  // Solo el super puede cambiar su propio nombre de usuario
  if (usuario !== undefined) {
    if (req.user.rol !== 'super') {
      return res.status(403).json({ ok: false, error: 'Solo el propietario puede cambiar su nombre de usuario' });
    }
    const u = String(usuario).trim().toLowerCase().replace(/\s+/g, '');
    if (u.length < 3) return res.status(400).json({ ok: false, error: 'El usuario debe tener al menos 3 caracteres' });
    const { rows: ex } = await pool.query('SELECT 1 FROM users WHERE usuario = $1 AND id <> $2', [u, req.user.id]);
    if (ex.length) return res.status(409).json({ ok: false, error: 'Ese usuario ya existe' });
    sets.push(`usuario = $${i++}`); vals.push(u);
  }
  if (!sets.length) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });

  sets.push(`updated_at = NOW()`);
  vals.push(req.user.id);
  try {
    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, usuario, email, nombre, apellidos, rol`,
      vals
    );
    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Ese email ya está en uso' });
    console.error('Mi-cuenta error:', err);
    res.status(500).json({ ok: false, error: 'Error al actualizar tus datos' });
  }
});

/**
 * POST /api/auth/reset-super  — SALVAVIDAS de emergencia.
 * Resetea SOLO la contraseña del usuario 'super' existente. Protegido con x-admin-secret.
 * NO borra usuarios ni toca a los demás. Se llama por consola si se olvida la clave del super.
 * Body: { nueva }
 */
router.post('/reset-super', async (req, res) => {
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  const { nueva } = req.body || {};
  if (!nueva || String(nueva).length < 8) {
    return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  try {
    const { rows } = await pool.query("SELECT id, usuario FROM users WHERE rol = 'super' LIMIT 1");
    const sup = rows[0];
    if (!sup) return res.status(404).json({ ok: false, error: 'No hay usuario super. Usa /api/auth/seed.' });

    const hash = await bcrypt.hash(nueva, 12);
    await pool.query('UPDATE users SET password_hash = $1, activo = true, updated_at = NOW() WHERE id = $2', [hash, sup.id]);
    res.json({ ok: true, message: `Contraseña del super (${sup.usuario}) restablecida.` });
  } catch (err) {
    console.error('Reset super error:', err);
    res.status(500).json({ ok: false, error: 'Error al restablecer' });
  }
});

module.exports = router;
