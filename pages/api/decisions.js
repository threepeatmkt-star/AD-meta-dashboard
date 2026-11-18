/**
 * pages/api/decisions.js — 결정보드 데이터
 * GET /api/decisions?brand=samdae500|mxssive&startDate=&endDate=
 *
 * 기간을 전반/후반으로 나눠 소재별로 점검하고,
 * 부장님 보고서 분류(늘리기 / 손보기 / 끄기 검토 / 유지)에 맞춰 자동 분류합니다.
 * - 매출: GA4 (수동 UTM 이름 매칭 + 메타 자동 UTM의 광고 ID 매칭)
 * - 참고: 메타 픽셀 ROAS, 빈도(피로도)
 */
import axios from 'axios';
import { resolveBrand } from '../../lib/brandEnv';
import { BRANDS } from '../../lib/brands';

const META_BASE = 'https://graph.facebook.com/v20.0';
const MIN_SPEND = 30000; // 이 금액 미만 소재는 "판단 보류(데이터 부족)"로 분류

async function getGA4AccessToken() {
  const { GA4_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN } = process.env;
  const { data } = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: GA4_CLIENT_ID, client_secret: GA4_CLIENT_SECRET,
    refresh_token: GA4_REFRESH_TOKEN, grant_type: 'refresh_token',
  });
  return data.access_token;
}

async function fetchMetaPages(url, params) {
  const all = [];
  let res = await axios.get(url, { params, timeout: 30000 });
  all.push(...(res.data.data || []));
  while (res.data.paging?.next) {
    res = await axios.get(res.data.paging.next, { timeout: 30000 });
    all.push(...(res.data.data || []));
  }
  return all;
}

// 메타 소재별 성과 (픽셀 구매가치·빈도 포함)
async function getMetaAds(cfg, startDate, endDate) {
  const rows = await fetchMetaPages(`${META_BASE}/act_${cfg.adAccountId}/insights`, {
    level: 'ad',
    fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,frequency,impressions,inline_link_clicks,action_values',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: 200, access_token: cfg.metaToken,
  });
  return rows.map(r => {
    const purchase = (r.action_values || []).find(a => a.action_type === 'omni_purchase' || a.action_type === 'purchase');
    return {
      campaignName: r.campaign_name, adsetName: r.adset_name,
      adId: r.ad_id, adName: r.ad_name,
      spend: parseFloat(r.spend) || 0,
      frequency: parseFloat(r.frequency) || 0,
      impressions: parseInt(r.impressions) || 0,
      clicks: parseInt(r.inline_link_clicks) || 0,
      pixelRevenue: purchase ? parseFloat(purchase.value) || 0 : 0,
    };
  });
}

// 소재별 랜딩 URL·URL 매개변수 — UTM 설정 점검용
async function getAdTags(cfg) {
  try {
    const rows = await fetchMetaPages(`${META_BASE}/act_${cfg.adAccountId}/ads`, {
      fields: 'id,creative{url_tags,object_story_spec{link_data{link},video_data{call_to_action}},asset_feed_spec{link_urls}}',
      filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
      limit: 200, access_token: cfg.metaToken,
    });
    return Object.fromEntries(rows.map(r => {
      const c = r.creative || {};
      const oss = c.object_story_spec || {};
      const parts = [
        c.url_tags || '',
        oss.link_data?.link || '',
        oss.video_data?.call_to_action?.value?.link || '',
        ...((c.asset_feed_spec?.link_urls || []).map(l => l.website_url || '')),
      ];
      return [r.id, parts.join(' ')];
    }));
  } catch { return {}; }
}

// GA4 매출 (캠페인+콘텐츠 차원) — 대시보드와 같은 매칭 규칙
async function getGA4Rows(cfg, startDate, endDate, ga4Token) {
  const { data } = await axios.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.ga4PropertyId}:runReport`,
    {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionManualAdContent' }],
      metrics: [{ name: 'purchaseRevenue' }],
      limit: 5000,
    },
    { headers: { Authorization: `Bearer ${ga4Token}` }, timeout: 30000 }
  );
  return (data.rows || [])
    .filter(r => r.dimensionValues[0].value !== '(not set)' || r.dimensionValues[1].value !== '(not set)')
    .map(r => ({
      campaign: r.dimensionValues[0].value,
      ad: r.dimensionValues[1].value,
      revenue: parseFloat(r.metricValues[0].value) || 0,
    }));
}

function matchRevenue(ga4Rows, ad) {
  const byName = ga4Rows.filter(g => g.campaign === ad.campaignName && g.ad === ad.adName).reduce((s, g) => s + g.revenue, 0);
  const fallback = byName === 0 ? ga4Rows.filter(g => g.ad === ad.adName && g.ad !== '(not set)').reduce((s, g) => s + g.revenue, 0) : 0;
  const byId = ga4Rows.filter(g => g.ad === ad.adId).reduce((s, g) => s + g.revenue, 0); // 메타 자동 UTM(ig/paid)
  return (byName || fallback) + byId;
}

const roas = (rev, spend) => (spend > 0 ? Math.round((rev / spend) * 1000) / 10 : 0);

function splitRange(startDate, endDate) {
  const s = new Date(startDate), e = new Date(endDate);
  const days = Math.round((e - s) / 86400000) + 1;
  const firstLen = Math.ceil(days / 2);
  const firstEnd = new Date(s.getTime() + (firstLen - 1) * 86400000);
  const secondStart = new Date(firstEnd.getTime() + 86400000);
  const fmt = d => d.toISOString().slice(0, 10);
  return days >= 2
    ? { a: [startDate, fmt(firstEnd)], b: [fmt(secondStart), endDate], split: true }
    : { a: [startDate, endDate], b: [startDate, endDate], split: false };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { startDate, endDate, brand = 'samdae500' } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: '날짜를 선택해주세요.' });

  const cfg = resolveBrand(brand);
  if (cfg.missing.length > 0)
    return res.status(500).json({ error: `환경변수 미설정: ${cfg.missing.join(', ')}` });

  const breakeven = BRANDS[cfg.brandId]?.breakeven || 300;

  try {
    const ga4Token = await getGA4AccessToken();
    const half = splitRange(startDate, endDate);

    const [adsFull, adsA, adsB, ga4Full, ga4A, ga4B, adTags] = await Promise.all([
      getMetaAds(cfg, startDate, endDate),
      half.split ? getMetaAds(cfg, half.a[0], half.a[1]) : Promise.resolve([]),
      half.split ? getMetaAds(cfg, half.b[0], half.b[1]) : Promise.resolve([]),
      getGA4Rows(cfg, startDate, endDate, ga4Token),
      half.split ? getGA4Rows(cfg, half.a[0], half.a[1], ga4Token) : Promise.resolve([]),
      half.split ? getGA4Rows(cfg, half.b[0], half.b[1], ga4Token) : Promise.resolve([]),
      getAdTags(cfg),
    ]);

    const mapById = rows => Object.fromEntries(rows.map(r => [r.adId, r]));
    const aById = mapById(adsA), bById = mapById(adsB);

    const items = adsFull.map(ad => {
      const revenue = matchRevenue(ga4Full, ad);
      const r = roas(revenue, ad.spend);
      const pixelRoas = roas(ad.pixelRevenue, ad.spend);

      const adA = aById[ad.adId], adB = bById[ad.adId];
      const revA = adA ? matchRevenue(ga4A, { ...ad, ...adA }) : 0;
      const revB = adB ? matchRevenue(ga4B, { ...ad, ...adB }) : 0;
      const roasA = adA ? roas(revA, adA.spend) : null;
      const roasB = adB ? roas(revB, adB.spend) : null;

      // ── 설정 오류 점검 ──
      const tagStr = adTags[ad.adId] ?? '';
      const errors = [];
      if (tagStr && !/utm_/i.test(tagStr)) {
        errors.push({ k: 'noUtm', label: 'UTM 없음', detail: '랜딩 URL과 URL 매개변수 어디에도 UTM이 없어요 — 이 소재의 매출은 메타 자동 태그(ig/paid)나 바이럴로 흘러갑니다. 표준 UTM 템플릿을 넣어주세요 (기존 광고 URL 수정은 머신러닝 초기화 주의 → 신규 소재부터 적용 추천)' });
      } else if (tagStr && /utm_/i.test(tagStr) && !/utm_medium=cpm/i.test(tagStr)) {
        errors.push({ k: 'utmNonStd', label: 'UTM 비표준', detail: 'UTM은 있는데 utm_medium이 cpm이 아니에요 — DA 매출 집계 기준(cpm)과 어긋나 분류가 흔들릴 수 있어요' });
      }
      if (ad.spend >= MIN_SPEND && revenue === 0 && ad.pixelRevenue > 0) {
        errors.push({ k: 'ga4Zero', label: 'GA4 매출 0', detail: `픽셀 매출은 ₩${Math.round(ad.pixelRevenue).toLocaleString('ko-KR')}인데 GA4에선 0원 — UTM 또는 GA4 추적 연결을 확인해주세요` });
      }

      // ── 분류 ──
      const flags = [];
      if (ad.frequency >= 3.5) flags.push({ k: 'fatigue', label: '피로 주의', detail: `빈도 ${ad.frequency.toFixed(1)} — 같은 사람에게 반복 노출 중, 새 소재 준비 추천` });
      if (ad.spend >= 50000 && pixelRoas > 0 && r > 0 && pixelRoas >= r * 2)
        flags.push({ k: 'pixelGap', label: '픽셀 과대집계 의심', detail: `픽셀 ${pixelRoas}% vs GA4 ${r}% — 메타가 실제보다 크게 잡고 있을 수 있음` });

      let category, reason, options;
      const dropping = roasA != null && roasB != null && roasA > 0 && roasB < roasA * 0.6;

      if (ad.spend < MIN_SPEND) {
        category = 'hold';
        reason = `광고비 ${Math.round(ad.spend / 10000)}만원 — 판단하기엔 데이터가 적어요`;
        options = ['더 지켜보기', '끄기'];
      } else if (r < breakeven * 0.6) {
        category = 'off';
        reason = `ROAS ${r}%로 손익분기(${breakeven}%)의 60% 미만 — 쓸수록 손해`;
        options = ['끄기', '예산 축소', '보류'];
      } else if (r >= breakeven * 2 && (roasB == null || roasB >= breakeven)) {
        category = 'scale';
        reason = `ROAS ${r}%로 손익분기의 2배 이상${roasB != null ? ` · 후반에도 ${roasB}% 유지` : ''} — 예산 증액 후보`;
        options = ['예산 증액', '유지', '보류'];
      } else if (r < breakeven * 1.2 || dropping) {
        category = 'fix';
        reason = dropping
          ? `ROAS가 전반 ${roasA}% → 후반 ${roasB}%로 빠르게 하락 중`
          : `ROAS ${r}% — 손익분기(${breakeven}%) 근처라 여유가 없어요`;
        options = ['새 소재로 교체 준비', '예산 축소', '유지', '보류'];
      } else {
        category = 'keep';
        reason = `ROAS ${r}% — 손익분기 위에서 안정적`;
        options = ['유지', '예산 증액', '보류'];
      }

      return {
        adId: ad.adId, adName: ad.adName, campaignName: ad.campaignName, adsetName: ad.adsetName,
        spend: Math.round(ad.spend), revenue: Math.round(revenue), roas: r,
        pixelRoas, frequency: Math.round(ad.frequency * 10) / 10,
        firstHalf: roasA != null ? { range: half.a, roas: roasA, spend: Math.round(adA.spend) } : null,
        secondHalf: roasB != null ? { range: half.b, roas: roasB, spend: Math.round(adB.spend) } : null,
        category, reason, options, flags, errors,
      };
    }).sort((x, y) => y.spend - x.spend);

    const count = c => items.filter(i => i.category === c).length;
    const totalSpend = items.reduce((s, i) => s + i.spend, 0);
    const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);

    res.json({
      brand: cfg.brandId, breakeven,
      period: { start: startDate, end: endDate, firstHalf: half.split ? half.a : null, secondHalf: half.split ? half.b : null },
      summary: {
        totalSpend, totalRevenue, totalRoas: roas(totalRevenue, totalSpend),
        counts: { off: count('off'), fix: count('fix'), scale: count('scale'), keep: count('keep'), hold: count('hold') },
        belowBreakeven: items.filter(i => i.spend >= MIN_SPEND && i.roas < breakeven).length,
        activeAds: items.length,
        errorAds: items.filter(i => i.errors.length > 0).length,
      },
      items,
    });
  } catch (err) {
    console.error('[decisions API error]', err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data?.error?.message || err.message });
  }
}
