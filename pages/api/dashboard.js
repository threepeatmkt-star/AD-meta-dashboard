/**
 * pages/api/dashboard.js — v6
 * GA4 매출: .*fb.*|.*insta.*|.*ig.* 정규식 필터 적용
 * 비디오 썸네일: video_id → 썸네일 별도 조회
 */
import axios from 'axios';

const META_BASE = 'https://graph.facebook.com/v20.0';

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

async function getMetaInsights(level, startDate, endDate) {
  const { META_AD_ACCOUNT_ID: acctId, META_ACCESS_TOKEN: token } = process.env;
  const fields = [
    'campaign_id','campaign_name',
    ...(level !== 'campaign' ? ['adset_id','adset_name'] : []),
    ...(level === 'ad' ? ['ad_id','ad_name'] : []),
    'spend','reach','impressions','inline_link_clicks',
  ].join(',');
  const statusField = { campaign:'campaign.effective_status', adset:'adset.effective_status', ad:'ad.effective_status' }[level];
  return fetchMetaPages(`${META_BASE}/act_${acctId}/insights`, {
    level, fields,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    filtering: JSON.stringify([{ field: statusField, operator: 'IN', value: ['ACTIVE'] }]),
    limit: 100, access_token: token,
  });
}

// 비디오 ID로 썸네일 URL 가져오기
async function getVideoThumbnail(videoId, token) {
  try {
    const res = await axios.get(`${META_BASE}/${videoId}`, {
      params: { fields: 'thumbnails', access_token: token },
      timeout: 10000,
    });
    const thumbs = res.data?.thumbnails?.data;
    if (thumbs && thumbs.length > 0) {
      // 가장 큰 썸네일 선택
      const best = thumbs.reduce((a, b) => ((b.width||0) > (a.width||0) ? b : a), thumbs[0]);
      return best.uri || null;
    }
  } catch {}
  return null;
}

async function getMetaThumbnails() {
  const { META_AD_ACCOUNT_ID: acctId, META_ACCESS_TOKEN: token } = process.env;
  const ads = await fetchMetaPages(`${META_BASE}/act_${acctId}/ads`, {
    fields: 'id,creative{image_url,thumbnail_url,video_id,object_story_spec{video_data{image_url,video_id}}}',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: 100, access_token: token,
  });

  // 비디오 ID 모아서 병렬 조회
  const videoFetches = [];
  const adVideoMap = {};
  ads.forEach(a => {
    const c = a.creative;
    const vid = c?.video_id || c?.object_story_spec?.video_data?.video_id;
    if (vid && !c?.image_url) {
      adVideoMap[a.id] = vid;
      if (!videoFetches.find(f => f.vid === vid)) videoFetches.push({ vid, token });
    }
  });

  // 비디오 썸네일 병렬 조회
  const videoThumbMap = {};
  await Promise.all(
    [...new Set(Object.values(adVideoMap))].map(async vid => {
      videoThumbMap[vid] = await getVideoThumbnail(vid, token);
    })
  );

  return Object.fromEntries(ads.map(a => {
    const c = a.creative;
    const vid = adVideoMap[a.id];
    const hq =
      c?.image_url ||
      c?.object_story_spec?.video_data?.image_url ||
      (vid ? videoThumbMap[vid] : null) ||
      c?.thumbnail_url ||
      null;
    return [a.id, hq];
  }));
}

async function getAdsetBudgets() {
  const { META_AD_ACCOUNT_ID: acctId, META_ACCESS_TOKEN: token } = process.env;
  const adsets = await fetchMetaPages(`${META_BASE}/act_${acctId}/adsets`, {
    fields: 'id,daily_budget',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: 100, access_token: token,
  });
  return Object.fromEntries(adsets.map(a => [a.id, parseInt(a.daily_budget) || 0]));
}

async function getGA4Revenue(startDate, endDate, ga4Token) {
  const { GA4_PROPERTY_ID: propId } = process.env;
  const { data } = await axios.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`,
    {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionManualAdContent' }],
      metrics: [{ name: 'purchaseRevenue' }],
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

// GA4 SNS 매출 — 정규식: .*fb.*|.*insta.*|.*ig.*
async function getGA4RevenueSplit(startDate, endDate, ga4Token) {
  const { GA4_PROPERTY_ID: propId } = process.env;
  const { data } = await axios.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`,
    {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionSourceMedium' }],
      metrics: [{ name: 'purchaseRevenue' }],
      // SNS 채널(FB/인스타)만 필터링
      dimensionFilter: {
        filter: {
          fieldName: 'sessionSourceMedium',
          stringFilter: { matchType: 'FULL_REGEXP', value: '.*fb.*|.*insta.*|.*ig.*' },
        },
      },
    },
    { headers: { Authorization: `Bearer ${ga4Token}` }, timeout: 30000 }
  );
  let adRevenue = 0, viralRevenue = 0;
  (data.rows || []).forEach(r => {
    const sm = r.dimensionValues[0].value.toLowerCase();
    const rev = parseFloat(r.metricValues[0].value) || 0;
    if (sm.includes('cpm')) adRevenue += rev;
    else viralRevenue += rev;
  });
  return { adRevenue, viralRevenue };
}

function calcRoas(revenue, spend) {
  return spend > 0 ? Math.round((revenue / spend) * 100 * 10) / 10 : 0;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { startDate, endDate, level = 'campaign' } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: '날짜를 선택해주세요.' });

  const missing = [
    !process.env.META_AD_ACCOUNT_ID && 'META_AD_ACCOUNT_ID',
    !process.env.META_ACCESS_TOKEN && 'META_ACCESS_TOKEN',
    !process.env.GA4_PROPERTY_ID && 'GA4_PROPERTY_ID',
    !process.env.GA4_CLIENT_ID && 'GA4_CLIENT_ID',
    !process.env.GA4_CLIENT_SECRET && 'GA4_CLIENT_SECRET',
    !process.env.GA4_REFRESH_TOKEN && 'GA4_REFRESH_TOKEN',
  ].filter(Boolean);
  if (missing.length > 0) return res.status(500).json({ error: `환경변수 미설정: ${missing.join(', ')}` });

  try {
    const ga4Token = await getGA4AccessToken();
    const [adInsights, ga4Data, revenueSplit, thumbnails, budgets] = await Promise.all([
      getMetaInsights('ad', startDate, endDate),
      getGA4Revenue(startDate, endDate, ga4Token),
      getGA4RevenueSplit(startDate, endDate, ga4Token),
      level === 'ad' ? getMetaThumbnails() : Promise.resolve({}),
      level === 'adset' ? getAdsetBudgets() : Promise.resolve({}),
    ]);

    const adWithRevenue = adInsights.map(ad => {
      const revenue = ga4Data.filter(g => g.campaign === ad.campaign_name && g.ad === ad.ad_name).reduce((s,g)=>s+g.revenue,0);
      const fallback = revenue === 0 ? ga4Data.filter(g => g.ad === ad.ad_name && g.ad !== '(not set)').reduce((s,g)=>s+g.revenue,0) : 0;
      return { ...ad, revenue: revenue || fallback };
    });

    if (level === 'ad') {
      const data = adWithRevenue.map(ad => ({
        id: ad.ad_id, name: ad.ad_name,
        campaignName: ad.campaign_name, adsetName: ad.adset_name, adsetId: ad.adset_id,
        spend: parseFloat(ad.spend)||0, revenue: ad.revenue,
        roas: calcRoas(ad.revenue, parseFloat(ad.spend)||0),
        reach: parseInt(ad.reach)||0, impressions: parseInt(ad.impressions)||0,
        clicks: parseInt(ad.inline_link_clicks)||0, thumbnail: thumbnails[ad.ad_id]||null,
      }));
      return res.json({ data, ...revenueSplit });
    }

    const levelInsights = await getMetaInsights(level, startDate, endDate);
    const revenueMap = {};
    adWithRevenue.forEach(ad => {
      const key = level === 'adset' ? ad.adset_id : ad.campaign_id;
      revenueMap[key] = (revenueMap[key]||0) + ad.revenue;
    });

    const data = levelInsights.map(item => {
      const id = level === 'adset' ? item.adset_id : item.campaign_id;
      const revenue = revenueMap[id]||0, spend = parseFloat(item.spend)||0;
      return {
        id, name: level==='adset' ? item.adset_name : item.campaign_name,
        campaignName: item.campaign_name, adsetName: level==='adset'?item.adset_name:null,
        spend, revenue, roas: calcRoas(revenue, spend),
        reach: parseInt(item.reach)||0, impressions: parseInt(item.impressions)||0,
        clicks: parseInt(item.inline_link_clicks)||0,
        dailyBudget: level==='adset'?(budgets[item.adset_id]||0):null,
        thumbnail: null,
      };
    });
    res.json({ data, ...revenueSplit });
  } catch (err) {
    console.error('[dashboard API error]', err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data?.error?.message || err?.message || '오류 발생' });
  }
}
