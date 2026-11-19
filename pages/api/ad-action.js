/**
 * pages/api/ad-action.js — 광고 진단 결정 버튼의 실제 메타 반영
 * POST { brand, action: 'pause_ad'|'budget_down'|'budget_up', adId, adsetId }
 * - pause_ad: 해당 광고(소재)를 일시중지
 * - budget_down/up: 해당 광고세트 일예산 30% 축소/증액
 */
import axios from 'axios';
import { resolveBrand } from '../../lib/brandEnv';

const META = 'https://graph.facebook.com/v20.0';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { brand = 'samdae500', action, adId, adsetId } = req.body || {};
  const cfg = resolveBrand(brand);
  if (cfg.missing.length) return res.status(500).json({ error: `환경변수 미설정: ${cfg.missing.join(', ')}` });

  try {
    if (action === 'pause_ad') {
      if (!adId) return res.status(400).json({ error: 'adId 필요' });
      await axios.post(`${META}/${adId}`, null, { params: { status: 'PAUSED', access_token: cfg.metaToken }, timeout: 20000 });
      return res.json({ ok: true, message: '광고를 OFF(일시중지)했어요 — 잠시 후 목록에서 사라져요' });
    }
    if (action === 'budget_down' || action === 'budget_up') {
      if (!adsetId) return res.status(400).json({ error: 'adsetId 필요' });
      const { data: aset } = await axios.get(`${META}/${adsetId}`, { params: { fields: 'daily_budget,name', access_token: cfg.metaToken }, timeout: 20000 });
      const cur = parseInt(aset.daily_budget) || 0;
      if (!cur) return res.status(400).json({ error: '이 광고세트는 일예산이 없어요(캠페인 예산·CBO 방식) — 광고관리자에서 캠페인 예산을 조정해주세요' });
      const next = Math.max(1000, Math.round(cur * (action === 'budget_down' ? 0.7 : 1.3) / 100) * 100);
      await axios.post(`${META}/${adsetId}`, null, { params: { daily_budget: next, access_token: cfg.metaToken }, timeout: 20000 });
      return res.json({ ok: true, message: `광고세트 '${aset.name}' 일예산 ₩${cur.toLocaleString('ko-KR')} → ₩${next.toLocaleString('ko-KR')} 변경 완료` });
    }
    return res.status(400).json({ error: '알 수 없는 action' });
  } catch (err) {
    const msg = err?.response?.data?.error?.message || err.message;
    const perm = /permission|ads_management|#200|#10\b|OAuth/i.test(msg);
    return res.status(500).json({
      error: perm
        ? '메타 토큰에 수정 권한(ads_management)이 없어요 — 이번엔 광고관리자에서 직접 처리하고, 토큰 권한을 올리면 버튼으로 바로 반영돼요'
        : msg,
    });
  }
}
