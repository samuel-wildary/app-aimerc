import crypto from 'node:crypto';

const TOKEN_TTL_SECONDS = 12 * 60 * 60;
const TOKEN_SECRET = process.env.AIMERC_TOKEN_SECRET || 'aimerc-local-change-this-secret';

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(value).digest('base64url');
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const actual = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expectedHash, 'hex'));
}

export function createToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = encode(JSON.stringify({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    storeId: user.store_id || null,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  }));
  return `${payload}.${sign(payload)}`;
}

export function readToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function requireAuth(...roles) {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const user = readToken(token);
    if (!user) return res.status(401).json({ error: 'Sessao invalida ou expirada' });
    if (roles.length > 0 && !roles.includes(user.role)) return res.status(403).json({ error: 'Acesso nao autorizado' });
    req.user = user;
    next();
  };
}
