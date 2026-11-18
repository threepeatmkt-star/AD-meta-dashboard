/**
 * pages/api/debug-referrals.js — 구매 매출의 유입 경로 전체 분포 진단
 * GET /api/debug-referrals?brand=samdae500&startDate=&endDate=
 *
 * SNS 필터 없이 전체 sessionSourceMedium별 구매 매출을 보여줍니다.
 * PG(결제)·간편로그인 도메인 referral에 매출이 잡혀 있으면 세션 끊김이 원인.
 */
import axios from 'axios';
import { resolveBrand } from '../../lib/brandEnv';

async function getGA4AccessToken() {
  const { GA4_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN } = process.env;
  const { data } = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: GA4_CLIENT_ID, client_secret: GA4_CLIENT_SECRET,
    refresh_token: GA4_REFRESH_TOKEN, grant_type: 'refresh_token',
  });
  return data.access_token;
}

const LEAK_PATTERNS = /kakao|naver\.com|nid\.|inicis|tosspay|toss\.im|nicepay|kcp|payco|smilepay|kginicis|danal|mobilians|login|auth|pay/i;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { brand = 'samdae500', startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate, endDate 필요' });

  const cfg = resolveBrand(brand);
  if (cfg.missing.length) return res.status(500).json({ error: `환경변수 미설정: ${cfg.missing.join(', ')}` });

  try {
    const token = await getGA4AccessToken();
    const { data } = await axios.post(
      `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.ga4PropertyId}:runReport`,
      {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionSourceMedium' }],
        metrics: [{ name: 'purchaseRevenue' }, { name: 'transactions' }, { name: 'sessions' }],
        limit: 100,
      },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
    );

    const rows = (data.rows || []).map(r => ({
      sourceMedium: r.dimensionValues[0].value,
      revenue: Math.round(parseFloat(r.metricValues[0].value) || 0),
      transactions: parseInt(r.metricValues[1].value) || 0,
      sessions: parseInt(r.metricValues[2].value) || 0,
      leakSuspect: LEAK_PATTERNS.test(r.dimensionValues[0].value),
    })).sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const leakRevenue = rows.filter(r => r.leakSuspect).reduce((s, r) => s + r.revenue, 0);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify({
      기간: `${startDate} ~ ${endDate}`, 브랜드: cfg.brandId,
      전체매출: totalRevenue,
      세션끊김_의심_매출: leakRevenue,
      의심_비율: totalRevenue > 0 ? Math.round(leakRevenue / totalRevenue * 1000) / 10 + '%' : '0%',
      rows,
    }, null, 2));
  } catch (err) {
    res.status(500).json({ error: err?.response?.data?.error?.message || err.message });
  }
}
