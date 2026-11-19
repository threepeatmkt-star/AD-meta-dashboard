/**
 * pages/api/token-info.js — 메타 토큰이 어떤 방식으로 발급됐는지 진단
 * GET /api/token-info
 */
import axios from 'axios';
import { resolveBrand } from '../../lib/brandEnv';

export default async function handler(req, res) {
  const cfg = resolveBrand('samdae500');
  if (cfg.missing.length) return res.status(500).json({ error: `환경변수 미설정: ${cfg.missing.join(', ')}` });
  try {
    const me = await axios.get('https://graph.facebook.com/v20.0/me', {
      params: { fields: 'id,name', access_token: cfg.metaToken }, timeout: 15000,
    }).then(r => r.data).catch(e => ({ error: e?.response?.data?.error?.message || e.message }));

    const perms = await axios.get('https://graph.facebook.com/v20.0/me/permissions', {
      params: { access_token: cfg.metaToken }, timeout: 15000,
    }).then(r => (r.data.data || []).filter(p => p.status === 'granted').map(p => p.permission))
      .catch(() => null);

    res.json({ 토큰_주인: me, 부여된_권한: perms });
  } catch (err) {
    res.status(500).json({ error: err?.response?.data?.error?.message || err.message });
  }
}
