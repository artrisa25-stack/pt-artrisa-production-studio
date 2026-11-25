// Pencatatan "dilihat" (popup produk dibuka) dan "klik WhatsApp".
// Dipanggil dari browser pengunjung. Penulisan memakai service role di sisi server.

const SB_URL = process.env.SUPABASE_URL || 'https://spqivuqidqgtcivrddtm.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Batas sederhana per IP: 60 permintaan per menit
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 60;
const hits = new Map();

function rateOk(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    hits.set(ip, list);
    return false;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return true;
}

const clean = (v, max) => String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, max);

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SB_SERVICE_KEY) return res.status(500).json({ error: 'Server belum dikonfigurasi' });

  const ip = (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())
    || (req.socket && req.socket.remoteAddress) || 'unknown';
  if (!rateOk(ip)) return res.status(429).json({ error: 'Terlalu banyak permintaan' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const type = body.type === 'view' || body.type === 'wa' ? body.type : null;
  if (!type) return res.status(400).json({ error: 'type tidak valid' });

  const pidRaw = String(body.pid ?? '');
  const pid = /^[A-Za-z0-9_-]{1,40}$/.test(pidRaw) ? pidRaw : null;
  const source = clean(body.source, 40);
  const campaign = clean(body.campaign, 60);

  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/track_event`, {
      method: 'POST',
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_type: type, p_pid: pid, p_source: source, p_campaign: campaign })
    });
    if (!r.ok) return res.status(502).json({ error: 'Gagal mencatat' });
    return res.status(204).end();
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
