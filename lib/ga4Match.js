/**
 * lib/ga4Match.js — 메타 소재 ↔ GA4 매출 매칭 (대시보드·광고 진단 공용)
 * 매칭 순서: ① 캠페인명+소재명 ② 소재명 ③ 광고 링크의 utm_campaign+utm_content ④ 광고ID(메타 자동 태그)
 * ③은 소재명과 링크의 utm_content가 다른 경우(예: 소재명 image_b / utm_content image_b_2p2) 매출 누락 방지용
 */
import axios from 'axios';

const META_BASE = 'https://graph.facebook.com/v20.0';

export function parseUtm(tagStr) {
  const get = k => {
    const m = (tagStr || '').match(new RegExp(`(?:^|[?&\\s])${k}=([^&\\s]+)`));
    if (!m) return null;
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch { return m[1]; }
  };
  return { campaign: get('utm_campaign'), content: get('utm_content') };
}

export function matchRows(ga4Rows, ad, utm) {
  let rows = ga4Rows.filter(g => g.campaign === ad.campaignName && g.ad === ad.adName);
  if (!rows.length) rows = ga4Rows.filter(g => g.ad === ad.adName && g.ad !== '(not set)');
  if (!rows.length && utm?.content && utm.content !== ad.adName)
    rows = ga4Rows.filter(g => g.ad === utm.content && (!utm.campaign || g.campaign === utm.campaign));
  return [...rows, ...ga4Rows.filter(g => g.ad === ad.adId)];
}

export function matchRevenue(ga4Rows, ad, utm) {
  return matchRows(ga4Rows, ad, utm).reduce((s, g) => s + g.revenue, 0);
}

/** 광고 ID 목록 → 링크·URL 매개변수 문자열 (50개씩 ids 배치 조회) */
export async function getAdLinkTags(adIds, token) {
  const out = {};
  const ids = [...new Set(adIds)].filter(Boolean);
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const { data } = await axios.get(`${META_BASE}/`, {
        params: {
          ids: ids.slice(i, i + 50).join(','),
          fields: 'creative{url_tags,object_story_spec{link_data{link},video_data{call_to_action}},asset_feed_spec{link_urls}}',
          access_token: token,
        }, timeout: 30000,
      });
      Object.entries(data || {}).forEach(([id, a]) => {
        const c = a.creative || {};
        const oss = c.object_story_spec || {};
        out[id] = [
          c.url_tags || '', oss.link_data?.link || '', oss.video_data?.call_to_action?.value?.link || '',
          ...((c.asset_feed_spec?.link_urls || []).map(l => l.website_url || '')),
        ].join(' ').trim();
      });
    } catch { /* 일부 실패해도 이름 매칭으로 진행 */ }
  }
  return out;
}
