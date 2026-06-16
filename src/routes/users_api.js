const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db/database');
const { requireToken, requireNivel, puedeGestionar, puedeAsignarRol, nivelDe } = require('../auth/roles');

/** Genera usuario "nombre.apellido" sin acentos, único (añade número si choca). */
function baseUsuario(nombre, apellidos) {
  const limpiar = s => (s || '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '').trim();
  const n = limpiar(nombre);
  const a = limpiar((apellidos || '').split(' ')[0]).slice(0, 12);  // 1er apellido (máx 12)
  return `${n.slice(0, 1)}${a}`;   // inicial del nombre + primer apellido (ej. alorenzo)
}
async function usuarioUnico(base) {
  let u = base, n = 1;
  while (true) {
    const { rows } = await pool.query('SELECT 1 FROM users WHERE usuario = $1', [u]);
    if (!rows.length) return u;
    u = `${base}${++n}`;
  }
}

/**
 * GET /api/users — listar usuarios. Solo admin+.
 * Cada uno ve a todos, pero el frontend solo ofrece acciones sobre inferiores.
 * (La verdad la impone el backend en cada operación.)
 */
/**
 * GET /api/users/lista — lista ligera de usuarios activos (id, nombre, usuario).
 * Accesible a cualquier usuario con token (para poblar el desplegable de responsable).
 * No expone datos sensibles.
 */
router.get('/lista', requireToken, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, usuario, nombre, apellidos, rol FROM users WHERE activo = true
       ORDER BY nombre ASC`
    );
    res.json({ ok: true, users: rows });
  } catch (err) {
    console.error('Users lista error:', err);
    res.status(500).json({ ok: false, error: 'Error al listar' });
  }
});

router.get('/', requireToken, requireNivel('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, usuario, email, nombre, apellidos, rol, activo, created_at
       FROM users ORDER BY
         CASE rol WHEN 'super' THEN 4 WHEN 'admin' THEN 3 WHEN 'interno' THEN 2 ELSE 1 END DESC,
         created_at ASC`
    );
    res.json({ ok: true, users: rows });
  } catch (err) {
    console.error('Users GET error:', err);
    res.status(500).json({ ok: false, error: 'Error al listar usuarios' });
  }
});

/**
 * POST /api/users — crear usuario. Solo admin+.
 * Solo se puede crear un rol estrictamente inferior al del actor.
 * Body: { nombre, apellidos, email, rol, password }
 */
router.post('/', requireToken, requireNivel('admin'), async (req, res) => {
  const { nombre, apellidos, email, rol, password } = req.body || {};
  if (!nombre || !apellidos || !email || !rol || !password) {
    return res.status(400).json({ ok: false, error: 'Faltan datos' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });
  }
  // Jerarquía: el actor solo crea roles por debajo del suyo (y nunca 'super')
  if (!puedeAsignarRol(req.user.rol, rol)) {
    return res.status(403).json({ ok: false, error: 'No puedes crear un usuario de ese rol' });
  }
  try {
    const usuario = await usuarioUnico(baseUsuario(nombre, apellidos));
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (usuario, email, nombre, apellidos, rol, password_hash, activo)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       RETURNING id, usuario, email, nombre, apellidos, rol, activo, created_at`,
      [usuario, String(email).trim().toLowerCase(), nombre.trim(), apellidos.trim(), rol, hash]
    );
    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    if (err.code === '23505') {  // unique violation (email)
      return res.status(409).json({ ok: false, error: 'Ese email ya está registrado' });
    }
    console.error('Users POST error:', err);
    res.status(500).json({ ok: false, error: 'Error al crear el usuario' });
  }
});

/**
 * PATCH /api/users/:id — editar (activo, rol, reset password). Solo admin+.
 * Reglas: el actor debe estar por encima del objetivo Y del nuevo rol.
 * El super es intocable por cualquiera.
 * Body: { activo?, rol?, password? }
 */
router.patch('/:id', requireToken, requireNivel('admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido' });

  try {
    const { rows: objRows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const objetivo = objRows[0];
    if (!objetivo) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    // El super es intocable por cualquier vía
    if (objetivo.rol === 'super') {
      return res.status(403).json({ ok: false, error: 'El usuario propietario no puede modificarse' });
    }
    // El actor debe estar estrictamente por encima del objetivo
    if (!puedeGestionar(req.user.rol, objetivo.rol)) {
      return res.status(403).json({ ok: false, error: 'No puedes gestionar a este usuario' });
    }
    // Nadie puede tocarse a sí mismo por esta vía (evita auto-bloqueo/escalada)
    if (objetivo.id === req.user.id) {
      return res.status(403).json({ ok: false, error: 'No puedes modificar tu propia cuenta aquí' });
    }

    const { activo, rol, password, usuario } = req.body || {};
    const sets = [], vals = [];
    let i = 1;

    if (typeof activo === 'boolean') { sets.push(`activo = $${i++}`); vals.push(activo); }

    if (usuario !== undefined) {
      const u = String(usuario).trim().toLowerCase().replace(/\s+/g, '');
      if (u.length < 3) return res.status(400).json({ ok: false, error: 'El usuario debe tener al menos 3 caracteres' });
      // Comprobar que no lo tenga otro
      const { rows: ex } = await pool.query('SELECT 1 FROM users WHERE usuario = $1 AND id <> $2', [u, id]);
      if (ex.length) return res.status(409).json({ ok: false, error: 'Ese usuario ya existe' });
      sets.push(`usuario = $${i++}`); vals.push(u);
    }

    if (rol !== undefined) {
      // El nuevo rol también debe estar por debajo del actor (y no 'super')
      if (!puedeAsignarRol(req.user.rol, rol)) {
        return res.status(403).json({ ok: false, error: 'No puedes asignar ese rol' });
      }
      sets.push(`rol = $${i++}`); vals.push(rol);
    }

    if (password !== undefined) {
      if (String(password).length < 8) {
        return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });
      }
      const hash = await bcrypt.hash(password, 12);
      sets.push(`password_hash = $${i++}`); vals.push(hash);
    }

    if (!sets.length) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });

    sets.push(`updated_at = NOW()`);
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, usuario, email, nombre, apellidos, rol, activo, created_at`,
      vals
    );
    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    console.error('Users PATCH error:', err);
    res.status(500).json({ ok: false, error: 'Error al actualizar' });
  }
});

module.exports = router;
