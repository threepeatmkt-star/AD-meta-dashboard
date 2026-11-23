/**
 * components/DecisionBoard.jsx — 광고 진단 (구 결정보드)
 * 소재별 자동 점검 → 설정 오류 / 끄기 검토 / 손보기 / 늘리기 분류 → 결정만 누르면 기록.
 * 결정 기록은 브라우저(localStorage)에 저장됩니다. (자동 반영은 추후)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { BRAND_LIST } from '../lib/brands';

const BOARD_NAME = '광고 진단';
const adsManagerUrl = (accountId, adId) =>
  `https://adsmanager.facebook.com/adsmanager/manage/ads/edit?act=${accountId}&selected_ad_ids=${adId}`;
const krw = v => '₩' + Math.round(v || 0).toLocaleString('ko-KR');
const man = v => `${(Math.round((v || 0) / 1000) / 10).toLocaleString('ko-KR')}만원`;

function getPresetRange(preset) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysAgo = n => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };
  switch (preset) {
    case 'last7': return [fmt(daysAgo(7)), fmt(daysAgo(1))];
    case 'last30': return [fmt(daysAgo(30)), fmt(daysAgo(1))];
    case 'thisMonth': return [fmt(new Date(now.getFullYear(), now.getMonth(), 1)), fmt(now)];
    case 'lastMonth': return [fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)), fmt(new Date(now.getFullYear(), now.getMonth(), 0))];
    case 'last14': default: return [fmt(daysAgo(14)), fmt(daysAgo(1))];
  }
}
const rangeDays = (s, e) => Math.round((new Date(e) - new Date(s)) / 86400000) + 1;

const CATS = {
  off:   { label: 'OFF 검토',    emoji: '🔴', desc: '손익분기 한참 아래 — 쓸수록 손해', color: '#DC2626', soft: '#FEF2F2' },
  fix:   { label: '개선 필요',   emoji: '🟠', desc: '효율이 떨어지는 중이거나 손익분기 근처', color: '#D97706', soft: '#FFFBEB' },
  scale: { label: '증액 검토', emoji: '🟢', desc: '효율 좋고 아직 여유 있음 — 증액 후보', color: '#059669', soft: '#ECFDF5' },
  keep:  { label: '유지',       emoji: '🔵', desc: '손익분기 위에서 안정적', color: '#2563EB', soft: '#EFF6FF' },
  hold:  { label: '판단 보류',   emoji: '⚪', desc: '광고비가 적어 데이터 부족', color: '#6B7280', soft: '#F9FAFB' },
};
const CAT_ORDER = ['off', 'fix', 'scale', 'keep', 'hold'];

/* 캠페인 › 광고세트 › 소재 경로 표시 — 어디 소속인지 한눈에 */
function AdPath({ item, size = 'md' }) {
  return (
    <div className={`flex items-center flex-wrap gap-x-1.5 gap-y-1 ${size === 'md' ? 'mb-1.5' : ''}`}>
      <span className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-sm font-bold whitespace-nowrap">📊 {item.campaignName}</span>
      <span className="text-gray-300 text-sm">›</span>
      <span className="px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 text-sm font-bold whitespace-nowrap">🎯 {item.adsetName}</span>
      {(item.dailyBudget > 0 || item.campaignDailyBudget > 0) && (
        <span className="px-2.5 py-1 rounded-md bg-gray-100 text-gray-500 text-sm font-semibold whitespace-nowrap">
          일예산 {man(item.dailyBudget > 0 ? item.dailyBudget : item.campaignDailyBudget)}{item.dailyBudget > 0 ? '' : ' (캠페인)'}
        </span>
      )}
    </div>
  );
}

function InfoTip({ lines }) {
  return (
    <span className="relative group cursor-help inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-300 text-white text-[11px] font-bold leading-none shrink-0">i
      <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block w-80 bg-gray-900 text-white text-xs font-medium rounded-xl px-4 py-3 leading-relaxed z-40 shadow-xl whitespace-normal text-left">
        {lines.map((l, i) => <span key={i} className="block mb-1.5 last:mb-0">{l}</span>)}
      </span>
    </span>
  );
}

const REAL_ACTIONS = { '끄기': 'pause_ad', '예산 축소': 'budget_down', '예산 증액': 'budget_up' };

/* 🏆 확장 추천 카드 — 장수 고효율 승자 소재. 브리프 복사 → Claude 채팅에 붙여넣으면 유사 구조 신규 소재 제작 */
function WinnerCard({ item, period, adAccountId }) {
  const [copied, setCopied] = useState(false);
  const head = [
    item.isVideo ? '[영상 소재 확장 브리프]' : '[이미지 소재 확장 브리프]',
    `승자 소재: ${item.adName} (${item.isVideo ? '영상' : '이미지'})`,
    `위치: ${item.campaignName} › ${item.adsetName}`,
    `성과(${period.start}~${period.end}): 광고비 ${krw(item.spend)} · GA4 매출 ${krw(item.revenue)} · ROAS ${item.roas}% · 운영 ${item.ageDays}일째`,
    item.thumbnail ? `썸네일: ${item.thumbnail}` : null,
    '---',
  ];
  const body = item.isVideo ? [
    '확장 제품명: ',
    '소구포인트 (1~3개): ',
    '오퍼(가격/구성): ',
    '촬영 소스: (체험단·선수 실촬영본 첨부 / 없으면 "없음")',
    '원본 승자 영상 파일: (광고관리자에서 받아 첨부 — 구조 분석용)',
    '길이: 15초 / 비율: 9:16 (릴스·스토리)',
    '엔딩: 블랙 전환 + 브랜드 로고',
  ] : [
    '확장 제품명: ',
    '소구포인트 (1~3개): ',
    '오퍼(가격/구성 — 수량 꼭 기재, 예: 24캔): ',
    '제품 누끼 PNG: (첨부)',
    '비율: 1:1 / 변형 수: 3종',
  ];
  const brief = [...head, ...body].filter(Boolean).join('\n');

  const copy = async () => {
    try { await navigator.clipboard.writeText(brief); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = brief; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="rounded-2xl bg-white border-2 border-amber-300 px-5 py-4">
      <div className="flex items-start gap-4">
        {item.thumbnail
          ? <img src={item.thumbnail} alt="" className="w-20 h-20 rounded-xl object-cover border border-amber-100 shrink-0 bg-gray-50"/>
          : <div className="w-20 h-20 rounded-xl bg-gray-100 shrink-0 flex items-center justify-center text-gray-300 text-[10px]">이미지<br/>없음</div>}
        <div className="min-w-0 flex-1">
          <AdPath item={item} size="sm"/>
          <p className="text-lg font-extrabold text-gray-900 mt-1 flex items-center gap-2">
            🏆 {item.adName}
            <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${item.isVideo ? 'bg-purple-50 text-purple-700' : 'bg-sky-50 text-sky-700'}`}>
              {item.isVideo ? '🎬 영상' : '🖼 이미지'}
            </span>
          </p>
          <p className="text-[15px] text-gray-600 mt-1.5 leading-relaxed">
            운영 <b>{item.ageDays}일째</b> · ROAS <b className="text-amber-600">{item.roas}%</b> (손익분기 2배 이상)
            {item.secondHalf ? <> · 후반에도 <b>{item.secondHalf.roas}%</b> 유지</> : null}
            {' '}— 검증된 구조예요. 이 공식으로 다른 제품 소재를 확장해보세요.
          </p>
          <p className="text-sm text-gray-400 mt-1">광고비 {man(item.spend)} · 매출 {man(item.revenue)} · 클릭 {(item.clicks || 0).toLocaleString('ko-KR')}회 (CTR {item.ctr}%)</p>
        </div>
        <div className="shrink-0 flex flex-col gap-2">
          <button onClick={copy}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-colors ${copied ? 'bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
            {copied ? '✓ 복사됨!' : '📋 확장 브리프 복사'}
          </button>
          {adAccountId && (
            <a href={adsManagerUrl(adAccountId, item.adId)} target="_blank" rel="noreferrer"
              className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-600 hover:border-gray-400 bg-white text-center whitespace-nowrap">
              광고관리자 ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function DecisionCard({ item, brand, decision, onDecide, adAccountId, onReload, siblingCount }) {
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState(decision?.memo || '');
  const [applying, setApplying] = useState(null);
  const cat = CATS[item.category];

  const decide = async (opt) => {
    const act = REAL_ACTIONS[opt];
    if (!act) { onDecide(item.adId, { choice: opt, memo, at: new Date().toISOString() }); return; }
    let confirmMsg;
    if (act === 'pause_ad') {
      confirmMsg = `소재 "${item.adName}"를 메타에서 실제로 OFF(일시중지)할까요?\n(이 소재 1개만 꺼지고, 같은 세트의 다른 소재는 그대로예요)`;
    } else {
      const dir = act === 'budget_down' ? '축소' : '증액';
      const next = act === 'budget_down' ? Math.max(10000, item.dailyBudget - 10000) : item.dailyBudget + 10000;
      confirmMsg = `⚠ 예산은 소재가 아니라 "광고세트" 단위로 적용돼요.\n\n광고세트 "${item.adsetName}"\n일예산 ${dir}: ${man(item.dailyBudget)} → ${man(next)}\n\n이 세트에 켜진 소재 ${siblingCount || 1}개 전체에 영향이 갑니다. 진행할까요?`;
    }
    if (!window.confirm(confirmMsg)) return;
    setApplying(opt);
    try {
      const r = await fetch('/api/ad-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brand.id, action: act, adId: item.adId, adsetId: item.adsetId }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      onDecide(item.adId, { choice: opt, memo, at: new Date().toISOString(), applied: true, result: j.message });
      if (act === 'pause_ad' && onReload) setTimeout(onReload, 1500);
    } catch (e) {
      alert('메타 반영 실패: ' + e.message + '\n(결정 기록만 저장할게요)');
      onDecide(item.adId, { choice: opt, memo, at: new Date().toISOString() });
    } finally { setApplying(null); }
  };

  return (
    <div className={`rounded-2xl border-2 bg-white overflow-hidden transition-shadow ${decision ? 'opacity-75' : 'hover:shadow-md'}`}
      style={{ borderColor: decision ? '#E5E7EB' : cat.color + '55' }}>
      <button onClick={() => setOpen(!open)} className="w-full text-left px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          {item.thumbnail
            ? <img src={item.thumbnail} alt="" className="w-16 h-16 rounded-xl object-cover border border-gray-100 shrink-0 bg-gray-50"/>
            : <div className="w-16 h-16 rounded-xl bg-gray-100 shrink-0 flex items-center justify-center text-gray-300 text-[10px]">이미지<br/>없음</div>}
          <div className="min-w-0 flex-1">
            <AdPath item={item}/>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-lg font-extrabold text-gray-900">{item.adName}</p>
              {decision && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-900 text-white">✓ {decision.choice}{decision.applied ? ' · 메타 반영됨' : ''}</span>}
            </div>
            {(item.errors.length > 0 || item.flags.length > 0) && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                {item.errors.map(f => (
                  <span key={f.k} className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">🚨 {f.label}</span>
                ))}
                {item.flags.map(f => (
                  <span key={f.k} className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">⚠ {f.label}</span>
                ))}
              </div>
            )}
            <p className="text-[15px] text-gray-600 mt-2 leading-relaxed">{item.reason}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-extrabold leading-tight" style={{ color: cat.color }}>{item.roas}%</p>
            <p className="text-sm text-gray-500 font-semibold mt-0.5">광고비 {man(item.spend)}</p>
            <p className="text-sm text-gray-500 font-semibold mt-0.5">매출 {item.revenue > 0 ? man(item.revenue) : '0원'}</p>
            <p className="text-xs text-gray-300 mt-1">{open ? '▲ 접기' : '▼ 근거·결정'}</p>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 bg-gray-50/50">
          {/* 근거 수치 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div className="rounded-xl bg-white border border-gray-100 px-3 py-2.5">
              <p className="text-xs text-gray-400">GA4 매출 (UTM+광고ID 매핑)</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{krw(item.revenue)}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 px-3 py-2.5">
              <p className="text-xs text-gray-400">노출 / 도달</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{(item.impressions || 0).toLocaleString('ko-KR')} / {(item.reach || 0).toLocaleString('ko-KR')}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 px-3 py-2.5">
              <p className="text-xs text-gray-400">클릭 (CTR)</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{(item.clicks || 0).toLocaleString('ko-KR')} <span className="text-sm text-gray-500">({item.ctr || 0}%)</span></p>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 px-3 py-2.5 overflow-visible">
              <p className="text-xs text-gray-400 flex items-center gap-1.5">빈도
                <span className="relative group cursor-help inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-300 text-white text-[10px] font-bold leading-none">i
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 bg-gray-900 text-white text-xs font-medium rounded-xl px-3.5 py-3 leading-relaxed z-30 shadow-xl whitespace-normal">
                    이 기간에 한 사람이 이 광고를 평균 몇 번 봤는지예요. 3.5를 넘으면 볼 사람은 이미 다 봤다는 신호 — 효율이 떨어지기 전에 새 소재 교체를 준비할 타이밍이에요.
                  </span>
                </span>
              </p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{item.frequency}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 px-3 py-2.5 col-span-2 sm:col-span-1">
              <p className="text-xs text-gray-400">기간 내 추이</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{item.firstHalf && item.secondHalf
                ? `${item.firstHalf.roas}% → ${item.secondHalf.roas}% ${item.secondHalf.roas < item.firstHalf.roas ? '▼' : '▲'}`
                : '—'}</p>
            </div>
          </div>
          {item.errors.map(f => (
            <div key={f.k} className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-2 leading-relaxed">
              <p>🚨 <b>{f.label}</b> — {f.detail}</p>
              {f.steps && (
                <ol className="mt-2.5 space-y-2">
                  {f.steps.map((st, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                      <span>{st}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
          {item.flags.map(f => (
            <p key={f.k} className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-2 leading-relaxed">⚠ <b>{f.label}</b> — {f.detail}</p>
          ))}

          {/* 결정 */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {item.options.map(opt => (
              <button key={opt} disabled={applying !== null}
                onClick={() => decide(opt)}
                className={`px-5 py-2.5 rounded-xl text-[15px] font-bold border-2 transition-colors disabled:opacity-50 ${decision?.choice === opt ? 'text-white' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
                style={decision?.choice === opt ? { background: brand.color, borderColor: brand.color } : {}}>
                {applying === opt ? '반영 중…' : <>{opt}{REAL_ACTIONS[opt] ? ' ⚡' : ''}</>}
              </button>
            ))}
            {decision && (
              <button onClick={() => onDecide(item.adId, null)}
                className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-400 hover:text-gray-600">
                결정 취소
              </button>
            )}
            {adAccountId && (
              <a href={adsManagerUrl(adAccountId, item.adId)} target="_blank" rel="noreferrer"
                className="ml-auto px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-600 hover:border-gray-400 bg-white">
                광고관리자에서 열기 ↗
              </a>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-400">⚡ 버튼은 메타에 실제 반영 · 끄기 = 이 소재만 OFF · 예산 축소/증액 = 광고세트 전체({siblingCount || 1}개 소재) 일예산 ±1만원</p>
          <input value={memo} onChange={e => setMemo(e.target.value)}
            onBlur={() => decision && onDecide(item.adId, { ...decision, memo })}
            placeholder="메모 (선택) — 예: 다음 주까지 지켜보고 끄기"
            className="mt-3 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"/>
        </div>
      )}
    </div>
  );
}

/* 📖 소재 확장 가이드 — 팀 누구나 같은 순서로 제작할 수 있게 */
function GuideModal({ onClose }) {
  const Step = ({ n, children }) => (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">{n}</span>
      <span className="text-[15px] text-gray-700 leading-relaxed">{children}</span>
    </li>
  );
  const Box = ({ title, children }) => (
    <div className="rounded-2xl border border-gray-200 p-5 mb-4">
      <p className="text-base font-extrabold text-gray-900 mb-3">{title}</p>
      {children}
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <p className="text-xl font-extrabold text-gray-900">📖 소재 확장 가이드</p>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold">✕</button>
        </div>

        <Box title="🖼 이미지 소재 — 승자 구조 복제">
          <ol className="space-y-2.5">
            <Step n="1">기간을 <b>최근 30일</b>로 두고 🏆 확장 추천에서 <b>🖼 이미지</b> 소재 선택 (짧은 기간은 반짝 소재가 섞임)</Step>
            <Step n="2"><b>[📋 확장 브리프 복사]</b> 클릭</Step>
            <Step n="3">Claude 채팅(프로젝트: 나형 - 메타광고 대시보드)에 붙여넣고 빈칸 작성 — 확장 제품명 · 소구포인트 1~3개 · 오퍼 (<b>수량 필수</b>, 예: 24캔 22,900원)</Step>
            <Step n="4"><b>제품 누끼 PNG 첨부</b> (폰트는 구글 드라이브 폰트 폴더에서 자동 사용 — 첨부 불필요)</Step>
            <Step n="5">1:1 시안 3종 수령 → 수정 사항만 말하면 즉시 재렌더 (크레딧 0)</Step>
            <Step n="6">확정본 메타 업로드 → 다음 주부터 광고 진단에서 노출·성과 확인</Step>
          </ol>
        </Box>

        <Box title="🎬 영상 소재 — 실촬영본 편집이 메인">
          <p className="text-sm font-bold text-gray-900 mb-2">① 실촬영본 + 편집 (메인)</p>
          <ul className="text-[15px] text-gray-700 leading-relaxed space-y-1.5 mb-4 pl-1">
            <li>• <b>후원선수 PPL 편집</b> — 릴스형. 상단 후킹 2줄 + 하단 제품·쿠폰가 카드</li>
            <li>• <b>체험단 블로그 영상/GIF 컷편집</b> — Claude가 네이버에서 체험단 글만 수집 → 4컷 × 3~4초 + 자막 + 오퍼 뱃지. <b>출처 표기 필수</b> ("출처: 네이버 블로그 ○○")</li>
            <li>• <b>직접 촬영본</b> — 원본 파일 첨부하면 같은 방식으로 편집</li>
          </ul>
          <p className="text-sm font-bold text-gray-900 mb-2">② AI 영상 (서브)</p>
          <ul className="text-[15px] text-gray-700 leading-relaxed space-y-1.5 pl-1">
            <li>• 제품 클로즈업 B롤 · 엔딩 제작 전용</li>
            <li>• 유사 제품군 템플릿이 있을 때만 제품(+배경) 교체 — <b>완전 신규 생성 금지</b> (AI티 남)</li>
          </ul>
          <p className="text-sm text-gray-500 mt-3">요청 방법: 🎬 영상 소재의 확장 브리프 복사 → 채팅에 붙여넣기 → 제품명·소구포인트·오퍼 작성 (체험단 수집은 Claude가 진행)</p>
        </Box>

        <Box title="✅ 공통 규칙">
          <ul className="text-[15px] text-gray-700 leading-relaxed space-y-1.5 pl-1">
            <li>• 성분 수치는 <b>제품 라벨에 실제 표기된 것만</b></li>
            <li>• 과대광고 금지: 치료·완치·의약품 효능 표현 불가, 체중 감량 암시 회피</li>
            <li>• 구성 수량(24캔 등) 반드시 노출 — 가격만 쓰면 단품가로 오해</li>
            <li>• 엔딩은 <b>제품/브랜드별 전용</b> 사용 (바이퍼 엔딩을 다른 제품에 쓰지 않기)</li>
          </ul>
        </Box>

        <p className="text-xs text-gray-400">상세 플레이북: 프로젝트 문서 "소재-확장-파이프라인-플레이북" · 저장소 creative-pipeline/README.md</p>
      </div>
    </div>
  );
}

function CriteriaModal({ bk, onClose }) {
  const Row = ({ c }) => (
    <tr className="border-t border-gray-100">
      {c.map((v, i) => <td key={i} className={`px-3 py-2.5 align-top text-sm ${i === 0 ? 'whitespace-nowrap font-bold' : 'text-gray-600 leading-relaxed'}`}>{v}</td>)}
    </tr>
  );
  const Table = ({ title, head, rows }) => (
    <div className="mb-6">
      <p className="text-base font-extrabold text-gray-900 mb-2">{title}</p>
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>{head.map(h => <th key={h} className="px-3 py-2 text-xs font-bold text-gray-500">{h}</th>)}</tr>
          </thead>
          <tbody className="bg-white">{rows.map((c, i) => <Row key={i} c={c}/>)}</tbody>
        </table>
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xl font-extrabold text-gray-900">📋 광고 진단 공식 기준표</p>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold">✕</button>
        </div>

        <Table title={`① 분류 기준 — 위에서부터 순서대로 판정해요 (손익분기 ${bk}% 기준)`}
          head={['분류', '조건', '의미']}
          rows={[
            ['⚪ 판단 보류 (데이터 부족)', '광고비 3만원 미만 AND 클릭 50회 미만', `표본이 작아 판단 불가 — ROAS가 1,000%여도 구매 1~2건짜리 숫자라 믿으면 안 돼요. 광고비 3만원 또는 클릭 50회부터 자동 판정`],
            ['⚪ 판단 보류 (노출 못 받음)', `세트 내 노출 점유율 10% 미만 AND ROAS ${bk}% 미만`, '메타가 노출을 안 줘서 평가 기회가 없었던 소재 — 숫자가 나빠도 소재 탓 아님. 밀어보려면 단독 세트 분리'],
            ['🔴 OFF 검토', `ROAS < ${Math.round(bk * 0.6)}% (손익분기의 60%)`, '충분히 평가받았는데 쓸수록 손해'],
            ['🟢 증액 검토', `ROAS ≥ ${bk * 2}% (손익분기의 2배) AND 기간 후반에도 손익분기 위`, '검증 끝 + 안 꺾임 — 예산 증액 후보'],
            ['🟠 개선 필요', `ROAS < ${Math.round(bk * 1.2)}% (손익분기의 1.2배) 또는 전반→후반 40% 이상 급락`, '이익 여유가 없거나 꺾이는 중'],
            ['🔵 유지', '위에 안 걸린 나머지 (손익분기의 1.2~2배 안정)', '이익은 나지만 증액 근거까진 아님'],
          ]}/>

        <Table title="② 플래그(⚠) — 분류와 별개의 참고 표시 (분류가 바뀌진 않아요)"
          head={['플래그', '조건', '의미 / 처방']}
          rows={[
            ['⚠ 피로 주의', '빈도 3.5 이상 AND 성과 약세(손익분기 근처 또는 하락 중)', '같은 사람에게 반복 노출 — 새 소재 교체 준비. 빈도 높아도 성과 좋으면 안 뜸'],
            ['⚠ 노출 못 받음', '세트에 소재 2개↑ + 세트 노출 3천↑인데 점유율 10% 미만', '메타가 다른 소재에 몰아줌 — 성과 숫자로 판단 금지'],
            ['⚠ 클릭률 낮음', '노출 3천↑ AND CTR 0.5% 미만', '시선을 못 잡는 소재 — 썸네일·첫 3초 점검'],
            ['⚠ 전환 퍼널 의심', '클릭 50↑ AND GA4·픽셀 구매 모두 0', '소재는 제 역할 — 상세페이지·가격·로딩 문제'],
          ]}/>

        <Table title="③ 설정 오류(🚨) — 숫자가 새는 원인"
          head={['오류', '조건']}
          rows={[
            ['🚨 UTM 없음', '랜딩 URL·URL 매개변수 어디에도 utm이 없음'],
            ['🚨 UTM 비표준', 'utm_medium이 cpm이 아님'],
            ['🚨 GA4 매출 0', '수동 UTM + 자동 태그(광고ID 매핑) 합쳐도 GA4 0원인데 픽셀엔 매출 있음'],
            ['🚨 UTM 확인 불가', '파트너십 광고라 URL을 API로 못 읽고 GA4 유입도 없음'],
          ]}/>

        <Table title="④ 확장 추천(🏆) — 분류와 별개, 복제할 승자 소재 표시"
          head={['표시', '조건', '의미']}
          rows={[
            ['🏆 확장 추천', `운영 30일↑ + 기간 광고비 5만원↑ + ROAS ${bk * 2}%↑ + 후반에도 손익분기 유지`, '장수인데 효율이 안 꺾이는 검증된 소재 — 브리프 복사 → Claude 채팅에 붙여넣으면 같은 구조로 다른 제품 소재를 확장 제작'],
          ]}/>

        <p className="text-xs text-gray-400">기준값 변경은 관리자에게 요청 (손익분기: lib/brands.js · 임계값: pages/api/decisions.js)</p>
      </div>
    </div>
  );
}

export default function DecisionBoard({ brand }) {
  const router = useRouter();
  const [authed, setAuthed] = useState(null);
  const [preset, setPreset] = useState('last14');
  const [custom, setCustom] = useState(null);       // 대시보드에서 넘어온 기간 (7일 이상일 때만)
  const [shortNote, setShortNote] = useState(false); // 짧은 기간이 무시됐다는 안내
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [decisions, setDecisions] = useState({});
  const [q, setQ] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [showCriteria, setShowCriteria] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const customEndRef = useRef(null);
  const loadedQuery = useRef(false);

  useEffect(() => {
    setAuthed(sessionStorage.getItem('dash_auth') === '1');
    try { setDecisions(JSON.parse(localStorage.getItem(`decisions_${brand.id}`) || '{}')); } catch {}
  }, [brand.id]);

  useEffect(() => {
    if (loadedQuery.current || !router.isReady) return;
    const { start, end } = router.query;
    if (start && end) {
      // 하루·이틀치 데이터론 판단이 안 되므로, 7일 미만이면 최근 14일로 점검
      if (rangeDays(start, end) >= 7) setCustom([start, end]);
      else setShortNote(true);
    }
    loadedQuery.current = true;
  }, [router.isReady, router.query]);

  const getRange = useCallback(() => {
    if (useCustom && customStart && customEnd) return [customStart, customEnd];
    return custom || getPresetRange(preset);
  }, [useCustom, customStart, customEnd, custom, preset]);

  const load = useCallback(async () => {
    const [start, end] = getRange();
    if (!start || !end) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/decisions?brand=${brand.id}&startDate=${start}&endDate=${end}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setData(j);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [getRange, brand.id]);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  // 5분마다 자동 새로고침 — OFF 처리된 소재는 다음 갱신 때 목록에서 빠져요
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => { if (typeof document === 'undefined' || document.visibilityState === 'visible') load(); }, 300000);
    return () => clearInterval(t);
  }, [authed, load]);

  const onDecide = (adId, decision) => {
    const next = { ...decisions };
    if (decision) next[adId] = decision; else delete next[adId];
    setDecisions(next);
    try { localStorage.setItem(`decisions_${brand.id}`, JSON.stringify(next)); } catch {}
  };

  if (authed === null) return null;
  if (!authed) { if (typeof window !== 'undefined') router.push('/'); return null; }

  const BC = brand.color;
  const [rangeStart, rangeEnd] = getRange();
  const items = data?.items || [];
  const qq = q.trim().toLowerCase();
  const matchQ = i => !qq || [i.adName, i.adsetName, i.campaignName].some(s => s && s.toLowerCase().includes(qq));
  const errorItems = items.filter(i => i.errors.length > 0).filter(matchQ);
  const scrollTo = id => { if (typeof document !== 'undefined') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const undecided = items.filter(i => !decisions[i.adId] && (i.category === 'off' || i.category === 'fix' || i.category === 'scale'));
  const decidedCount = items.filter(i => decisions[i.adId]).length;

  const bk = data?.breakeven || 300;
  const CAT_RULES = {
    off: [
      `기준: ROAS가 손익분기(${bk}%)의 60% 미만 (${Math.round(bk * 0.6)}% 미만)`,
      '광고비를 쓸수록 손해가 커지는 구간이에요',
    ],
    fix: [
      `기준: ROAS가 손익분기(${bk}%)의 60%~120% 사이`,
      '또는 기간 전반 → 후반 ROAS가 40% 이상 급락',
      '이익 여유가 없거나 효율이 꺾이는 중이에요',
    ],
    scale: [
      `기준: ROAS가 손익분기(${bk}%)의 2배 이상 (${bk * 2}% 이상)`,
      '그리고 기간 후반에도 손익분기 위를 유지',
      '효율이 검증됐고 아직 안 꺾임 — 예산을 늘려볼 후보예요',
    ],
    keep: [
      `기준: ROAS가 손익분기(${bk}%)의 1.2배~2배 사이`,
      '안정적으로 이익은 나지만 증액 근거까진 아니에요',
    ],
    hold: [
      '기준: 광고비 3만원 미만이면서 클릭 50회 미만',
      '데이터가 적어 지금 판단하면 틀릴 확률이 높아요',
      '광고비 3만원 또는 클릭 50회가 쌓이면 자동 판단돼요',
    ],
  };
  const ERROR_RULES = [
    'UTM 없음: 랜딩 URL·URL 매개변수 어디에도 utm이 없음 — 인스타 일부 경로는 자동 태그(ig/paid)로 구제되지만, 페북 지면·외부 브라우저 클릭은 유입 미상으로 새요',
    'UTM 비표준: utm_medium이 cpm이 아님',
    'GA4 매출 0: 수동 UTM + 메타 자동 태그(ig/paid 광고ID 매핑)까지 합쳐도 GA4 매출 0원인데 픽셀엔 매출이 찍힘 (광고비 3만원 이상만)',
    'UTM 확인 불가: 파트너십 광고 등 URL을 API로 못 읽고, GA4 유입도 없음',
  ];

  const PRESETS = [{ v: 'last7', l: '최근 7일' }, { v: 'last14', l: '최근 14일' }, { v: 'last30', l: '최근 30일' }, { v: 'thisMonth', l: '이번 달' }, { v: 'lastMonth', l: '지난 달' }];

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif" }}>
      <Head>
        <title>{`${BOARD_NAME} | ${brand.name}`}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"/>
      </Head>

      {showCriteria && <CriteriaModal bk={bk} onClose={() => setShowCriteria(false)}/>}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)}/>}

      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 font-medium text-sm">← 홈</button>
            <div className="w-px h-5 bg-gray-300"/>
            <span className="text-xl">🩺</span>
            <p className="text-xl font-extrabold text-gray-900">{BOARD_NAME}</p>
            {/* 브랜드 전환 */}
            <div className="flex items-center gap-1 ml-2 bg-gray-100 rounded-xl p-1">
              {BRAND_LIST.map(b => (
                <button key={b.id} onClick={() => b.id !== brand.id && router.push(`/${b.id}/decisions`)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition-colors ${b.id === brand.id ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  style={b.id === brand.id ? { background: b.color } : {}}>
                  {b.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push(`/${brand.id}`)}
              className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
              📊 대시보드
            </button>
            <button onClick={load} disabled={loading}
              className="px-4 py-2.5 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-60" style={{ background: BC }}>
              {loading ? '점검 중…' : '🔄 다시 점검'}
            </button>
          </div>
        </div>
      </header>

      {/* 기간 */}
      <div className="bg-white border-b border-gray-100 md:sticky md:top-[73px] md:z-[15]">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button key={p.v} onClick={() => { setCustom(null); setUseCustom(false); setShortNote(false); setPreset(p.v); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${!custom && !useCustom && preset === p.v ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              style={!custom && !useCustom && preset === p.v ? { background: BC } : {}}>
              {p.l}
            </button>
          ))}
          <button onClick={() => { setCustom(null); setShortNote(false); setUseCustom(true); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${useCustom ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            style={useCustom ? { background: BC } : {}}>
            직접 설정
          </button>
          {useCustom && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart}
                onChange={e => { setCustomStart(e.target.value); if (e.target.value) requestAnimationFrame(() => { try { customEndRef.current?.focus(); customEndRef.current?.showPicker?.(); } catch {} }); }}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
              <span className="text-gray-400">~</span>
              <input type="date" ref={customEndRef} value={customEnd} min={customStart || undefined} onChange={e => setCustomEnd(e.target.value)}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
            </div>
          )}
          <p className="text-sm text-gray-400 ml-1">📅 {rangeStart} ~ {rangeEnd}{custom ? ' (대시보드 기간)' : ''}</p>
          <div className="ml-auto flex items-center gap-3">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 캠페인·광고세트·소재 검색"
              className="border border-gray-200 rounded-xl px-4 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-amber-300"/>
            {data && (
              <p className="text-sm text-gray-500 whitespace-nowrap hidden md:flex items-center gap-2">
                손익분기 ROAS <b className="text-gray-800">{data.breakeven}%</b> (ERP 원가 기준)
                <button onClick={() => setShowCriteria(true)}
                  className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-gray-700">
                  📋 판정 기준표
                </button>
                <button onClick={() => setShowGuide(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600">
                  📖 확장 가이드
                </button>
              </p>
            )}
          </div>
        </div>
        {useCustom && customStart && customEnd && rangeDays(customStart, customEnd) < 7 && (
          <div className="max-w-screen-xl mx-auto px-6 pb-3">
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
              ⚠ 기간이 7일 미만이면 데이터가 적어 판단 보류가 많아져요 — 가능하면 7일 이상으로 보는 걸 추천해요.
            </p>
          </div>
        )}
        {shortNote && (
          <div className="max-w-screen-xl mx-auto px-6 pb-3">
            <p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
              ℹ️ 대시보드에서 선택한 기간이 7일 미만이라, 판단에 필요한 데이터를 위해 <b>최근 14일</b>로 점검했어요.
            </p>
          </div>
        )}
      </div>

      <main className="max-w-screen-xl mx-auto px-6 py-6">
        {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-4 text-sm font-medium">⚠ {error}</div>}

        {/* 요약 타일 */}
        {data && (
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-3 mb-6 md:sticky md:top-[134px] md:z-10 bg-slate-50/95 backdrop-blur-sm py-2 -my-2 rounded-xl">
            <button onClick={() => scrollTo('sec-errors')}
              className="rounded-2xl bg-white border-2 border-red-200 px-4 py-3 text-center hover:shadow-md hover:-translate-y-0.5 transition-all">
              <p className="text-2xl font-extrabold text-red-600">{data.summary.errorAds || 0}</p>
              <p className="text-xs font-bold text-gray-500 mt-0.5">🚨 설정 오류</p>
            </button>
            <button onClick={() => scrollTo('sec-winners')}
              className="rounded-2xl bg-white border-2 border-amber-300 px-4 py-3 text-center hover:shadow-md hover:-translate-y-0.5 transition-all">
              <p className="text-2xl font-extrabold text-amber-500">{data.summary.winners || 0}</p>
              <p className="text-xs font-bold text-gray-500 mt-0.5">🏆 확장 추천</p>
            </button>
            {CAT_ORDER.map(c => (
              <button key={c} onClick={() => scrollTo(`sec-${c}`)}
                className="rounded-2xl bg-white border border-gray-200 px-4 py-3 text-center hover:shadow-md hover:-translate-y-0.5 transition-all">
                <p className="text-2xl font-extrabold" style={{ color: CATS[c].color }}>{data.summary.counts[c] || 0}</p>
                <p className="text-xs font-bold text-gray-500 mt-0.5">{CATS[c].emoji} {CATS[c].label}</p>
              </button>
            ))}
          </div>
        )}

        {/* 오늘 정할 것 */}
        {data && (
          <div className="mb-6 rounded-2xl bg-white border border-gray-200 p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-lg font-extrabold text-gray-900">📌 오늘 정할 것 <span className="text-gray-400 text-base font-semibold">({undecided.length}건 남음 · {decidedCount}건 결정됨)</span></p>
              <p className="text-sm text-gray-500">
                켜진 소재 {data.summary.activeAds}개 · 손익분기 아래 <b className="text-red-600">{data.summary.belowBreakeven}개</b> · 전체 ROAS <b>{data.summary.totalRoas}%</b>
              </p>
            </div>
            {undecided.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {undecided.slice(0, 5).map(i => (
                  <li key={i.adId} className="text-[15px] text-gray-700 leading-relaxed">
                    {CATS[i.category].emoji} <span className="text-gray-400 text-sm">{i.campaignName} › {i.adsetName} ›</span> <b>{i.adName}</b> — {i.reason}
                  </li>
                ))}
                {undecided.length > 5 && <li className="text-sm text-gray-400">… 외 {undecided.length - 5}건</li>}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-500">{loading ? '점검 중…' : '🎉 결정할 항목을 모두 처리했어요.'}</p>
            )}
          </div>
        )}

        {/* 설정 오류 점검 */}
        {errorItems.length > 0 && (
          <section id="sec-errors" className="mb-8 scroll-mt-32">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3.5 py-1.5 rounded-full text-base font-extrabold text-white bg-red-600">🚨 설정 오류 {errorItems.length}</span>
              <InfoTip lines={ERROR_RULES}/>
              <p className="text-sm text-gray-400">UTM 누락·비표준, GA4 추적 불일치 — 숫자가 새는 원인부터 고쳐요</p>
            </div>
            <div className="space-y-2">
              {errorItems.map(i => (
                <div key={i.adId} className="rounded-2xl bg-white border border-red-200 px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    {i.thumbnail && <img src={i.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-100 shrink-0 bg-gray-50"/>}
                    <div className="min-w-0 flex-1">
                      <AdPath item={i} size="sm"/>
                      <p className="text-base font-extrabold text-gray-900 mt-1">{i.adName}</p>
                    </div>
                    {data?.adAccountId && (
                      <a href={adsManagerUrl(data.adAccountId, i.adId)} target="_blank" rel="noreferrer"
                        className="shrink-0 px-4 py-2 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-600 hover:border-gray-400 bg-white whitespace-nowrap">
                        광고관리자 ↗
                      </a>
                    )}
                  </div>
                  {i.errors.map(f => (
                    <div key={f.k} className="text-sm text-red-700 mt-2 leading-relaxed bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                      <p>🚨 <b>{f.label}</b> — {f.detail}</p>
                      {f.steps && (
                        <ol className="mt-2.5 space-y-2">
                          {f.steps.map((st, si) => (
                            <li key={si} className="flex gap-2.5">
                              <span className="shrink-0 w-5 h-5 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{si + 1}</span>
                              <span>{st}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 🏆 확장 추천 (승자 소재) — 설정 오류 다음, OFF 검토 앞 */}
        {items.filter(i => i.winner).filter(matchQ).length > 0 && data && (
          <section id="sec-winners" className="mb-8 scroll-mt-32">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3.5 py-1.5 rounded-full text-base font-extrabold text-white bg-amber-500">🏆 확장 추천 {items.filter(i => i.winner).filter(matchQ).length}</span>
              <InfoTip lines={[
                '기준: 운영 30일 이상 + 기간 광고비 5만원 이상',
                `+ ROAS 손익분기(${bk}%)의 2배 이상 + 기간 후반에도 손익분기 유지`,
                '오래 돌아도 효율이 안 꺾이는 검증된 승자 — 이 구조를 복제해 다른 제품으로 확장할 후보예요',
              ]}/>
              <p className="text-sm text-gray-400">브리프 복사 → Claude 채팅에 붙여넣으면 같은 구조의 신규 소재를 만들어줘요</p>
              <button onClick={() => setShowGuide(true)}
                className="ml-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold shadow-sm">
                📖 확장 가이드
              </button>
            </div>
            <div className="space-y-3">
              {items.filter(i => i.winner).filter(matchQ).map(item => (
                <WinnerCard key={item.adId} item={item} period={data.period} adAccountId={data.adAccountId}/>
              ))}
            </div>
          </section>
        )}

        {/* 분류별 카드 */}
        {CAT_ORDER.map(cat => {
          const group = items.filter(i => i.category === cat).filter(matchQ);
          if (!group.length) return null;
          const c = CATS[cat];
          return (
            <section key={cat} id={`sec-${cat}`} className="mb-8 scroll-mt-32">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-3.5 py-1.5 rounded-full text-base font-extrabold text-white" style={{ background: c.color }}>{c.emoji} {c.label} {group.length}</span>
                <InfoTip lines={CAT_RULES[cat]}/>
                <p className="text-sm text-gray-400">{c.desc}</p>
              </div>
              <div className="space-y-3">
                {group.map(item => (
                  <DecisionCard key={item.adId} item={item} brand={brand} decision={decisions[item.adId]} onDecide={onDecide} adAccountId={data?.adAccountId} onReload={load}
                    siblingCount={items.filter(x => x.adsetId === item.adsetId).length}/>
                ))}
              </div>
            </section>
          );
        })}

        {qq && items.filter(matchQ).length === 0 && (
          <p className="text-center text-gray-400 py-16">"{q}" 검색 결과가 없어요</p>
        )}

        {!data && loading && <p className="text-center text-gray-400 py-20 text-base">소재를 점검하는 중이에요… (20~30초 걸릴 수 있어요)</p>}

        <p className="mt-10 text-xs text-gray-300 text-center">
          결정 기록은 이 브라우저에 저장됩니다 · 분류 기준: 손익분기 {data?.breakeven || '—'}% 대비 (lib/brands.js에서 수정) · 클릭 시 메타 자동 반영은 추후 추가 예정
        </p>
      </main>

      {/* 맨 위로 */}
      <button onClick={() => typeof window !== 'undefined' && window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="맨 위로"
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-gray-900 text-white text-xl shadow-xl hover:bg-gray-700 transition-colors flex items-center justify-center">
        △
      </button>
    </div>
  );
}
