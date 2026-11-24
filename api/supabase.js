import { verifyToken } from './auth.js';

const SB_URL = process.env.SUPABASE_URL || 'https://spqivuqidggtcivrddtm.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Tabel yang hanya boleh diakses oleh user yang sudah login (dashboard)
const PRIVATE_TABLES = new Set([
  'users',
  'sales',
  'finance',
  'customers',
  'supplier_prices',
  'hutang',
  'piutang'
]);

// Tabel yang boleh di-INSERT oleh publik (pengunjung website)
const PUBLIC_INSERT_TABLES = new Set([
  'orders',
  'affiliates',
  'interactions'
]);

// Tabel yang boleh di-SELECT oleh publik (dengan penyaringan kolom sensitif)
const PUBLIC_READ_TABLES = new Set([
  'products',
  'reels',
  'interactions'
]);

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const rawPath = String(req.query.path || '').replace(/^\/+/, '');
  const table = rawPath.split('/')[0].split('?')[0];

  if (!table) {
    return res.status(400).json({ error: 'Invalid endpoint path' });
  }

  // Cek token sesi admin/owner jika ada
  const sessionHeader = req.headers['x-artrisa-token'] || '';
  const sessionUser = verifyToken(sessionHeader);

  // Validasi hak akses berdasarkan method & tabel
  if (!sessionUser) {
    if (PRIVATE_TABLES.has(table)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.method === 'GET' && !PUBLIC_READ_TABLES.has(table)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.method === 'POST' && !PUBLIC_INSERT_TABLES.has(table)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (['PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  } else {
    // Hanya direktur yang boleh mengelola tabel users
    if (table === 'users' && sessionUser.role !== 'direktur') {
      return res.status(403).json({ error: 'Hanya Direktur yang dapat mengakses manajemen akun.' });
    }
  }

  const qs = new URLSearchParams(req.query);
  qs.delete('path');

  // Sanitasi query publik agar PII (whatsapp, modal_price, password_hash) tidak pernah bocor
  if (!sessionUser && req.method === 'GET') {
    if (table === 'interactions') {
      qs.set('select', 'id,target_type,target_id,kind,customer_name,comment_text,created_at');
    } else if (table === 'products') {
      qs.set('select', 'id,name,category,description,unit,image_url,sort_order,show_in_front,active');
    }
  }

  const targetUrl = `${SB_URL}/rest/v1/${rawPath}${qs.toString() ? '?' + qs.toString() : ''}`;

  const headers = {
    apikey: SB_SERVICE_KEY || req.headers['apikey'] || '',
    Authorization: SB_SERVICE_KEY ? `Bearer ${SB_SERVICE_KEY}` : (req.headers['authorization'] || '')
  };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  if (req.headers['prefer']) headers['prefer'] = req.headers['prefer'];

  try {
    const fetchOpts = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method) && req.body !== undefined) {
      fetchOpts.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const r = await fetch(targetUrl, fetchOpts);
    const text = await r.text();

    // Filter ekstra jika response JSON berupa array untuk publik
    if (!sessionUser && req.method === 'GET' && r.ok) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.map(row => {
            const copy = { ...row };
            delete copy.whatsapp;
            delete copy.phone;
            delete copy.password_hash;
            delete copy.modal_price;
            if (table === 'products') copy.price = null;
            return copy;
          });
          return res.status(r.status).json(cleaned);
        }
      } catch {
        // lanjut kirim raw text jika bukan JSON array
      }
    }

    const ct = r.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
