/**
 * /pages/api/dashboard.js
 * Meta Ads API + GA4 Data API 통합 엔드포인트
 * GA4 인증: OAuth2 리프레시 토큰 방식
 *
 * 필요 환경변수:
 *   META_AD_ACCOUNT_ID    광고 계정 ID (숫자만)
 *   META_ACCESS_TOKEN     Meta 장기 액세스 토큰
 *   GA4_PROPERTY_ID       GA4 속성 ID
 *   GA4_CLIENT_ID         OAuth 클라이언트 ID
 *   GA4_CLIENT_SECRET     OAuth 클라이언트 보안 비밀번호
 *   GA4_REFRESH_TOKEN     OAuth 리프레시 토큰
 */

import axios from 'axios';

const META_BASE = 'https://graph.facebook.com/v20.0';

// ── GA4: 리프레시 토큰으로 액세스 토큰 발급 ──────────────────────
async function getGA4AccessToken() {
  const { GA4_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN } = process.env;

  const { data } = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: GA4_CLIENT_ID,
    client_secret: GA4_CLIENT_SECRET,
    refresh_token: GA4_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });

  return data.access_token;
}

// ── Meta: 페이지네이션 처리하며 전체 데이터 수집 ──────────────────
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

// ── Meta: 광고 인사이트 (지출/도달/노출/클릭) ─────────────────────
async function getMetaInsights(level, startDate, endDate) {
  const { META_AD_ACCOUNT_ID: acctId, META_ACCESS_TOKEN: token } = process.env;

  const fields = [
    'campaign_id',
    'campaign_name',
    ...(level !== 'campaign' ? ['adset_id', 'adset_name'] : []),
    ...(level === 'ad' ? ['ad_id', 'ad_name'] : []),
    'spend',
    'reach',
    'impressions',
    'inline_link_clicks',
  ].join(',');

  const statusField = {
    campaign: 'campaign.effective_status',
    adset: 'adset.effective_status',
    ad: 'ad.effective_status',
  }[level];

  return fetchMetaPages(`${META_BASE}/act_${acctId}/insights`, {
    level,
    fields,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    filtering: JSON.stringify([
      { field: statusField, operator: 'IN', value: ['ACTIVE'] },
    ]),
    limit: 100,
    access_token: token,
  });
}

// ── Meta: 소재 썸네일 URL 수집 ────────────────────────────────────
async function getMetaThumbnails() {
  const { META_AD_ACCOUNT_ID: acctId, META_ACCESS_TOKEN: token } = process.env;

  const ads = await fetchMetaPages(`${META_BASE}/act_${acctId}/ads`, {
    fields: 'id,creative{thumbnail_url}',
    filtering: JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE'] },
    ]),
    limit: 100,
    access_token: token,
  });

  return Object.fromEntries(
    ads.map((a) => [a.id, a.creative?.thumbnail_url || null])
  );
}

// ── GA4: 구매 매출액 조회 ────────────────────────────────────────
async function getGA4Revenue(startDate, endDate) {
  const { GA4_PROPERTY_ID: propId } = process.env;
  const accessToken = await getGA4AccessToken();

  const { data } = await axios.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`,
    {
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'sessionCampaignName' },
        { name: 'sessionManualAdContent' },
      ],
      metrics: [{ name: 'purchaseRevenue' }],
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 30000,
    }
  );

  return (data.rows || [])
    .filter(
      (r) =>
        r.dimensionValues[0].value !== '(not set)' ||
        r.dimensionValues[1].value !== '(not set)'
    )
    .map((r) => ({
      campaign: r.dimensionValues[0].value,
      ad: r.dimensionValues[1].value,
      revenue: parseFloat(r.metricValues[0].value) || 0,
    }));
}

// ── 유틸 ────────────────────────────────────────────────────────
function calcRoas(revenue, spend) {
  return spend > 0 ? Math.round((revenue / spend) * 100 * 10) / 10 : 0;
}

// ── 핸들러 ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { startDate, endDate, level = 'campaign' } = req.query;
  if (!startDate || !endDate)
    return res.status(400).json({ error: '날짜를 선택해주세요.' });

  // 환경변수 점검
  const missing = [
    !process.env.META_AD_ACCOUNT_ID && 'META_AD_ACCOUNT_ID',
    !process.env.META_ACCESS_TOKEN && 'META_ACCESS_TOKEN',
    !process.env.GA4_PROPERTY_ID && 'GA4_PROPERTY_ID',
    !process.env.GA4_CLIENT_ID && 'GA4_CLIENT_ID',
    !process.env.GA4_CLIENT_SECRET && 'GA4_CLIENT_SECRET',
    !process.env.GA4_REFRESH_TOKEN && 'GA4_REFRESH_TOKEN',
  ].filter(Boolean);

  if (missing.length > 0)
    return res.status(500).json({
      error: `환경변수 미설정: ${missing.join(', ')}`,
    });

  try {
    const [adInsights, ga4Data, thumbnails] = await Promise.all([
      getMetaInsights('ad', startDate, endDate),
      getGA4Revenue(startDate, endDate),
      level === 'ad' ? getMetaThumbnails() : Promise.resolve({}),
    ]);

    const adWithRevenue = adInsights.map((ad) => {
      const revenue = ga4Data
        .filter((g) => g.campaign === ad.campaign_name && g.ad === ad.ad_name)
        .reduce((s, g) => s + g.revenue, 0);

      const revenueFallback =
        revenue === 0
          ? ga4Data
              .filter((g) => g.ad === ad.ad_name && g.ad !== '(not set)')
              .reduce((s, g) => s + g.revenue, 0)
          : 0;

      return { ...ad, revenue: revenue || revenueFallback };
    });

    if (level === 'ad') {
      const data = adWithRevenue.map((ad) => ({
        id: ad.ad_id,
        name: ad.ad_name,
        campaignName: ad.campaign_name,
        adsetName: ad.adset_name,
        spend: parseFloat(ad.spend) || 0,
        revenue: ad.revenue,
        roas: calcRoas(ad.revenue, parseFloat(ad.spend) || 0),
        reach: parseInt(ad.reach) || 0,
        impressions: parseInt(ad.impressions) || 0,
        clicks: parseInt(ad.inline_link_clicks) || 0,
        thumbnail: thumbnails[ad.ad_id] || null,
      }));
      return res.json({ data });
    }

    const levelInsights = await getMetaInsights(level, startDate, endDate);

    const revenueMap = {};
    adWithRevenue.forEach((ad) => {
      const key = level === 'adset' ? ad.adset_id : ad.campaign_id;
      revenueMap[key] = (revenueMap[key] || 0) + ad.revenue;
    });

    const data = levelInsights.map((item) => {
      const id = level === 'adset' ? item.adset_id : item.campaign_id;
      const revenue = revenueMap[id] || 0;
      const spend = parseFloat(item.spend) || 0;
      return {
        id,
        name: level === 'adset' ? item.adset_name : item.campaign_name,
        campaignName: item.campaign_name,
        adsetName: item.adset_name || null,
        spend,
        revenue,
        roas: calcRoas(revenue, spend),
        reach: parseInt(item.reach) || 0,
        impressions: parseInt(item.impressions) || 0,
        clicks: parseInt(item.inline_link_clicks) || 0,
        thumbnail: null,
      };
    });

    res.json({ data });
  } catch (err) {
    console.error('[dashboard API error]', err?.response?.data || err.message);
    const message =
      err?.response?.data?.error?.message ||
      err?.response?.data?.error ||
      err?.message ||
      '알 수 없는 오류가 발생했습니다.';
    res.status(500).json({ error: message });
  }
}
