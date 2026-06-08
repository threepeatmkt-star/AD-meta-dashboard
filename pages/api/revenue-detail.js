/**
 * pages/api/revenue-detail.js
 * DA 매출 / 바이럴 매출 상세 데이터
 * GET /api/revenue-detail?type=da|viral&startDate=&endDate=
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

function normalizeProduct(name) {
  if (!name) return '-';
  if (name.includes('글리펌프') || name.includes('글리아르')) return '글리펌프+글리아르';
  if (name.includes('실온닭가슴살')) return '실온닭가슴살';
  return name;
}

function extractProduct(name) {
  if (!name) return '-';
  const p = name.split('_');
  return p.length >= 2 ? p[1] : p[0];
}

function campaignOrder(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('판매')) return 1;
  if (n.includes('asc')) return 2;
  if (n.includes('전환')) return 3;
  return 4;
}

// YYYYMMDD → YYYY-MM-DD
function parseGA4Date(d) {
  return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
}

// 날짜 → 주차 레이블 (예: 5/4~5/10)
function getWeekLabel(dateStr) {
  const d = new Date(dateStr);
  const dow = d.getDay();
  const diffToMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(d.getTime() - diffToMon * 86400000);
  const sun = new Date(mon.getTime() + 6 * 86400000);
  const fmt = dt => `${dt.getMonth()+1}/${dt.getDate()}`;
  return `${fmt(mon)}~${fmt(sun)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { type, startDate, endDate } = req.query;
  if (!type || !startDate || !endDate) return res.status(400).json({ error: '파라미터 오류' });

  const SNS_REGEX = '.*fb.*|.*insta.*|.*ig.*|.*l\\.instagram.*';

  try {
    const ga4Token = await getGA4AccessToken();
    const propId = process.env.GA4_PROPERTY_ID;

    // ── DA 매출 상세 ──────────────────────────────────────────────
    if (type === 'da') {
      // Meta 일별 광고세트 인사이트
      const metaInsights = await fetchMetaPages(`${META_BASE}/act_${process.env.META_AD_ACCOUNT_ID}/insights`, {
        level: 'adset',
        fields: 'date_start,campaign_name,adset_name,spend',
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        time_increment: 1,
        filtering: JSON.stringify([{ field: 'adset.effective_status', operator: 'IN', value: ['ACTIVE'] }]),
        limit: 500,
        access_token: process.env.META_ACCESS_TOKEN,
      });

      // GA4 일별 DA 매출 (캠페인별)
      const { data: ga4 } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`,
        {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'date' }, { name: 'sessionCampaignName' }],
          metrics: [{ name: 'purchaseRevenue' }],
          dimensionFilter: {
            andGroup: {
              expressions: [
                { filter: { fieldName: 'sessionSourceMedium', stringFilter: { matchType: 'FULL_REGEXP', value: SNS_REGEX } } },
                { filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'CONTAINS', value: 'cpm' } } },
              ],
            },
          },
        },
        { headers: { Authorization: `Bearer ${ga4Token}` }, timeout: 30000 }
      );

      const ga4Rows = (ga4.rows || []).map(r => ({
        date: parseGA4Date(r.dimensionValues[0].value),
        campaign: r.dimensionValues[1].value,
        revenue: parseFloat(r.metricValues[0].value) || 0,
      }));

      // 일별 총합
      const dailyMap = {};
      ga4Rows.forEach(r => {
        if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, revenue: 0 };
        dailyMap[r.date].revenue += r.revenue;
      });
      const dailyRevenue = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

      // 캠페인별 집계
      const campaignMap = {};
      ga4Rows.forEach(r => {
        if (!campaignMap[r.campaign]) campaignMap[r.campaign] = { campaign: r.campaign, revenue: 0, order: campaignOrder(r.campaign) };
        campaignMap[r.campaign].revenue += r.revenue;
      });
      const campaignBreakdown = Object.values(campaignMap).sort((a, b) => a.order - b.order);

      // 주간 × 제품별 테이블
      const weekProductMap = {};
      metaInsights.forEach(m => {
        const prod = normalizeProduct(extractProduct(m.adset_name));
        const week = getWeekLabel(m.date_start);
        const key = `${campaignOrder(m.campaign_name)}|${m.campaign_name}|${prod}`;
        if (!weekProductMap[key]) weekProductMap[key] = {
          campaign: m.campaign_name, product: prod, order: campaignOrder(m.campaign_name),
          weeks: {},
        };
        if (!weekProductMap[key].weeks[week]) weekProductMap[key].weeks[week] = { spend: 0, revenue: 0 };
        weekProductMap[key].weeks[week].spend += parseFloat(m.spend) || 0;
      });

      // GA4 매출을 캠페인 내 adset 비율로 배분 (주간 기준)
      const weekGA4Map = {};
      ga4Rows.forEach(r => {
        const week = getWeekLabel(r.date);
        const key = `${r.campaign}|${week}`;
        if (!weekGA4Map[key]) weekGA4Map[key] = 0;
        weekGA4Map[key] += r.revenue;
      });

      // 캠페인 내 주간 spend 비율로 GA4 매출 배분
      Object.values(weekProductMap).forEach(item => {
        Object.keys(item.weeks).forEach(week => {
          // 같은 캠페인의 총 spend 계산
          const totalSpend = Object.values(weekProductMap)
            .filter(x => x.campaign === item.campaign)
            .reduce((s, x) => s + (x.weeks[week]?.spend || 0), 0);
          const ga4Revenue = weekGA4Map[`${item.campaign}|${week}`] || 0;
          const ratio = totalSpend > 0 ? item.weeks[week].spend / totalSpend : 0;
          item.weeks[week].revenue = ga4Revenue * ratio;
          item.weeks[week].roas = item.weeks[week].spend > 0
            ? Math.round(item.weeks[week].revenue / item.weeks[week].spend * 1000) / 10
            : 0;
        });
      });

      const weeklyTable = Object.values(weekProductMap)
        .sort((a, b) => a.order - b.order)
        .map(item => ({ ...item, weeks: item.weeks }));

      const weeks = [...new Set(
        metaInsights.map(m => getWeekLabel(m.date_start))
      )].sort();

      res.json({ dailyRevenue, campaignBreakdown, weeklyTable, weeks });
    }

    // ── 바이럴 매출 상세 ──────────────────────────────────────────
    else if (type === 'viral') {
      const { data: ga4 } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`,
        {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'date' }, { name: 'sessionSourceMedium' }],
          metrics: [{ name: 'purchaseRevenue' }, { name: 'sessions' }],
          dimensionFilter: {
            filter: { fieldName: 'sessionSourceMedium', stringFilter: { matchType: 'FULL_REGEXP', value: SNS_REGEX } },
          },
        },
        { headers: { Authorization: `Bearer ${ga4Token}` }, timeout: 30000 }
      );

      const rows = (ga4.rows || []).map(r => ({
        date: parseGA4Date(r.dimensionValues[0].value),
        sourceMedium: r.dimensionValues[1].value,
        revenue: parseFloat(r.metricValues[0].value) || 0,
        sessions: parseInt(r.metricValues[1].value) || 0,
      })).filter(r => {
        const medium = r.sourceMedium.toLowerCase().split(' / ')[1] || '';
        return !medium.includes('cpm'); // cpm 제외
      });

      // 일별 집계
      const dailyMap = {};
      rows.forEach(r => {
        if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, revenue: 0, sessions: 0 };
        dailyMap[r.date].revenue += r.revenue;
        dailyMap[r.date].sessions += r.sessions;
      });
      const dailyData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

      // 소스별 집계
      const sourceMap = {};
      rows.forEach(r => {
        const source = r.sourceMedium.split(' / ')[0] || r.sourceMedium;
        if (!sourceMap[source]) sourceMap[source] = { source, revenue: 0, sessions: 0 };
        sourceMap[source].revenue += r.revenue;
        sourceMap[source].sessions += r.sessions;
      });
      const sourceBreakdown = Object.values(sourceMap).sort((a, b) => b.revenue - a.revenue);

      res.json({ dailyData, sourceBreakdown });
    } else {
      res.status(400).json({ error: '올바르지 않은 type' });
    }
  } catch (err) {
    console.error('[revenue-detail error]', err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data?.error?.message || err.message });
  }
}
