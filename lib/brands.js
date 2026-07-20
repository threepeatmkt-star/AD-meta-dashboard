/**
 * lib/brands.js — 브랜드 설정 (여기만 고치면 두 대시보드에 다 반영됩니다)
 *
 * 새 브랜드를 추가하려면 아래에 블록 하나만 복사해서 붙여넣으면 됩니다.
 * 이 파일에는 비밀값(토큰 등)을 절대 적지 마세요. → Vercel 환경변수로만 관리
 */

export const BRANDS = {
  samdae500: {
    id: 'samdae500',
    name: '삼대오백',
    nameEn: 'SAMDAE500',
    emoji: '💪',
    site: 'samdae500.com',
    desc: '헬스·피트니스 식품 / 건강기능식품',
    color: '#1877F2',       // 메인 색상 (버튼·뱃지)
    colorSoft: '#EFF6FF',   // 카드 배경
    logo: '/logo.png',
    // 광고세트명에서 뽑은 제품명 통합 규칙
    productRules: [
      { match: ['글리펌프', '글리아르'], as: '글리펌프+글리아르' },
      { match: ['실온닭가슴살'], as: '실온닭가슴살' },
    ],
  },

  mxssive: {
    id: 'mxssive',
    name: '엠엑시브',
    nameEn: 'MXSSIVE',
    emoji: '🏋️',
    site: 'mxssive.com',
    desc: '헬스·스포츠 장비 / 리프팅 기어',
    color: '#111827',
    colorSoft: '#F3F4F6',
    logo: '/logo-mxssive.png',
    productRules: [
      // 예시) 리프팅벨트 표기가 여러 개면 아래처럼 묶으면 됩니다
      // { match: ['리프팅벨트', '리프팅 벨트'], as: '리프팅벨트' },
    ],
  },
};

export const BRAND_LIST = Object.values(BRANDS);

export function getBrand(id) {
  return BRANDS[id] || null;
}

/** 광고세트명 → 제품명 추출 (예: "판매_리프팅벨트_A" → "리프팅벨트") */
export function extractProduct(name) {
  if (!name) return '-';
  const p = name.split('_');
  return p.length >= 2 ? p[1] : p[0];
}

/** 브랜드별 통합 규칙 적용 */
export function normalizeProduct(prod, brand) {
  if (!prod) return '-';
  const rules = brand?.productRules || [];
  for (const r of rules) {
    if (r.match.some(m => prod.includes(m))) return r.as;
  }
  return prod;
}

/** 캠페인 정렬 순서 (판매 → ASC → 전환 → 기타) */
export function campaignOrder(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('판매')) return 1;
  if (n.includes('asc')) return 2;
  if (n.includes('전환')) return 3;
  return 4;
}
