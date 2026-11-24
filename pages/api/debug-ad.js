/**
 * pages/api/debug-ad.js — 특정 소재의 GA4 매출 0 원인 점검
 * GET /api/debug-ad?brand=samdae500&q=chicken_image&startDate=&endDate=
 *
 * ① 메타: 소재명에 q가 포함된 켜진 광고의 랜딩 URL·URL 매개변수
 * ② GA4: 캠페인/콘텐츠/소스매체/랜딩페이지 중 q 또는 광고ID가 들어간 세션·매출
 */
import axios from 'axios';
import { resolveBrand } from '../../lib/brandEnv';

const META_BASE = 'https://graph.facebook.com/v20.0';

async function getGA4AccessToken() {
  const { GA4_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN } = process.env;
  const { data } = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: GA4_CLIENT_ID, client_secret: GA4_CLIENT_SECRET,
    refresh_token: GA4_REFRESH_TOKEN, grant_type: 'refresh_token',
  });
  return data.access_token;
}

export default async function handler(req, res) {
  const { brand = 'samdae500', q = '', startDate, endDate } = req.query;
  if (!q || !startDate || !endDate) return res.status(400).json({ error: 'q, startDate, endDate 필요' });
  const cfg = resolveBrand(brand);
  try {
    // mode=funnel — 메타 유입(fbinsta) 소재별 이벤트 퍼널 비교 (q 소재가 어느 단계에서 끊기는지)
    if (req.query.mode === 'funnel') {
      const token = await getGA4AccessToken();
      const EV = ['session_start', 'view_item', 'add_to_cart', 'begin_checkout', 'add_payment_info', 'purchase'];
      const { data: g } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.ga4PropertyId}:runReport`,
        {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'sessionManualAdContent' }, { name: 'eventName' }],
          metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
          dimensionFilter: { andGroup: { expressions: [
            { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'PARTIAL_REGEXP', value: 'fb|insta|ig|meta' } } },
            { filter: { fieldName: 'eventName', inListFilter: { values: EV } } },
          ] } },
          limit: 2000,
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
      );
      const m = {};
      (g.rows || []).forEach(r => {
        const c = r.dimensionValues[0].value, e = r.dimensionValues[1].value;
        m[c] = m[c] || { content: c };
        m[c][e] = +r.metricValues[1].value;
      });
      const rows = Object.values(m).filter(r => (r.session_start || 0) >= 20)
        .map(r => ({ ...r, '구매전환%': r.session_start ? +((r.purchase || 0) / r.session_start * 100).toFixed(2) : 0 }))
        .sort((a, b) => (b.session_start || 0) - (a.session_start || 0));
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).send(JSON.stringify({ period: `${startDate}~${endDate}`, note: '숫자 = 사용자 수', focus: rows.filter(r => r.content.includes(q)), all: rows }, null, 2));
    }

    // ① 메타 소재 랜딩
    const { data } = await axios.get(`${META_BASE}/act_${cfg.adAccountId}/ads`, {
      params: {
        fields: 'id,name,effective_status,adset{name},creative{url_tags,object_story_spec{link_data{link,call_to_action}},asset_feed_spec{link_urls},effective_object_story_id}',
        filtering: JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: q }]),
        limit: 50, access_token: cfg.metaToken,
      }, timeout: 30000,
    });
    const ads = (data.data || []).map(a => {
      const c = a.creative || {};
      return {
        adId: a.id, name: a.name, status: a.effective_status, adset: a.adset?.name,
        url_tags: c.url_tags || null,
        link: c.object_story_spec?.link_data?.link || c.object_story_spec?.link_data?.call_to_action?.value?.link || null,
        feed_links: (c.asset_feed_spec?.link_urls || []).map(l => l.website_url),
      };
    });

    // ② GA4 — q 또는 광고ID가 포함된 행
    const token = await getGA4AccessToken();
    const ids = ads.map(a => a.adId);
    const rx = [q, ...ids].map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const { data: g } = await axios.post(
      `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.ga4PropertyId}:runReport`,
      {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionManualAdContent' }, { name: 'sessionSourceMedium' }, { name: 'landingPagePlusQueryString' }],
        metrics: [{ name: 'sessions' }, { name: 'purchaseRevenue' }],
        dimensionFilter: { orGroup: { expressions: [
          { filter: { fieldName: 'sessionCampaignName', stringFilter: { matchType: 'PARTIAL_REGEXP', value: rx } } },
          { filter: { fieldName: 'sessionManualAdContent', stringFilter: { matchType: 'PARTIAL_REGEXP', value: rx } } },
          { filter: { fieldName: 'landingPagePlusQueryString', stringFilter: { matchType: 'PARTIAL_REGEXP', value: rx } } },
        ] } },
        limit: 100,
      },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
    );
    const ga4 = (g.rows || []).map(r => ({
      campaign: r.dimensionValues[0].value, content: r.dimensionValues[1].value,
      sourceMedium: r.dimensionValues[2].value, landing: r.dimensionValues[3].value.slice(0, 200),
      sessions: +r.metricValues[0].value, revenue: Math.round(+r.metricValues[1].value),
    })).sort((a, b) => b.sessions - a.sessions);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify({ q, period: `${startDate}~${endDate}`, ads, ga4 }, null, 2));
  } catch (err) {
    res.status(500).json({ error: err?.response?.data?.error?.message || err.message });
  }
}
