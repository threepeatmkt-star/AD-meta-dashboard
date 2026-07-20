/**
 * lib/brandEnv.js — 서버 전용. 브랜드 → 환경변수 매핑
 *
 * [삼대오백] 기존 환경변수를 그대로 사용합니다 (변경 없음)
 *   META_AD_ACCOUNT_ID, GA4_PROPERTY_ID
 *
 * [엠엑시브] 아래 2개를 Vercel에 새로 추가하세요
 *   META_AD_ACCOUNT_ID_MXSSIVE = 2533287030211029
 *   GA4_PROPERTY_ID_MXSSIVE    = 468588776
 *
 * META_ACCESS_TOKEN / GA4_* 인증정보는 공용입니다.
 * 만약 엠엑시브가 다른 비즈니스 관리자라 별도 토큰이 필요하면
 * META_ACCESS_TOKEN_MXSSIVE 를 추가하면 자동으로 그걸 씁니다.
 */

const MAP = {
  samdae500: {
    adAccountId: () => process.env.META_AD_ACCOUNT_ID,
    metaToken: () => process.env.META_ACCESS_TOKEN_SAMDAE500 || process.env.META_ACCESS_TOKEN,
    ga4PropertyId: () => process.env.GA4_PROPERTY_ID,
  },
  mxssive: {
    adAccountId: () => process.env.META_AD_ACCOUNT_ID_MXSSIVE,
    metaToken: () => process.env.META_ACCESS_TOKEN_MXSSIVE || process.env.META_ACCESS_TOKEN,
    ga4PropertyId: () => process.env.GA4_PROPERTY_ID_MXSSIVE,
  },
};

/** act_ 접두어가 붙어있든 아니든 숫자만 반환 */
function cleanAcct(v) {
  return String(v || '').replace(/^act_/, '').trim();
}

export function resolveBrand(brandId) {
  const key = MAP[brandId] ? brandId : 'samdae500'; // 없으면 기존 동작 유지
  const m = MAP[key];

  const adAccountId = cleanAcct(m.adAccountId());
  const metaToken = m.metaToken();
  const ga4PropertyId = m.ga4PropertyId();

  const missing = [];
  if (!adAccountId) missing.push(key === 'mxssive' ? 'META_AD_ACCOUNT_ID_MXSSIVE' : 'META_AD_ACCOUNT_ID');
  if (!metaToken) missing.push('META_ACCESS_TOKEN');
  if (!ga4PropertyId) missing.push(key === 'mxssive' ? 'GA4_PROPERTY_ID_MXSSIVE' : 'GA4_PROPERTY_ID');
  if (!process.env.GA4_CLIENT_ID) missing.push('GA4_CLIENT_ID');
  if (!process.env.GA4_CLIENT_SECRET) missing.push('GA4_CLIENT_SECRET');
  if (!process.env.GA4_REFRESH_TOKEN) missing.push('GA4_REFRESH_TOKEN');

  return { brandId: key, adAccountId, metaToken, ga4PropertyId, missing };
}

/** GA4 SNS 채널 판별 정규식 (두 브랜드 공통) */
export const SNS_REGEX = '.*fb.*|.*insta.*|.*ig.*|.*l\\.instagram.*';
