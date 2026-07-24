/**
 * pages/api/dashboard.js — v7 (멀티 브랜드)
 * GET /api/dashboard?brand=samdae500|mxssive&startDate=&endDate=&level=
 */
import axios from 'axios';
import { resolveBrand, SNS_REGEX } from '../../lib/brandEnv';

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

async function getMetaInsights(cfg, level, startDate, endDate) {
  const fields = [
    'campaign_id','campaign_name',
    ...(level !== 'campaign' ? ['adset_id','adset_name'] : []),
    ...(level === 'ad' ? ['ad_id','ad_name'] : []),
    'spend','reach','impressions','inline_link_clicks',
  ].join(',');
  const statusField = { campaign:'campaign.effective_status', adset:'adset.effective_status', ad:'ad.effective_status' }[level];
  return fetchMetaPages(`${META_BASE}/act_${cfg.adAccountId}/insights`, {
    level, fields,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    filtering: JSON.stringify([{ field: statusField, operator: 'IN', value: ['ACTIVE'] }]),
    limit: 100, access_token: cfg.metaToken,
  });
}

// 비디오 ID → 고화질 썸네일 + 재생 소스
async function getVideoAsset(videoId, token) {
  try {
    const res = await axios.get(`${META_BASE}/${videoId}`, {
      params: { fields: 'thumbnails,source,permalink_url,picture', access_token: token },
      timeout: 15000,
    });
    const thumbs = res.data?.thumbnails?.data || [];
    const best = thumbs.length
      ? thumbs.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a), thumbs[0])
      : null;
    return {
      thumb: best?.uri || res.data?.picture || null,
      source: res.data?.source || null,
      permalink: res.data?.permalink_url || null,
    };
  } catch {
    return { thumb: null, source: null, permalink: null };
  }
}

// image_hash → 원본 이미지 URL (adimages 조회)
async function getImageByHash(hashes, cfg) {
  const out = {};
  const list = [...new Set(hashes.filter(Boolean))];
  for (let i = 0; i < list.length; i += 40) {
    const chunk = list.slice(i, i + 40);
    try {
      const res = await axios.get(`${META_BASE}/act_${cfg.adAccountId}/adimages`, {
        params: {
          hashes: JSON.stringify(chunk),
          fields: 'hash,permalink_url,url,width,height',
          access_token: cfg.metaToken,
        },
        timeout: 20000,
      });
      (res.data.data || []).forEach(img => {
        out[img.hash] = img.permalink_url || img.url || null;
      });
    } catch {}
  }
  return out;
}

async function getMetaCreatives(cfg) {
  const token = cfg.metaToken;
  const ads = await fetchMetaPages(`${META_BASE}/act_${cfg.adAccountId}/ads`, {
    fields: [
      'id',
      'creative{id,name,image_url,thumbnail_url,image_hash,video_id,' +
      'object_story_spec{video_data{image_url,video_id},link_data{picture,image_hash}},' +
      'asset_feed_spec{images{hash,url},videos{video_id,thumbnail_url}}}',
    ].join(','),
    thumbnail_width: 1080,
    thumbnail_height: 1080,
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: 100,
    access_token: token,
  });

  // 수집
  const hashes = [];
  const videoIds = [];
  const parsed = ads.map(a => {
    const c = a.creative || {};
    const oss = c.object_story_spec || {};
    const afs = c.asset_feed_spec || {};

    const hash =
      c.image_hash ||
      oss.link_data?.image_hash ||
      afs.images?.[0]?.hash ||
      null;
    const videoId =
      c.video_id ||
      oss.video_data?.video_id ||
      afs.videos?.[0]?.video_id ||
      null;
    const directImage =
      c.image_url ||
      oss.video_data?.image_url ||
      oss.link_data?.picture ||
      afs.images?.[0]?.url ||
      null;

    if (hash) hashes.push(hash);
    if (videoId) videoIds.push(videoId);
    return { adId: a.id, hash, videoId, directImage, thumb: c.thumbnail_url || null };
  });

  const [hashMap, videoEntries] = await Promise.all([
    getImageByHash(hashes, cfg),
    Promise.all([...new Set(videoIds)].map(async id => [id, await getVideoAsset(id, token)])),
  ]);
  const videoMap = Object.fromEntries(videoEntries);

  return Object.fromEntries(parsed.map(p => {
    const v = p.videoId ? videoMap[p.videoId] : null;
    // 큰 화면용 원본 (해시 원본 > 크리에이티브 이미지 > 비디오 썸네일 > 작은 썸네일)
    const full =
      (p.hash && hashMap[p.hash]) ||
      p.directImage ||
      v?.thumb ||
      p.thumb ||
      null;
    // 리스트용 (작아도 되지만 이왕이면 원본)
    const thumb = full || p.thumb || null;
    return [p.adId, {
      thumb,
      full,
      videoId: p.videoId || null,
      videoSource: v?.source || null,
      permalink: v?.permalink || null,
    }];
  }));
}

async function getAdsetBudgets(cfg) {
  const adsets = await fetchMetaPages(`${META_BASE}/act_${cfg.adAccountId}/adsets`, {
    fields: 'id,daily_budget',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: 100, access_token: cfg.metaToken,
  });
  return Object.fromEntries(adsets.map(a => [a.id, parseInt(a.daily_budget) || 0]));
}

async function getGA4Revenue(cfg, startDate, endDate, ga4Token) {
  const { data } = await axios.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.ga4PropertyId}:runReport`,
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

async function getGA4RevenueSplit(cfg, startDate, endDate, ga4Token) {
  const { data } = await axios.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.ga4PropertyId}:runReport`,
    {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionSourceMedium' }],
      metrics: [{ name: 'purchaseRevenue' }],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionSourceMedium',
          stringFilter: { matchType: 'FULL_REGEXP', value: SNS_REGEX },
        },
      },
    },
    { headers: { Authorization: `Bearer ${ga4Token}` }, timeout: 30000 }
  );
  let adRevenue = 0, viralRevenue = 0;
  (data.rows || []).forEach(r => {
    const sm = r.dimensionValues[0].value.toLowerCase();
    const medium = sm.split(' / ')[1] || '';
    const rev = parseFloat(r.metricValues[0].value) || 0;
    if (medium.includes('cpm')) adRevenue += rev;
    else viralRevenue += rev;
  });
  return { adRevenue, viralRevenue };
}

function calcRoas(revenue, spend) {
  return spend > 0 ? Math.round((revenue / spend) * 100 * 10) / 10 : 0;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { startDate, endDate, level = 'campaign', brand = 'samdae500' } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: '날짜를 선택해주세요.' });

  const cfg = resolveBrand(brand);
  if (cfg.missing.length > 0)
    return res.status(500).json({ error: `환경변수 미설정: ${cfg.missing.join(', ')}` });

  try {
    const ga4Token = await getGA4AccessToken();
    const [adInsights, ga4Data, revenueSplit, thumbnails, budgets] = await Promise.all([
      getMetaInsights(cfg, 'ad', startDate, endDate),
      getGA4Revenue(cfg, startDate, endDate, ga4Token),
      getGA4RevenueSplit(cfg, startDate, endDate, ga4Token),
      level === 'ad' ? getMetaCreatives(cfg) : Promise.resolve({}),
      level === 'adset' ? getAdsetBudgets(cfg) : Promise.resolve({}),
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
        clicks: parseInt(ad.inline_link_clicks)||0,
        thumbnail: thumbnails[ad.ad_id]?.thumb || null,
        fullImage: thumbnails[ad.ad_id]?.full || null,
        videoSource: thumbnails[ad.ad_id]?.videoSource || null,
        videoId: thumbnails[ad.ad_id]?.videoId || null,
        permalink: thumbnails[ad.ad_id]?.permalink || null,
      }));
      return res.json({ data, ...revenueSplit });
    }

    const levelInsights = await getMetaInsights(cfg, level, startDate, endDate);
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
