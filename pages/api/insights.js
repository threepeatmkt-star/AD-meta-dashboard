/**
 * pages/api/insights.js — 규칙 기반 무료 인사이트
 * Anthropic API 키 불필요
 */
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { data, level } = req.body;
  if (!data || !data.length) return res.status(400).json({ error: '데이터가 없습니다.' });

  const levelName = level === 'campaign' ? '캠페인' : level === 'adset' ? '광고세트' : '소재';
  const insights = [];

  // ── 기본 통계 ──────────────────────────────────────────────────
  const totalSpend = data.reduce((s,d) => s+d.spend, 0);
  const totalRevenue = data.reduce((s,d) => s+d.revenue, 0);
  const totalRoas = totalSpend > 0 ? totalRevenue/totalSpend*100 : 0;
  const totalImpressions = data.reduce((s,d) => s+d.impressions, 0);
  const totalClicks = data.reduce((s,d) => s+d.clicks, 0);
  const avgCtr = totalImpressions > 0 ? totalClicks/totalImpressions*100 : 0;

  const sorted = [...data].sort((a,b) => b.roas - a.roas);
  const bySpend = [...data].sort((a,b) => b.spend - a.spend);
  const byRevenue = [...data].sort((a,b) => b.revenue - a.revenue);

  const krw = n => '₩'+Math.round(n).toLocaleString('ko-KR');
  const pct = n => n.toFixed(1)+'%';

  // ── 📊 전체 요약 ───────────────────────────────────────────────
  const roasLevel = totalRoas >= 300 ? '우수' : totalRoas >= 150 ? '보통' : '주의 필요';
  const roasEmoji = totalRoas >= 300 ? '🟢' : totalRoas >= 150 ? '🟡' : '🔴';
  insights.push({
    type: 'summary',
    title: '📊 전체 요약',
    items: [
      `총 광고비 ${krw(totalSpend)} 대비 매출 ${krw(totalRevenue)}, ROAS ${pct(totalRoas)} → ${roasEmoji} ${roasLevel}`,
      `전체 ${data.length}개 ${levelName} 운영 중, 평균 CTR ${pct(avgCtr)}`,
      totalRoas >= 300
        ? '전반적으로 효율이 좋은 상태입니다. 예산 확대를 검토해볼 시점이에요.'
        : totalRoas >= 150
        ? '평균적인 효율입니다. 하위 성과 항목 점검이 필요해요.'
        : '전반적인 ROAS가 낮습니다. 소재 교체 및 타겟 재설정이 필요해요.',
    ]
  });

  // ── 🏆 상위 성과 ───────────────────────────────────────────────
  const topRoas = sorted.filter(d => d.roas > 0).slice(0, 3);
  if (topRoas.length > 0) {
    insights.push({
      type: 'top',
      title: '🏆 상위 성과',
      items: topRoas.map(d => {
        const name = d.name || d.product || '-';
        const ctr = d.impressions > 0 ? (d.clicks/d.impressions*100).toFixed(2) : '0';
        return `${name.length > 20 ? name.slice(0,20)+'…' : name} — ROAS ${d.roas}% / 매출 ${krw(d.revenue)} / CTR ${ctr}%`;
      })
    });
  }

  // ── ⚠️ 주의 필요 ───────────────────────────────────────────────
  const warnings = [];
  const lowRoas = data.filter(d => d.spend > 0 && d.roas < 150 && d.roas > 0);
  const zeroRevenue = data.filter(d => d.spend > 5000 && d.revenue === 0);
  const lowCtr = data.filter(d => d.impressions > 1000 && (d.clicks/d.impressions*100) < 0.3);
  const highSpendLowRoas = data.filter(d => d.spend > totalSpend * 0.2 && d.roas < 150);

  if (zeroRevenue.length > 0)
    warnings.push(`매출 0원인데 광고비 지출 중인 ${levelName} ${zeroRevenue.length}개 → 즉시 점검 필요`);
  if (highSpendLowRoas.length > 0)
    warnings.push(`전체 예산의 20% 이상 소진 중인데 ROAS 150% 미만: ${highSpendLowRoas.map(d=>(d.name||d.product||'').slice(0,15)).join(', ')}`);
  if (lowRoas.length > 0)
    warnings.push(`ROAS 150% 미만 ${levelName} ${lowRoas.length}개 — 소재 교체 또는 타겟 조정 검토`);
  if (lowCtr.length > 0)
    warnings.push(`CTR 0.3% 미만(노출 대비 클릭 저조) ${levelName} ${lowCtr.length}개 — 광고 소재 매력도 개선 필요`);

  if (warnings.length > 0) {
    insights.push({ type: 'warning', title: '⚠️ 주의 필요', items: warnings });
  }

  // ── 💡 액션 아이템 ─────────────────────────────────────────────
  const actions = [];
  const top1 = sorted[0];
  const bottom1 = sorted.filter(d=>d.spend>0).slice(-1)[0];

  if (top1 && top1.roas >= 300)
    actions.push(`✅ "${(top1.name||top1.product||'').slice(0,15)}" ROAS ${top1.roas}% — 예산 10~20% 증액 고려`);

  if (bottom1 && bottom1.roas < 150 && bottom1.spend > 10000)
    actions.push(`🔻 "${(bottom1.name||bottom1.product||'').slice(0,15)}" ROAS ${bottom1.roas}% — 예산 축소 또는 일시 중지 검토`);

  const highCtrLowRevenue = data.filter(d => d.impressions > 500 && (d.clicks/d.impressions*100) > 1 && d.revenue === 0);
  if (highCtrLowRevenue.length > 0)
    actions.push(`🎯 클릭률은 높지만 매출 없는 ${levelName} ${highCtrLowRevenue.length}개 — 랜딩페이지 전환율 점검 필요`);

  const avgSpend = totalSpend / data.length;
  const underBudget = data.filter(d => d.roas >= 300 && d.spend < avgSpend * 0.5);
  if (underBudget.length > 0)
    actions.push(`💰 ROAS 우수하지만 예산 적은 ${levelName} ${underBudget.length}개 → 예산 재분배 기회`);

  if (actions.length === 0)
    actions.push('현재 데이터 기준 추가 액션 없음. 트렌드 지속 모니터링을 권장해요.');

  insights.push({ type: 'action', title: '💡 액션 아이템', items: actions });

  res.json({ insights });
}
