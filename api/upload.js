import crypto from 'crypto';
import { verifyToken } from './auth.js';

export const config = { api: { bodyParser: false } };

const SB_URL = process.env.SUPABASE_URL || 'https://spqivuqidqgtcivrddtm.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = verifyToken(req.headers['x-artrisa-token'] || '');
  if (!user) return res.status(401).json({ error: 'Login diperlukan untuk mengunggah foto.' });

  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) return res.status(415).json({ error: 'Jenis file harus JPG, PNG, atau WEBP.' });

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) return res.status(413).json({ error: 'File terlalu besar (maks 2 MB).' });
    chunks.push(chunk);
  }
  if (!size) return res.status(400).json({ error: 'File kosong.' });

  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/feed/${name}`, {
      method: 'POST',
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        'Content-Type': type,
        'Cache-Control': '31536000'
      },
      body: Buffer.concat(chunks)
    });
    if (!r.ok) return res.status(502).json({ error: 'Gagal menyimpan file ke penyimpanan.' });
    return res.status(200).json({ url: `/api/supabase/storage/v1/object/public/feed/${name}` });
  } catch (e) {
    return res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
}
