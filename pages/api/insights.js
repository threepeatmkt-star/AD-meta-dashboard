/**
 * pages/api/insights.js
 * Claude AI 인사이트 생성 엔드포인트
 * 환경변수: ANTHROPIC_API_KEY
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { data, level, dateRange } = req.body;
  if (!data || !data.length) return res.status(400).json({ error: '데이터가 없습니다.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY 환경변수가 없습니다.' });

  const summary = data.slice(0, 20).map(d => ({
    이름: d.name || d.product,
    광고비: Math.round(d.spend).toLocaleString(),
    매출액: Math.round(d.revenue).toLocaleString(),
    ROAS: d.roas + '%',
    클릭수: d.clicks,
    노출: d.impressions,
  }));

  const prompt = `당신은 디지털 마케팅 전문가입니다. 아래는 삼대오백(헬스/피트니스 식품 브랜드)의 Meta 광고 ${level === 'campaign' ? '캠페인' : level === 'adset' ? '광고세트' : '소재'}별 성과 데이터입니다. (조회 기간: ${dateRange})

데이터:
${JSON.stringify(summary, null, 2)}

ROAS 기준: 300% 이상 우수 / 150~299% 보통 / 150% 미만 주의

아래 형식으로 한국어 마케팅 인사이트를 작성해주세요:

**📊 전체 요약**
(2~3줄 요약)

**🏆 상위 성과**
(ROAS/매출 기준 잘 되고 있는 것 2~3개, 이유 분석)

**⚠️ 주의 필요**
(성과가 낮거나 예산 대비 효율이 떨어지는 것, 개선 제안)

**💡 액션 아이템**
(구체적인 다음 액션 2~3가지 bullet)

간결하고 실용적으로 작성해주세요.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const json = await response.json();
    const text = json.content?.[0]?.text || '인사이트를 생성할 수 없습니다.';
    res.json({ insight: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
