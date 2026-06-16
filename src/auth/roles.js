const jwt = require('jsonwebtoken');

/**
 * Jerarquía de roles. Mayor número = más nivel.
 * Las comparaciones de "quién puede gestionar a quién" usan estos niveles.
 */
const NIVEL = { super: 4, admin: 3, interno: 2, asociado: 1 };

function nivelDe(rol) {
  return NIVEL[rol] || 0;
}

/** ¿El actor (rol) puede gestionar a un objetivo de rol objetivoRol? Solo estrictamente por debajo. */
function puedeGestionar(actorRol, objetivoRol) {
  return nivelDe(actorRol) > nivelDe(objetivoRol);
}

/** ¿El actor puede crear/asignar el rol nuevoRol? Solo roles estrictamente por debajo del suyo. */
function puedeAsignarRol(actorRol, nuevoRol) {
  // Nadie puede crear/ascender a 'super'
  if (nuevoRol === 'super') return false;
  if (!NIVEL[nuevoRol]) return false;            // rol inexistente
  return nivelDe(actorRol) > nivelDe(nuevoRol);
}

const JWT_EXPIRA = '7d';

function firmarToken(user) {
  const payload = {
    id: user.id,
    usuario: user.usuario,
    nombre: user.nombre,
    apellidos: user.apellidos,
    rol: user.rol
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRA });
}

function verificarToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return null;
  }
}

/**
 * Middleware: exige un token válido. Deja el usuario en req.user.
 * El token viaja en la cabecera Authorization: Bearer <token>.
 */
function requireToken(req, res, next) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const user = token ? verificarToken(token) : null;
  if (!user) return res.status(401).json({ ok: false, error: 'No autenticado' });
  req.user = user;
  next();
}

/** Middleware: exige que el usuario sea al menos de cierto nivel (ej. 'admin'). */
function requireNivel(rolMinimo) {
  return (req, res, next) => {
    if (!req.user || nivelDe(req.user.rol) < nivelDe(rolMinimo)) {
      return res.status(403).json({ ok: false, error: 'Permisos insuficientes' });
    }
    next();
  };
}

module.exports = {
  NIVEL, nivelDe, puedeGestionar, puedeAsignarRol,
  firmarToken, verificarToken, requireToken, requireNivel
};
