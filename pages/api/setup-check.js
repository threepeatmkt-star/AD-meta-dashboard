/**
 * pages/api/setup-check.js — 환경 진단
 * GET /api/setup-check
 *
 * 두 브랜드 자사몰의 추적 환경을 실시간으로 점검합니다.
 * ① 자사몰 HTML에 메타 픽셀 설치 여부
 * ② 자사몰 HTML에 GA4(gtag)/GTM 설치 여부
 * ③ 최근 7일 메타 픽셀 매출 vs GA4(SNS) 매출 괴리율 — 과집계 정도
 */
import axios from 'axios';
import { resolveBrand, SNS_REGEX } from '../../lib/brandEnv';
import { BRAND_LIST } from '../../lib/brands';

const META_BASE = 'https://graph.facebook.com/v20.0';

async function getGA4AccessToken() {
  const { GA4_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN } = process.env;
  const { data } = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: GA4_CLIENT_ID, client_secret: GA4_CLIENT_SECRET,
    refresh_token: GA4_REFRESH_TOKEN, grant_type: 'refresh_token',
  });
  return data.access_token;
}

function kstDate(offsetDays) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  now.setDate(now.getDate() - offsetDays);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function fetchSiteHtml(site) {
  try {
    const { data } = await axios.get(`https://${site}`, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36' },
      maxRedirects: 5,
    });
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch { return null; }
}

async function brandCheck(b, ga4Token) {
  const cfg = resolveBrand(b.id);
  const checks = [];
  let stats = null;

  // ① ② 자사몰 스크립트 점검
  const html = await fetchSiteHtml(b.site);
  if (html === null) {
    checks.push({ name: '자사몰 접속', status: 'unknown', detail: `${b.site} 응답을 받지 못했어요 (봇 차단일 수 있음) — 픽셀·GA4 설치는 브라우저에서 직접 확인 필요` });
  } else {
    const hasPixel = /connect\.facebook\.net|fbq\s*\(/.test(html);
    const pixelId = (html.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/) || [])[1];
    checks.push({
      name: '메타 픽셀 설치', status: hasPixel ? 'ok' : 'fail',
      detail: hasPixel
        ? `자사몰 첫 페이지에서 픽셀 스크립트 확인됨${pixelId ? ` (픽셀 ID: ${pixelId})` : ''}`
        : '첫 페이지 HTML에서 픽셀 스크립트를 찾지 못했어요 — GTM 등 간접 설치인지 확인 필요',
    });

    const hasGtag = /googletagmanager\.com\/gtag\/js\?id=G-|gtag\s*\(\s*['"]config['"]\s*,\s*['"]G-/.test(html);
    const ga4Id = (html.match(/G-[A-Z0-9]{6,12}/) || [])[0];
    const hasGtm = /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,10}/.test(html);
    checks.push({
      name: 'GA4 설치', status: hasGtag ? 'ok' : hasGtm ? 'warn' : 'fail',
      detail: hasGtag
        ? `GA4 태그 확인됨${ga4Id ? ` (측정 ID: ${ga4Id})` : ''}`
        : hasGtm
          ? 'GA4 직접 태그는 안 보이지만 GTM(태그매니저)이 있어요 — GTM 안에 GA4가 들어있는지 확인 필요'
          : 'GA4/GTM 스크립트를 찾지 못했어요 — 설치 확인 필요',
    });
  }

  // ③ 픽셀 vs GA4 괴리 (최근 7일)
  if (cfg.missing.length === 0) {
    try {
      const since = kstDate(7), until = kstDate(1);
      const [metaRes, ga4Res] = await Promise.all([
        axios.get(`${META_BASE}/act_${cfg.adAccountId}/insights`, {
          params: {
            fields: 'spend,action_values',
            time_range: JSON.stringify({ since, until }),
            access_token: cfg.metaToken,
          }, timeout: 30000,
        }),
        axios.post(`https://analyticsdata.googleapis.com/v1beta/properties/${cfg.ga4PropertyId}:runReport`, {
          dateRanges: [{ startDate: since, endDate: until }],
          dimensions: [{ name: 'sessionSourceMedium' }],
          metrics: [{ name: 'purchaseRevenue' }],
          dimensionFilter: { filter: { fieldName: 'sessionSourceMedium', stringFilter: { matchType: 'FULL_REGEXP', value: SNS_REGEX } } },
        }, { headers: { Authorization: `Bearer ${ga4Token}` }, timeout: 30000 }),
      ]);

      const row = metaRes.data?.data?.[0] || {};
      const purchase = (row.action_values || []).find(a => a.action_type === 'omni_purchase' || a.action_type === 'purchase');
      const pixelRev = purchase ? parseFloat(purchase.value) || 0 : 0;
      const spend = parseFloat(row.spend) || 0;
      const ga4Sns = (ga4Res.data.rows || []).reduce((s, r) => s + (parseFloat(r.metricValues[0].value) || 0), 0);
      const ratio = ga4Sns > 0 ? Math.round((pixelRev / ga4Sns) * 100) / 100 : null;

      stats = { since, until, spend, pixelRev: Math.round(pixelRev), ga4Sns: Math.round(ga4Sns), ratio };

      checks.push({
        name: '픽셀 vs GA4 매출 괴리 (최근 7일)',
        status: ratio === null ? 'unknown' : ratio <= 1.5 ? 'ok' : ratio <= 2.5 ? 'warn' : 'fail',
        detail: ratio === null
          ? 'GA4 SNS 매출이 0이라 비교할 수 없어요'
          : `픽셀 ₩${Math.round(pixelRev).toLocaleString('ko-KR')} vs GA4(SNS) ₩${Math.round(ga4Sns).toLocaleString('ko-KR')} — 픽셀이 ${ratio}배${ratio <= 1.5 ? ' (정상 범위: 어트리뷰션 차이 수준)' : ratio <= 2.5 ? ' (과집계 주의: 메타 성과를 그대로 믿으면 안 돼요)' : ' (과집계 심각: 반드시 GA4 기준으로 판단하세요)'}`,
      });
    } catch (e) {
      checks.push({ name: '픽셀 vs GA4 매출 괴리 (최근 7일)', status: 'unknown', detail: `조회 실패: ${e?.response?.data?.error?.message || e.message}` });
    }
  } else {
    checks.push({ name: 'API 연결', status: 'fail', detail: `환경변수 미설정: ${cfg.missing.join(', ')}` });
  }

  return { id: b.id, name: b.name, site: b.site, color: b.color, checks, stats };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const ga4Token = await getGA4AccessToken();
    const brands = await Promise.all(BRAND_LIST.map(b => brandCheck(b, ga4Token)));
    res.json({ generatedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), brands });
  } catch (err) {
    res.status(500).json({ error: err?.response?.data?.error?.message || err.message });
  }
}
