import crypto from 'crypto';

const SB_URL = process.env.SUPABASE_URL || 'https://spqivuqidqgtcivrddtm.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const AUTH_SECRET = process.env.AUTH_SECRET || '';

function signToken(payload) {
  if (!AUTH_SECRET) throw new Error('AUTH_SECRET belum diatur di Vercel');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!AUTH_SECRET) return null;
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  const a1 = Buffer.from(sig), a2 = Buffer.from(expected);
  if (a1.length !== a2.length || !crypto.timingSafeEqual(a1, a2)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!AUTH_SECRET) return res.status(500).json({ error: 'Server belum dikonfigurasi (AUTH_SECRET).' });

  const { username, password } = req.body || {};
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }

  const cleanUser = username.trim();
  if (cleanUser.length > 64 || password.length > 128) {
    return res.status(400).json({ error: 'Input tidak valid.' });
  }

  try {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const url = `${SB_URL}/rest/v1/users?select=id,name,username,role,permissions,active&username=eq.${encodeURIComponent(cleanUser)}&password_hash=eq.${hash}&active=eq.true&limit=1`;

    const r = await fetch(url, {
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        Accept: 'application/json'
      }
    });

    if (!r.ok) {
      return res.status(502).json({ error: 'Gagal memverifikasi ke database.' });
    }

    const rows = await r.json();
    const user = Array.isArray(rows) ? rows[0] : null;
    if (!user) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    // Update last_login secara non-blocking
    fetch(`${SB_URL}/rest/v1/users?id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ last_login: new Date().toISOString() })
    }).catch(() => {});

    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions || '',
      exp: Date.now() + 12 * 60 * 60 * 1000 // 12 jam
    });

    return res.status(200).json({ user, token });
  } catch (e) {
    return res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
}
