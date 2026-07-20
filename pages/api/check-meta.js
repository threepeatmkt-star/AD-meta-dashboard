/**
 * pages/api/check-meta.js — 연동 진단
 * GET /api/check-meta
 *
 * 토큰 값을 직접 보지 않고도
 * "이 토큰으로 어떤 광고계정을 조회할 수 있는지" 확인합니다.
 * 브라우저에서 https://<도메인>/api/check-meta 로 접속하세요.
 */
import axios from 'axios';
import { resolveBrand } from '../../lib/brandEnv';
import { BRANDS } from '../../lib/brands';

const META_BASE = 'https://graph.facebook.com/v20.0';

export default async function handler(req, res) {
  const result = { checkedAt: new Date().toISOString(), brands: {}, metaAccounts: null, ga4: {} };

  // 1) 브랜드별 환경변수 상태
  for (const id of Object.keys(BRANDS)) {
    const cfg = resolveBrand(id);
    result.brands[id] = {
      name: BRANDS[id].name,
      adAccountId: cfg.adAccountId || '(미설정)',
      ga4PropertyId: cfg.ga4PropertyId || '(미설정)',
      metaTokenSet: !!cfg.metaToken,
      missing: cfg.missing,
    };
  }

  // 2) 토큰으로 조회 가능한 Meta 광고계정 목록
  const token = process.env.META_ACCESS_TOKEN;
  if (token) {
    try {
      const { data } = await axios.get(`${META_BASE}/me/adaccounts`, {
        params: { fields: 'name,account_id,account_status', limit: 200, access_token: token },
        timeout: 20000,
      });
      result.metaAccounts = (data.data || []).map(a => ({
        account_id: a.account_id, name: a.name, status: a.account_status,
      }));
    } catch (e) {
      result.metaAccounts = { error: e?.response?.data?.error?.message || e.message };
    }
  }

  // 3) 브랜드별 광고계정 실제 접근 가능 여부 (직접 호출 테스트)
  for (const id of Object.keys(BRANDS)) {
    const cfg = resolveBrand(id);
    if (!cfg.adAccountId || !cfg.metaToken) { result.brands[id].metaAccessible = '확인불가(환경변수 미설정)'; continue; }
    try {
      const { data } = await axios.get(`${META_BASE}/act_${cfg.adAccountId}`, {
        params: { fields: 'name,account_status', access_token: cfg.metaToken },
        timeout: 20000,
      });
      result.brands[id].metaAccessible = `✅ OK — ${data.name}`;
    } catch (e) {
      result.brands[id].metaAccessible = `❌ ${e?.response?.data?.error?.message || e.message}`;
    }
  }

  // 4) GA4 토큰 + 브랜드별 속성 접근 확인
  try {
    const { data: tok } = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GA4_CLIENT_ID,
      client_secret: process.env.GA4_CLIENT_SECRET,
      refresh_token: process.env.GA4_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    });
    result.ga4.tokenRefresh = '✅ OK';
    for (const id of Object.keys(BRANDS)) {
      const cfg = resolveBrand(id);
      if (!cfg.ga4PropertyId) { result.ga4[id] = '확인불가(속성 ID 미설정)'; continue; }
      try {
        await axios.post(
          `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.ga4PropertyId}:runReport`,
          { dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }], metrics: [{ name: 'sessions' }] },
          { headers: { Authorization: `Bearer ${tok.access_token}` }, timeout: 20000 }
        );
        result.ga4[id] = '✅ OK';
      } catch (e) {
        result.ga4[id] = `❌ ${e?.response?.data?.error?.message || e.message}`;
      }
    }
  } catch (e) {
    result.ga4.tokenRefresh = `❌ ${e?.response?.data?.error_description || e.message}`;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(JSON.stringify(result, null, 2));
}
