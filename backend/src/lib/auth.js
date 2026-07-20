import crypto from 'node:crypto';

const TOKEN_TTL_SECONDS = 12 * 60 * 60;
const configuredSecret = String(process.env.AIMERC_TOKEN_SECRET || '');
if (process.env.NODE_ENV === 'production' && configuredSecret.length < 32) {
  throw new Error('AIMERC_TOKEN_SECRET deve ter pelo menos 32 caracteres em producao');
}
const TOKEN_SECRET = configuredSecret || 'aimerc-development-only-token-secret';
const PREVIOUS_TOKEN_SECRET = String(process.env.AIMERC_TOKEN_SECRET_PREVIOUS || '');

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value, secret = TOKEN_SECRET) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64, { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt, hash: `scrypt$32768$8$1$${derived.toString('hex')}` };
}

export function verifyPassword(password, salt, expectedHash) {
  try {
    if (String(expectedHash).startsWith('scrypt$')) {
      const [, n, r, p, encoded] = expectedHash.split('$');
      const actual = crypto.scryptSync(password, salt, 64, {
        N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024
      });
      return crypto.timingSafeEqual(actual, Buffer.from(encoded, 'hex'));
    }
    // Compatibilidade temporaria: senhas antigas sao atualizadas no primeiro login valido.
    const legacy = crypto.pbkdf2Sync(password, salt, 120_000, 32, 'sha256');
    return crypto.timingSafeEqual(legacy, Buffer.from(expectedHash, 'hex'));
  } catch {
    return false;
  }
}

export function passwordNeedsUpgrade(passwordHash) {
  return !String(passwordHash || '').startsWith('scrypt$');
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
  const signatures = [sign(payload)];
  if (PREVIOUS_TOKEN_SECRET) signatures.push(sign(payload, PREVIOUS_TOKEN_SECRET));
  const validSignature = signatures.some(expected => (
    signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ));
  if (!validSignature) return null;

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
