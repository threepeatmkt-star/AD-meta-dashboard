/**
 * components/DecisionBoard.jsx — 주간 점검 (구 결정보드)
 * 소재별 자동 점검 → 설정 오류 / 끄기 검토 / 손보기 / 늘리기 분류 → 결정만 누르면 기록.
 * 결정 기록은 브라우저(localStorage)에 저장됩니다. (자동 반영은 추후)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { BRAND_LIST } from '../lib/brands';

const BOARD_NAME = '주간 점검';
const krw = v => '₩' + Math.round(v || 0).toLocaleString('ko-KR');
const man = v => `${(Math.round((v || 0) / 1000) / 10).toLocaleString('ko-KR')}만원`;

function getPresetRange(preset) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysAgo = n => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };
  switch (preset) {
    case 'last7': return [fmt(daysAgo(7)), fmt(daysAgo(1))];
    case 'last30': return [fmt(daysAgo(30)), fmt(daysAgo(1))];
    case 'last14': default: return [fmt(daysAgo(14)), fmt(daysAgo(1))];
  }
}
const rangeDays = (s, e) => Math.round((new Date(e) - new Date(s)) / 86400000) + 1;

const CATS = {
  off:   { label: '끄기 검토', emoji: '🔴', desc: '손익분기 한참 아래 — 쓸수록 손해', color: '#DC2626', soft: '#FEF2F2' },
  fix:   { label: '손보기',   emoji: '🟠', desc: '효율이 떨어지는 중이거나 손익분기 근처', color: '#D97706', soft: '#FFFBEB' },
  scale: { label: '늘리기',   emoji: '🟢', desc: '효율 좋고 아직 여유 있음 — 증액 후보', color: '#059669', soft: '#ECFDF5' },
  keep:  { label: '유지',     emoji: '🔵', desc: '손익분기 위에서 안정적', color: '#2563EB', soft: '#EFF6FF' },
  hold:  { label: '판단 보류', emoji: '⚪', desc: '광고비가 적어 데이터 부족', color: '#6B7280', soft: '#F9FAFB' },
};
const CAT_ORDER = ['off', 'fix', 'scale', 'keep', 'hold'];

/* 캠페인 › 광고세트 › 소재 경로 표시 — 어디 소속인지 한눈에 */
function AdPath({ item, size = 'md' }) {
  return (
    <div className={`flex items-center flex-wrap gap-x-1.5 gap-y-1 ${size === 'md' ? 'mb-1.5' : ''}`}>
      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-bold whitespace-nowrap">📊 {item.campaignName}</span>
      <span className="text-gray-300 text-xs">›</span>
      <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 text-xs font-bold whitespace-nowrap">🎯 {item.adsetName}</span>
    </div>
  );
}

function DecisionCard({ item, brand, decision, onDecide }) {
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState(decision?.memo || '');
  const cat = CATS[item.category];

  return (
    <div className={`rounded-2xl border-2 bg-white overflow-hidden transition-shadow ${decision ? 'opacity-75' : 'hover:shadow-md'}`}
      style={{ borderColor: decision ? '#E5E7EB' : cat.color + '55' }}>
      <button onClick={() => setOpen(!open)} className="w-full text-left px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <AdPath item={item}/>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-lg font-extrabold text-gray-900">🖼 {item.adName}</p>
              {decision && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-900 text-white">✓ {decision.choice}</span>}
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
            <p className="text-sm text-gray-500 font-semibold mt-0.5">{man(item.spend)}</p>
            <p className="text-xs text-gray-300 mt-1">{open ? '▲ 접기' : '▼ 근거·결정'}</p>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 bg-gray-50/50">
          {/* 근거 수치 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              ['GA4 매출', krw(item.revenue)],
              ['픽셀 ROAS (참고)', item.pixelRoas + '%'],
              ['빈도', item.frequency],
              ['기간 내 추이', item.firstHalf && item.secondHalf
                ? `${item.firstHalf.roas}% → ${item.secondHalf.roas}% ${item.secondHalf.roas < item.firstHalf.roas ? '▼' : '▲'}`
                : '—'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white border border-gray-100 px-3 py-2.5">
                <p className="text-xs text-gray-400">{k}</p>
                <p className="text-base font-bold text-gray-900 mt-0.5">{v}</p>
              </div>
            ))}
          </div>
          {item.errors.map(f => (
            <p key={f.k} className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-2 leading-relaxed">🚨 <b>{f.label}</b> — {f.detail}</p>
          ))}
          {item.flags.map(f => (
            <p key={f.k} className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-2 leading-relaxed">⚠ <b>{f.label}</b> — {f.detail}</p>
          ))}

          {/* 결정 */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {item.options.map(opt => (
              <button key={opt}
                onClick={() => onDecide(item.adId, { choice: opt, memo, at: new Date().toISOString() })}
                className={`px-5 py-2.5 rounded-xl text-[15px] font-bold border-2 transition-colors ${decision?.choice === opt ? 'text-white' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
                style={decision?.choice === opt ? { background: brand.color, borderColor: brand.color } : {}}>
                {opt}
              </button>
            ))}
            {decision && (
              <button onClick={() => onDecide(item.adId, null)}
                className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-400 hover:text-gray-600">
                결정 취소
              </button>
            )}
          </div>
          <input value={memo} onChange={e => setMemo(e.target.value)}
            onBlur={() => decision && onDecide(item.adId, { ...decision, memo })}
            placeholder="메모 (선택) — 예: 다음 주까지 지켜보고 끄기"
            className="mt-3 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"/>
        </div>
      )}
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

  const getRange = useCallback(() => custom || getPresetRange(preset), [custom, preset]);

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
  const errorItems = items.filter(i => i.errors.length > 0);
  const undecided = items.filter(i => !decisions[i.adId] && (i.category === 'off' || i.category === 'fix' || i.category === 'scale'));
  const decidedCount = items.filter(i => decisions[i.adId]).length;

  const PRESETS = [{ v: 'last7', l: '최근 7일' }, { v: 'last14', l: '최근 14일' }, { v: 'last30', l: '최근 30일' }];

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif" }}>
      <Head>
        <title>{`${BOARD_NAME} | ${brand.name}`}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"/>
      </Head>

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
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button key={p.v} onClick={() => { setCustom(null); setShortNote(false); setPreset(p.v); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${!custom && preset === p.v ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              style={!custom && preset === p.v ? { background: BC } : {}}>
              {p.l}
            </button>
          ))}
          <p className="text-sm text-gray-400 ml-1">📅 {rangeStart} ~ {rangeEnd}{custom ? ' (대시보드 기간)' : ''}</p>
          {data && <p className="ml-auto text-sm text-gray-500">손익분기 ROAS <b className="text-gray-800">{data.breakeven}%</b> (ERP 원가 기준)</p>}
        </div>
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
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
            <div className="rounded-2xl bg-white border-2 border-red-200 px-4 py-3 text-center">
              <p className="text-2xl font-extrabold text-red-600">{data.summary.errorAds || 0}</p>
              <p className="text-xs font-bold text-gray-500 mt-0.5">🚨 설정 오류</p>
            </div>
            {CAT_ORDER.map(c => (
              <div key={c} className="rounded-2xl bg-white border border-gray-200 px-4 py-3 text-center">
                <p className="text-2xl font-extrabold" style={{ color: CATS[c].color }}>{data.summary.counts[c] || 0}</p>
                <p className="text-xs font-bold text-gray-500 mt-0.5">{CATS[c].emoji} {CATS[c].label}</p>
              </div>
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
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3.5 py-1.5 rounded-full text-base font-extrabold text-white bg-red-600">🚨 설정 오류 {errorItems.length}</span>
              <p className="text-sm text-gray-400">UTM 누락·비표준, GA4 추적 불일치 — 숫자가 새는 원인부터 고쳐요</p>
            </div>
            <div className="space-y-2">
              {errorItems.map(i => (
                <div key={i.adId} className="rounded-2xl bg-white border border-red-200 px-5 py-3.5">
                  <AdPath item={i} size="sm"/>
                  <p className="text-base font-extrabold text-gray-900 mt-1">🖼 {i.adName}</p>
                  {i.errors.map(f => (
                    <p key={f.k} className="text-sm text-red-700 mt-1.5 leading-relaxed">🚨 <b>{f.label}</b> — {f.detail}</p>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 분류별 카드 */}
        {CAT_ORDER.map(cat => {
          const group = items.filter(i => i.category === cat);
          if (!group.length) return null;
          const c = CATS[cat];
          return (
            <section key={cat} className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-3.5 py-1.5 rounded-full text-base font-extrabold text-white" style={{ background: c.color }}>{c.emoji} {c.label} {group.length}</span>
                <p className="text-sm text-gray-400">{c.desc}</p>
              </div>
              <div className="space-y-3">
                {group.map(item => (
                  <DecisionCard key={item.adId} item={item} brand={brand} decision={decisions[item.adId]} onDecide={onDecide}/>
                ))}
              </div>
            </section>
          );
        })}

        {!data && loading && <p className="text-center text-gray-400 py-20 text-base">소재를 점검하는 중이에요… (20~30초 걸릴 수 있어요)</p>}

        <p className="mt-10 text-xs text-gray-300 text-center">
          결정 기록은 이 브라우저에 저장됩니다 · 분류 기준: 손익분기 {data?.breakeven || '—'}% 대비 (lib/brands.js에서 수정) · 클릭 시 메타 자동 반영은 추후 추가 예정
        </p>
      </main>
    </div>
  );
}
