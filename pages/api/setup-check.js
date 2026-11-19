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
    const gtmId = (html.match(/GTM-[A-Z0-9]{4,10}/) || [])[0];

    if (hasGtag) {
      checks.push({ name: 'GA4 설치', status: 'ok', detail: `GA4 태그 확인됨${ga4Id ? ` (측정 ID: ${ga4Id})` : ''}` });
    } else if (gtmId) {
      // GTM 컨테이너 파일을 직접 열어 그 안에 GA4 태그가 있는지 검사
      let gtmGa4Ids = [];
      try {
        const { data: gtmJs } = await axios.get(`https://www.googletagmanager.com/gtm.js?id=${gtmId}`, { timeout: 15000 });
        gtmGa4Ids = [...new Set(String(gtmJs).match(/G-[A-Z0-9]{6,12}/g) || [])];
      } catch {}
      if (gtmGa4Ids.length) {
        checks.push({ name: 'GA4 설치', status: 'ok', detail: `GTM(${gtmId}) 컨테이너 안에서 GA4 태그 확인됨 (측정 ID: ${gtmGa4Ids.join(', ')}) — GTM 경유로 정상 설치` });
      } else {
        // 컨테이너에서 ID가 안 보이면, GA4 속성에 어제 데이터가 실제로 쌓였는지로 최종 판정
        let ySessions = null;
        if (cfg.missing.length === 0) {
          try {
            const { data: rt } = await axios.post(
              `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.ga4PropertyId}:runReport`,
              { dateRanges: [{ startDate: kstDate(1), endDate: kstDate(1) }], metrics: [{ name: 'sessions' }] },
              { headers: { Authorization: `Bearer ${ga4Token}` }, timeout: 30000 }
            );
            ySessions = parseInt(rt.rows?.[0]?.metricValues?.[0]?.value || 0);
          } catch {}
        }
        checks.push({
          name: 'GA4 설치', status: ySessions > 0 ? 'ok' : 'warn',
          detail: ySessions > 0
            ? `GTM(${gtmId}) 경유 설치 — 측정 ID는 런타임에만 노출되지만, GA4 속성에 어제 세션 ${ySessions.toLocaleString('ko-KR')}건이 정상 수집됨 → 작동 정상`
            : `GTM(${gtmId})은 있지만 GA4 수집 데이터를 확인하지 못했어요 — GTM 작업공간에서 GA4 구성 태그가 게시됐는지 확인 필요`,
        });
      }
    } else {
      checks.push({ name: 'GA4 설치', status: 'fail', detail: 'GA4/GTM 스크립트를 찾지 못했어요 — 설치 확인 필요' });
    }
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
