/**
 * pages/api/decisions.js — 결정보드 데이터
 * GET /api/decisions?brand=samdae500|mxssive&startDate=&endDate=
 *
 * 기간을 전반/후반으로 나눠 소재별로 점검하고,
 * 부장님 보고서 분류(늘리기 / 손보기 / 끄기 검토 / 유지)에 맞춰 자동 분류합니다.
 * - 매출: GA4 (수동 UTM 이름 매칭 + 메타 자동 UTM의 광고 ID 매칭)
 * - 참고: 메타 픽셀 ROAS, 빈도(피로도)
 */
import axios from 'axios';
import { parseUtm, matchRows, matchRevenue } from '../../lib/ga4Match';
import { resolveBrand } from '../../lib/brandEnv';
import { BRANDS } from '../../lib/brands';

const META_BASE = 'https://graph.facebook.com/v20.0';
const MIN_SPEND = 30000; // 이 금액 미만 소재는 "판단 보류(데이터 부족)"로 분류

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

// 메타 소재별 성과 (픽셀 구매가치·빈도 포함)
async function getMetaAds(cfg, startDate, endDate) {
  const rows = await fetchMetaPages(`${META_BASE}/act_${cfg.adAccountId}/insights`, {
    level: 'ad',
    fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,frequency,reach,impressions,inline_link_clicks,action_values',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: 200, access_token: cfg.metaToken,
  });
  return rows.map(r => {
    const purchase = (r.action_values || []).find(a => a.action_type === 'omni_purchase' || a.action_type === 'purchase');
    return {
      campaignName: r.campaign_name, adsetName: r.adset_name,
      campaignId: r.campaign_id, adsetId: r.adset_id,
      adId: r.ad_id, adName: r.ad_name,
      spend: parseFloat(r.spend) || 0,
      frequency: parseFloat(r.frequency) || 0,
      impressions: parseInt(r.impressions) || 0,
      reach: parseInt(r.reach) || 0,
      clicks: parseInt(r.inline_link_clicks) || 0,
      pixelRevenue: purchase ? parseFloat(purchase.value) || 0 : 0,
    };
  });
}

// 소재별 랜딩 URL·URL 매개변수 — UTM 설정 점검용
async function getAdTags(cfg) {
  try {
    const rows = await fetchMetaPages(`${META_BASE}/act_${cfg.adAccountId}/ads`, {
      fields: 'id,created_time,creative{url_tags,thumbnail_url,image_url,object_story_spec{link_data{link,picture},video_data{call_to_action,image_url}},asset_feed_spec{link_urls,images{url},videos{thumbnail_url}}}',
      thumbnail_width: 300, thumbnail_height: 300,
      filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
      limit: 200, access_token: cfg.metaToken,
    });
    return Object.fromEntries(rows.map(r => {
      const c = r.creative || {};
      const oss = c.object_story_spec || {};
      const afs = c.asset_feed_spec || {};
      const parts = [
        c.url_tags || '',
        oss.link_data?.link || '',
        oss.video_data?.call_to_action?.value?.link || '',
        ...((afs.link_urls || []).map(l => l.website_url || '')),
      ];
      const thumb = oss.video_data?.image_url || oss.link_data?.picture || afs.images?.[0]?.url
        || afs.videos?.[0]?.thumbnail_url || c.image_url || c.thumbnail_url || null;
      // 영상 소재 판별: 단일 영상(video_data) 또는 다이내믹 소재에 영상 에셋 포함
      const isVideo = !!(oss.video_data || (afs.videos && afs.videos.length));
      return [r.id, { tags: parts.join(' ').trim(), thumb, createdTime: r.created_time || null, isVideo }];
    }));
  } catch { return {}; }
}

// 광고세트·캠페인 일예산 (카드 표시용)
async function getBudgets(cfg) {
  try {
    const flt = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]);
    const [adsets, camps] = await Promise.all([
      fetchMetaPages(`${META_BASE}/act_${cfg.adAccountId}/adsets`, { fields: 'id,daily_budget', filtering: flt, limit: 200, access_token: cfg.metaToken }),
      fetchMetaPages(`${META_BASE}/act_${cfg.adAccountId}/campaigns`, { fields: 'id,daily_budget', filtering: flt, limit: 200, access_token: cfg.metaToken }),
    ]);
    return {
      adset: Object.fromEntries(adsets.map(a => [a.id, parseInt(a.daily_budget) || 0])),
      campaign: Object.fromEntries(camps.map(c => [c.id, parseInt(c.daily_budget) || 0])),
    };
  } catch { return { adset: {}, campaign: {} }; }
}

// GA4 매출 (캠페인+콘텐츠 차원) — 대시보드와 같은 매칭 규칙
async function getGA4Rows(cfg, startDate, endDate, ga4Token) {
  const { data } = await axios.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.ga4PropertyId}:runReport`,
    {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionManualAdContent' }],
      metrics: [{ name: 'purchaseRevenue' }, { name: 'sessions' }],
      limit: 5000,
    },
    { headers: { Authorization: `Bearer ${ga4Token}` }, timeout: 30000 }
  );
  return (data.rows || [])
    .filter(r => r.dimensionValues[0].value !== '(not set)' || r.dimensionValues[1].value !== '(not set)')
    .map(r => ({
      campaign: r.dimensionValues[0].value,
      ad: r.dimensionValues[1].value,
      revenue: parseFloat(r.metricValues[0].value) || 0,
      sessions: parseInt(r.metricValues[1]?.value) || 0,
    }));
}

const roas = (rev, spend) => (spend > 0 ? Math.round((rev / spend) * 1000) / 10 : 0);

function splitRange(startDate, endDate) {
  const s = new Date(startDate), e = new Date(endDate);
  const days = Math.round((e - s) / 86400000) + 1;
  const firstLen = Math.ceil(days / 2);
  const firstEnd = new Date(s.getTime() + (firstLen - 1) * 86400000);
  const secondStart = new Date(firstEnd.getTime() + 86400000);
  const fmt = d => d.toISOString().slice(0, 10);
  return days >= 2
    ? { a: [startDate, fmt(firstEnd)], b: [fmt(secondStart), endDate], split: true }
    : { a: [startDate, endDate], b: [startDate, endDate], split: false };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { startDate, endDate, brand = 'samdae500' } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: '날짜를 선택해주세요.' });

  const cfg = resolveBrand(brand);
  if (cfg.missing.length > 0)
    return res.status(500).json({ error: `환경변수 미설정: ${cfg.missing.join(', ')}` });

  const breakeven = BRANDS[cfg.brandId]?.breakeven || 300;

  try {
    const ga4Token = await getGA4AccessToken();
    const half = splitRange(startDate, endDate);

    const [adsFull, adsA, adsB, ga4Full, ga4A, ga4B, adTags, budgets] = await Promise.all([
      getMetaAds(cfg, startDate, endDate),
      half.split ? getMetaAds(cfg, half.a[0], half.a[1]) : Promise.resolve([]),
      half.split ? getMetaAds(cfg, half.b[0], half.b[1]) : Promise.resolve([]),
      getGA4Rows(cfg, startDate, endDate, ga4Token),
      half.split ? getGA4Rows(cfg, half.a[0], half.a[1], ga4Token) : Promise.resolve([]),
      half.split ? getGA4Rows(cfg, half.b[0], half.b[1], ga4Token) : Promise.resolve([]),
      getAdTags(cfg),
      getBudgets(cfg),
    ]);

    const mapById = rows => Object.fromEntries(rows.map(r => [r.adId, r]));
    const aById = mapById(adsA), bById = mapById(adsB);

    // 세트별 노출 합계 — '노출 못 받음' 판정용
    const adsetImp = {};
    const adsetAdCount = {};
    adsFull.forEach(a => {
      adsetImp[a.adsetId] = (adsetImp[a.adsetId] || 0) + a.impressions;
      adsetAdCount[a.adsetId] = (adsetAdCount[a.adsetId] || 0) + 1;
    });

    const items = adsFull.map(ad => {
      const adMeta = adTags[ad.adId] || {};
      const utm = parseUtm(adMeta.tags);
      const revenue = matchRevenue(ga4Full, ad, utm);
      const r = roas(revenue, ad.spend);
      const pixelRoas = roas(ad.pixelRevenue, ad.spend);

      const adA = aById[ad.adId], adB = bById[ad.adId];
      const revA = adA ? matchRevenue(ga4A, { ...ad, ...adA }, utm) : 0;
      const revB = adB ? matchRevenue(ga4B, { ...ad, ...adB }, utm) : 0;
      const roasA = adA ? roas(revA, adA.spend) : null;
      const roasB = adB ? roas(revB, adB.spend) : null;

      // ── 설정 오류 점검 ──
      const tagStr = (adMeta.tags || '').trim();
      // UTM이 실제로 작동하는지의 가장 확실한 증거: GA4에 이 광고 '이름'으로 매출/유입이 잡히는가
      // UTM 작동 증거 = GA4에 이 소재 이름(또는 링크의 utm_content)으로 유입이 잡히는가 (매출이 아니라 세션 기준)
      const nameMatchedSessions = matchRows(ga4Full, ad, utm).filter(g => g.ad !== ad.adId).reduce((s, g) => s + (g.sessions || 0), 0);
      const errors = [];
      if (!tagStr) {
        // 파트너십(크리에이터 계정) 광고 등은 메타 API가 URL 필드를 안 보여줌 → GA4 유입으로 교차 검증
        if (nameMatchedSessions < 5 && ad.spend >= MIN_SPEND) {
          errors.push({ k: 'utmUnknown', label: 'UTM 확인 불가', detail: '파트너십 광고 등은 URL을 API로 읽을 수 없어요. 이 기간 GA4에 이 소재 이름의 UTM 유입도 거의 없어서, 광고관리자에서 웹사이트 URL에 UTM이 붙어있는지 직접 확인해주세요 (UTM이 있어도 구매가 없었던 것뿐일 수 있어요)' });
        }
        // GA4에 이름으로 매출이 잡히면 UTM 정상 작동 → 오류 아님
      } else if (!/utm_/i.test(tagStr)) {
        errors.push({ k: 'noUtm', label: 'UTM 없음', detail: '랜딩 URL과 URL 매개변수 어디에도 UTM이 없어요 — 이 소재의 매출은 메타 자동 태그(ig/paid)나 바이럴로 흘러갑니다. 표준 UTM 템플릿을 넣어주세요 (기존 광고 URL 수정은 머신러닝 초기화 주의 → 신규 소재부터 적용 추천)' });
      } else if (!/utm_medium=cpm/i.test(tagStr)) {
        errors.push({ k: 'utmNonStd', label: 'UTM 비표준', detail: 'UTM은 있는데 utm_medium이 cpm이 아니에요 — DA 매출 집계 기준(cpm)과 어긋나 분류가 흔들릴 수 있어요' });
      }
      // GA4에 이 소재로 들어온 세션 수 (이름 매칭 + 광고ID 매칭) — 유입이 잡히면 추적은 정상
      const ga4Sessions = matchRows(ga4Full, ad, utm).reduce((s, g) => s + (g.sessions || 0), 0);
      const flagsPre = [];
      if (ad.spend >= MIN_SPEND && revenue === 0 && ad.pixelRevenue > 0) {
        if (ga4Sessions >= 5) {
          // 설정 오류 아님 — 유입은 정상, 실제 구매가 없는 상태
          flagsPre.push({ k: 'ga4NoBuy', label: 'GA4 구매 0 (유입 정상)', detail: `GA4에 이 소재 유입 ${ga4Sessions.toLocaleString('ko-KR')}세션이 정상 집계되고 있어요 — 추적 설정 문제가 아니라 실제 구매가 없는 상태예요. 픽셀 매출 ₩${Math.round(ad.pixelRevenue).toLocaleString('ko-KR')}은 광고를 본 사람이 다른 상품을 산 것·조회 후 구매까지 잡은 과집계일 가능성이 커요. 소재 문구(쿠폰·로그인 필요 혜택 등)와 랜딩 흐름을 점검하고, 개선이 어려우면 OFF 검토` });
        } else {
          errors.push({ k: 'ga4Zero', label: 'GA4 매출 0', detail: `픽셀엔 매출(₩${Math.round(ad.pixelRevenue).toLocaleString('ko-KR')})이 찍히는데 GA4에선 매출도 유입도 ${ga4Sessions}세션뿐이에요 — 추적 설정을 점검해주세요.`, steps: [
            "광고관리자에서 이 광고의 웹사이트 URL을 복사해 새 탭에 붙여넣고 접속해요",
            "최종 도착한 페이지의 주소창에 utm_source 같은 매개변수가 남아 있는지 확인해요 — 단축링크·기획전 리다이렉트를 거치며 사라졌다면, 광고의 최종 도착 URL에 UTM을 직접 붙여야 해요",
            "GA4 실시간 보고서를 열어둔 상태로 위 링크로 접속했을 때 유입(세션)이 잡히는지 확인해요 — 안 잡히면 자사몰 GA4 태그 문제예요",
            "집행 1~2일 차 소재라면 GA4 집계 지연(24~48시간)일 수 있어요 — 하루 뒤 다시 점검해요",
          ] });
        }
      }

      // ── 분류 ──
      const flags = [...flagsPre];
      const perfWeak = r < breakeven * 1.2 || (roasA != null && roasB != null && roasA > 0 && roasB < roasA * 0.7);
      if (ad.frequency >= 3.5 && perfWeak) flags.push({ k: 'fatigue', label: '피로 주의', detail: `빈도 ${ad.frequency.toFixed(1)} — 같은 사람에게 반복 노출되는 중인데 성과도 약해지고 있어요. 새 소재 교체 준비 추천 (빈도가 높아도 성과가 유지되는 소재엔 띄우지 않아요)` });

      // ── 퍼널 단계별 진단 ──
      const ctr = ad.impressions > 0 ? Math.round((ad.clicks / ad.impressions) * 10000) / 100 : 0;
      const totalImp = adsetImp[ad.adsetId] || 0;
      const impShare = totalImp > 0 ? Math.round((ad.impressions / totalImp) * 100) : 0;
      if ((adsetAdCount[ad.adsetId] || 1) >= 2 && totalImp >= 3000 && impShare < 10) {
        flags.push({ k: 'lowDelivery', label: '노출 못 받음', detail: `세트 내 노출 점유율 ${impShare}% (${ad.impressions.toLocaleString('ko-KR')}회) — 메타가 같은 세트의 다른 소재에 노출을 몰아주고 있어요. 소재가 나빠서가 아니라 평가 기회 자체를 못 받은 상태라, 성과 숫자로 판단하면 안 돼요. 이 소재를 밀어보고 싶으면 단독 광고세트로 분리하는 게 확실해요` });
      }
      if (ad.impressions >= 3000 && ctr < 0.5) {
        flags.push({ k: 'lowCtr', label: '클릭률 낮음', detail: `노출 ${ad.impressions.toLocaleString('ko-KR')}회를 받았는데 CTR ${ctr}% — 소재가 시선을 못 잡고 있어요 (계정 평균 약 1%). 썸네일·첫 문구·영상 첫 3초 후킹을 점검해주세요` });
      }
      if (ad.clicks >= 50 && revenue === 0 && ad.pixelRevenue === 0) {
        flags.push({ k: 'funnelLeak', label: '전환 퍼널 의심', detail: `클릭 ${ad.clicks}회가 들어왔는데 구매가 0이에요 (픽셀 기준도 0) — 소재 문제가 아니라 클릭 이후 단계 문제예요. 상세페이지 첫 화면·가격/옵션 구성·로딩 속도를 점검해주세요` });
      }

      let category, reason, options;
      const dropping = roasA != null && roasB != null && roasA > 0 && roasB < roasA * 0.6;

      if (ad.spend < MIN_SPEND && ad.clicks < 50) {
        category = 'hold';
        reason = `광고비 ${(Math.round(ad.spend / 1000) / 10).toLocaleString('ko-KR')}만원 · 클릭 ${ad.clicks}회 — 아직 데이터가 적어요 (광고비 3만원 또는 클릭 50회가 쌓이면 자동 판단돼요)`;
        options = ['더 지켜보기', '끄기'];
      } else if (flags.some(fl => fl.k === 'lowDelivery') && r < breakeven) {
        category = 'hold';
        reason = `세트 내 노출 점유율이 낮아 성과 평가가 불가능해요 — ROAS ${r}%는 소재 탓이 아니라 노출을 못 받은 탓일 수 있어요`;
        options = ['단독 세트로 분리 검토', '더 지켜보기', '끄기'];
      } else if (r < breakeven * 0.6) {
        category = 'off';
        reason = `ROAS ${r}%로 손익분기(${breakeven}%)의 60% 미만 — 쓸수록 손해`;
        options = ['끄기', '예산 축소', '보류'];
      } else if (r >= breakeven * 2 && (roasB == null || roasB >= breakeven)) {
        category = 'scale';
        reason = `ROAS ${r}%로 손익분기의 2배 이상${roasB != null ? ` · 후반에도 ${roasB}% 유지` : ''} — 예산 증액 후보`;
        options = ['예산 증액', '유지', '보류'];
      } else if (r < breakeven * 1.2 || dropping) {
        category = 'fix';
        reason = dropping
          ? `ROAS가 전반 ${roasA}% → 후반 ${roasB}%로 빠르게 하락 중`
          : `ROAS ${r}% — 손익분기(${breakeven}%) 근처라 여유가 없어요`;
        options = ['새 소재로 교체 준비', '예산 축소', '유지', '보류'];
      } else {
        category = 'keep';
        reason = `ROAS ${r}% — 손익분기 위에서 안정적`;
        options = ['유지', '예산 증액', '보류'];
      }

      // ── 🏆 확장 추천 (우수소재) 판정 ──
      // 기준: 운영 30일 이상 + 기간 광고비 5만원 이상 + ROAS 손익분기 2배 이상 + 후반에도 손익분기 유지
      const ageDays = adMeta.createdTime
        ? Math.floor((Date.now() - new Date(adMeta.createdTime).getTime()) / 86400000)
        : null;
      const winner =
        ageDays != null && ageDays >= 30 &&
        ad.spend >= 50000 &&
        r >= breakeven * 2 &&
        (roasB == null || roasB >= breakeven);

      return {
        adId: ad.adId, adName: ad.adName, campaignName: ad.campaignName, adsetName: ad.adsetName,
        adsetId: ad.adsetId, thumbnail: adMeta.thumb || null,
        ageDays, winner,
        isVideo: !!adMeta.isVideo || /video|reels|릴스/i.test(ad.adName || ''),
        dailyBudget: budgets.adset[ad.adsetId] || 0,
        campaignDailyBudget: budgets.campaign[ad.campaignId] || 0,
        spend: Math.round(ad.spend), revenue: Math.round(revenue), roas: r, clicks: ad.clicks,
        impressions: ad.impressions, reach: ad.reach,
        ctr: ad.impressions > 0 ? Math.round((ad.clicks / ad.impressions) * 10000) / 100 : 0,
        ga4Sessions, utmContent: utm.content, pixelRoas, frequency: Math.round(ad.frequency * 10) / 10,
        firstHalf: roasA != null ? { range: half.a, roas: roasA, spend: Math.round(adA.spend) } : null,
        secondHalf: roasB != null ? { range: half.b, roas: roasB, spend: Math.round(adB.spend) } : null,
        category, reason, options, flags, errors,
      };
    }).sort((x, y) => y.spend - x.spend);

    const count = c => items.filter(i => i.category === c).length;
    const totalSpend = items.reduce((s, i) => s + i.spend, 0);
    const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);

    res.json({
      brand: cfg.brandId, breakeven, adAccountId: cfg.adAccountId,
      period: { start: startDate, end: endDate, firstHalf: half.split ? half.a : null, secondHalf: half.split ? half.b : null },
      summary: {
        totalSpend, totalRevenue, totalRoas: roas(totalRevenue, totalSpend),
        counts: { off: count('off'), fix: count('fix'), scale: count('scale'), keep: count('keep'), hold: count('hold') },
        belowBreakeven: items.filter(i => i.spend >= MIN_SPEND && i.roas < breakeven).length,
        activeAds: items.length,
        errorAds: items.filter(i => i.errors.length > 0).length,
        winners: items.filter(i => i.winner).length,
      },
      items,
    });
  } catch (err) {
    console.error('[decisions API error]', err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data?.error?.message || err.message });
  }
}
