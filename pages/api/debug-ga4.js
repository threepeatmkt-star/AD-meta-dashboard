/**
 * pages/api/debug-ga4.js — DA / 바이럴 분리 진단
 * GET /api/debug-ga4?brand=mxssive&startDate=2026-07-19&endDate=2026-07-19
 *
 * 대시보드가 실제로 GA4에서 받아온 원본 행을 그대로 보여줍니다.
 * "왜 이 매출이 DA가 아니라 바이럴로 갔는지"를 눈으로 확인하는 용도.
 */
import axios from 'axios';
import { resolveBrand, SNS_REGEX } from '../../lib/brandEnv';

async function getGA4AccessToken() {
  const { GA4_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN } = process.env;
  const { data } = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: GA4_CLIENT_ID, client_secret: GA4_CLIENT_SECRET,
    refresh_token: GA4_REFRESH_TOKEN, grant_type: 'refresh_token',
  });
  return data.access_token;
}

async function runReport(propId, token, body) {
  const { data } = await axios.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`,
    body, { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
  );
  return data;
}

export default async function handler(req, res) {
  const { brand = 'samdae500', startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate, endDate 필요 (예: &startDate=2026-07-19&endDate=2026-07-19)' });

  const cfg = resolveBrand(brand);
  if (cfg.missing.length) return res.status(500).json({ error: `환경변수 미설정: ${cfg.missing.join(', ')}` });

  try {
    const token = await getGA4AccessToken();
    const filter = {
      filter: { fieldName: 'sessionSourceMedium', stringFilter: { matchType: 'FULL_REGEXP', value: SNS_REGEX } },
    };

    // [A] 대시보드가 실제로 쓰는 쿼리 (소스/매체 1개 차원)
    const a = await runReport(cfg.ga4PropertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionSourceMedium' }],
      metrics: [{ name: 'purchaseRevenue' }, { name: 'sessions' }],
      dimensionFilter: filter,
    });

    let daA = 0, viralA = 0;
    const rowsA = (a.rows || []).map(r => {
      const raw = r.dimensionValues[0].value;
      const sm = raw.toLowerCase();
      const medium = sm.split(' / ')[1] || '';
      const rev = parseFloat(r.metricValues[0].value) || 0;
      const isDA = medium.includes('cpm');
      if (isDA) daA += rev; else viralA += rev;
      return {
        sourceMedium: raw,
        파싱된_medium: medium === '' ? '(파싱실패!)' : medium,
        분류: isDA ? 'DA' : '바이럴',
        revenue: rev,
        sessions: parseInt(r.metricValues[1].value) || 0,
      };
    });

    // [B] GA4 탐색과 같은 3개 차원
    const b = await runReport(cfg.ga4PropertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'sessionSourceMedium' }, { name: 'sessionCampaignName' }, { name: 'sessionManualAdContent' },
      ],
      metrics: [{ name: 'purchaseRevenue' }, { name: 'sessions' }],
      dimensionFilter: filter,
      limit: 200,
    });

    let daB = 0, viralB = 0;
    const rowsB = (b.rows || []).map(r => {
      const raw = r.dimensionValues[0].value;
      const medium = raw.toLowerCase().split(' / ')[1] || '';
      const rev = parseFloat(r.metricValues[0].value) || 0;
      const isDA = medium.includes('cpm');
      if (isDA) daB += rev; else viralB += rev;
      return {
        sourceMedium: raw,
        campaign: r.dimensionValues[1].value,
        adContent: r.dimensionValues[2].value,
        분류: isDA ? 'DA' : '바이럴',
        revenue: rev,
      };
    }).sort((x, y) => y.revenue - x.revenue);

    // [C] sessionMedium 단독으로 본 값 (다른 방식 검증)
    const c = await runReport(cfg.ga4PropertyId, token, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'purchaseRevenue' }],
      dimensionFilter: filter,
    });
    const rowsC = (c.rows || []).map(r => ({
      source: r.dimensionValues[0].value,
      medium: r.dimensionValues[1].value,
      revenue: parseFloat(r.metricValues[0].value) || 0,
    }));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify({
      기간: `${startDate} ~ ${endDate}`,
      브랜드: cfg.brandId,
      GA4속성: cfg.ga4PropertyId,
      정규식: SNS_REGEX,

      '① 대시보드가_쓰는_쿼리': {
        DA합계: daA, 바이럴합계: viralA, 총합: daA + viralA,
        rows: rowsA,
      },
      '② GA4탐색과_같은_3차원': {
        DA합계: daB, 바이럴합계: viralB, 총합: daB + viralB,
        rows: rowsB,
      },
      '③ source_medium_분리조회': { rows: rowsC },

      '⚠️ 판정': daA === daB
        ? '①②가 일치합니다 → 대시보드 계산은 정상. 차이가 보였다면 GA4 데이터 확정 지연(24~48h) 때문입니다.'
        : `①②가 다릅니다 (차이 ${Math.abs(daA - daB).toLocaleString()}원) → GA4가 차원 수에 따라 세션을 다르게 배분하고 있습니다.`,
    }, null, 2));
  } catch (err) {
    res.status(500).json({ error: err?.response?.data?.error?.message || err.message });
  }
}
