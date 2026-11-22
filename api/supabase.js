// Vercel Serverless Proxy ke Supabase
export default async function handler(req, res) {
  const SB_URL = 'https://spqivuqidggtcivrddtm.supabase.co';
  const path = req.query.path || '';
  const qs = new URLSearchParams(req.query);
  qs.delete('path');
  const url = SB_URL + '/rest/v1/' + path + (qs.toString() ? '?' + qs.toString() : '');
  const headers = {};
  if (req.headers['apikey']) headers['apikey'] = req.headers['apikey'];
  if (req.headers['authorization']) headers['authorization'] = req.headers['authorization'];
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  if (req.headers['prefer']) headers['prefer'] = req.headers['prefer'];
  try {
    const r = await fetch(url, { method: req.method, headers, body: ['GET','HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}) });
    const text = await r.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type, prefer');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.status(r.status).send(text);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
