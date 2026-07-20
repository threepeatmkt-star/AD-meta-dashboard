/**
 * pages/api/daily.js — 일자별 광고비 / 매출 / ROAS
 * GET /api/daily?brand=samdae500&startDate=&endDate=
 * 통합 조회 페이지의 추이 차트용
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

const parseGA4Date = d => `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { startDate, endDate, brand = 'samdae500' } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: '날짜를 선택해주세요.' });

  const cfg = resolveBrand(brand);
  if (cfg.missing.length) return res.status(500).json({ error: `환경변수 미설정: ${cfg.missing.join(', ')}` });

  try {
    const ga4Token = await getGA4AccessToken();

    const [metaRows, ga4Res] = await Promise.all([
      fetchMetaPages(`${META_BASE}/act_${cfg.adAccountId}/insights`, {
        level: 'account',
        fields: 'date_start,spend,impressions,inline_link_clicks',
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        time_increment: 1,
        limit: 500,
        access_token: cfg.metaToken,
      }),
      axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.ga4PropertyId}:runReport`,
        {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'date' }, { name: 'sessionSourceMedium' }],
          metrics: [{ name: 'purchaseRevenue' }],
          dimensionFilter: {
            filter: { fieldName: 'sessionSourceMedium', stringFilter: { matchType: 'FULL_REGEXP', value: SNS_REGEX } },
          },
          limit: 5000,
        },
        { headers: { Authorization: `Bearer ${ga4Token}` }, timeout: 30000 }
      ),
    ]);

    const map = {};
    const touch = d => (map[d] = map[d] || { date: d, spend: 0, adRevenue: 0, viralRevenue: 0, impressions: 0, clicks: 0 });

    metaRows.forEach(m => {
      const d = touch(m.date_start);
      d.spend += parseFloat(m.spend) || 0;
      d.impressions += parseInt(m.impressions) || 0;
      d.clicks += parseInt(m.inline_link_clicks) || 0;
    });

    (ga4Res.data.rows || []).forEach(r => {
      const d = touch(parseGA4Date(r.dimensionValues[0].value));
      const medium = r.dimensionValues[1].value.toLowerCase().split(' / ')[1] || '';
      const rev = parseFloat(r.metricValues[0].value) || 0;
      if (medium.includes('cpm')) d.adRevenue += rev; else d.viralRevenue += rev;
    });

    const daily = Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => {
        const revenue = d.adRevenue + d.viralRevenue;
        return { ...d, revenue, roas: d.spend > 0 ? Math.round(revenue / d.spend * 1000) / 10 : 0 };
      });

    res.json({ brand: cfg.brandId, daily });
  } catch (err) {
    console.error('[daily API error]', err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data?.error?.message || err.message });
  }
}
