/**
 * 삼대오백 Meta Ads × GA4 통합 대시보드 — v3
 * 변경사항: 이번주/지난주 프리셋, Pretendard, 썸네일 확대,
 *           캠페인_제품별 그룹뷰, 일예산, 광고세트 필터, 광고/바이럴 매출
 */

import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

// ── 날짜 유틸 ────────────────────────────────────────────────────
function fmtDate(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function getPresetRange(preset) {
  const now = new Date();
  const yest = new Date(now.getTime() - 86400000);
  const dayOfWeek = now.getDay(); // 0=일, 1=월
  const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(now.getTime() - diffToMon * 86400000);
  const lastSunday = new Date(thisMonday.getTime() - 86400000);
  const lastMonday = new Date(lastSunday.getTime() - 6 * 86400000);

  switch (preset) {
    case 'today': return [fmtDate(now), fmtDate(now)];
    case 'yesterday': return [fmtDate(yest), fmtDate(yest)];
    case 'thisWeek': return [fmtDate(thisMonday), fmtDate(now)];
    case 'lastWeek': return [fmtDate(lastMonday), fmtDate(lastSunday)];
    case 'last7': return [fmtDate(new Date(now.getTime()-7*86400000)), fmtDate(yest)];
    case 'last14': return [fmtDate(new Date(now.getTime()-14*86400000)), fmtDate(yest)];
    case 'last30': return [fmtDate(new Date(now.getTime()-30*86400000)), fmtDate(yest)];
    case 'thisMonth': return [fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)), fmtDate(yest)];
    case 'lastMonth': return [
      fmtDate(new Date(now.getFullYear(), now.getMonth()-1, 1)),
      fmtDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    ];
    default: return [fmtDate(new Date(now.getTime()-7*86400000)), fmtDate(yest)];
  }
}

function getPrevRange(start, end) {
  const s = new Date(start), e = new Date(end);
  const days = Math.ceil((e - s) / 86400000) + 1;
  const pe = new Date(s.getTime() - 86400000);
  const ps = new Date(pe.getTime() - (days-1) * 86400000);
  return [fmtDate(ps), fmtDate(pe)];
}

// ── 포맷 ────────────────────────────────────────────────────────
const krw = n => n ? '₩' + Math.round(n).toLocaleString('ko-KR') : '₩0';
const num = n => n ? Number(n).toLocaleString('ko-KR') : '0';

function roasBadge(r) {
  if (r >= 300) return 'text-emerald-600 font-bold';
  if (r >= 150) return 'text-amber-500 font-semibold';
  if (r > 0) return 'text-rose-500 font-semibold';
  return 'text-gray-400';
}

function DeltaBadge({ curr, prev }) {
  if (!prev || prev === 0) return null;
  const pct = ((curr - prev) / prev) * 100;
  const up = pct >= 0;
  return <span className={`text-xs ml-1 ${up ? 'text-emerald-600' : 'text-rose-500'}`}>{up ? '▲' : '▼'}{Math.abs(pct).toFixed(1)}%</span>;
}

// ── 제품명 추출 (광고세트명 기준) ────────────────────────────────
function extractProduct(adsetName) {
  if (!adsetName) return '-';
  const parts = adsetName.split('_');
  // 2번째 세그먼트(index 1)가 제품명인 경우가 많음. 없으면 1번째(index 0) 사용
  return parts.length >= 2 ? parts[1] : parts[0];
}

function groupByProduct(adsetData) {
  const map = {};
  adsetData.forEach(item => {
    const product = extractProduct(item.name);
    const key = `${item.campaignName}||${product}`;
    if (!map[key]) {
      map[key] = { id: key, campaignName: item.campaignName, product, spend: 0, revenue: 0, reach: 0, impressions: 0, clicks: 0, dailyBudget: 0, count: 0 };
    }
    map[key].spend += item.spend;
    map[key].revenue += item.revenue;
    map[key].reach += item.reach;
    map[key].impressions += item.impressions;
    map[key].clicks += item.clicks;
    map[key].dailyBudget += item.dailyBudget || 0;
    map[key].count++;
  });
  return Object.values(map).map(g => ({ ...g, roas: g.spend > 0 ? Math.round(g.revenue/g.spend*1000)/10 : 0 }));
}

// ── 합계 ────────────────────────────────────────────────────────
function sumRows(arr) {
  return arr.reduce((a, d) => ({
    spend: a.spend + d.spend, revenue: a.revenue + d.revenue,
    reach: a.reach + d.reach, impressions: a.impressions + d.impressions, clicks: a.clicks + d.clicks,
  }), { spend: 0, revenue: 0, reach: 0, impressions: 0, clicks: 0 });
}

// ── 스피너 ──────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  );
}

// ── 요약 카드 ────────────────────────────────────────────────────
function SummaryCard({ label, value, curr, prev, isRoas, roasVal, loading, accent }) {
  return (
    <div className={`bg-white rounded-xl border p-4 shadow-sm ${accent ? 'border-orange-200 bg-orange-50/40' : 'border-gray-200'}`}>
      <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide font-medium">{label}</p>
      {loading
        ? <div className="h-7 bg-gray-100 rounded animate-pulse w-24"/>
        : <div className="flex items-baseline flex-wrap gap-1">
            <span className={`text-xl font-bold ${isRoas ? roasBadge(roasVal) : 'text-gray-900'}`}>{value}</span>
            {prev !== undefined && <DeltaBadge curr={curr} prev={prev}/>}
          </div>
      }
    </div>
  );
}

// ── 메인 ────────────────────────────────────────────────────────
export default function Dashboard() {
  const [preset, setPreset] = useState('last7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [compare, setCompare] = useState(false);
  const [tab, setTab] = useState('campaign');
  const [adsetSubTab, setAdsetSubTab] = useState('adset'); // 'adset' | 'product'
  const [adsetFilter, setAdsetFilter] = useState('');     // 소재 탭 광고세트 필터

  const [data, setData] = useState([]);
  const [prevData, setPrevData] = useState([]);
  const [adRevenue, setAdRevenue] = useState(0);
  const [viralRevenue, setViralRevenue] = useState(0);
  const [prevAdRevenue, setPrevAdRevenue] = useState(0);
  const [prevViralRevenue, setPrevViralRevenue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [hoverThumb, setHoverThumb] = useState(null);

  const getRange = useCallback(() => {
    if (preset === 'custom') return [customStart, customEnd];
    return getPresetRange(preset);
  }, [preset, customStart, customEnd]);

  const load = useCallback(async () => {
    const [start, end] = getRange();
    if (!start || !end) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/dashboard?startDate=${start}&endDate=${end}&level=${tab}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setData(j.data || []);
      setAdRevenue(j.adRevenue || 0);
      setViralRevenue(j.viralRevenue || 0);

      if (compare) {
        const [ps, pe] = getPrevRange(start, end);
        const pr = await fetch(`/api/dashboard?startDate=${ps}&endDate=${pe}&level=${tab}`);
        const pj = await pr.json();
        setPrevData(pj.data || []);
        setPrevAdRevenue(pj.adRevenue || 0);
        setPrevViralRevenue(pj.viralRevenue || 0);
      } else {
        setPrevData([]); setPrevAdRevenue(0); setPrevViralRevenue(0);
      }
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [getRange, tab, compare]);

  useEffect(() => { load(); }, [load]);

  const totals = { ...sumRows(data) };
  totals.roas = totals.spend > 0 ? Math.round(totals.revenue/totals.spend*1000)/10 : 0;
  const prevTotals = { ...sumRows(prevData) };
  prevTotals.roas = prevTotals.spend > 0 ? Math.round(prevTotals.revenue/prevTotals.spend*1000)/10 : 0;

  const [rangeStart, rangeEnd] = getRange();
  const [prevStart, prevEnd] = rangeStart && rangeEnd ? getPrevRange(rangeStart, rangeEnd) : ['',''];

  const PRESETS = [
    { v:'today', l:'오늘' }, { v:'yesterday', l:'어제' },
    { v:'thisWeek', l:'이번 주' }, { v:'lastWeek', l:'지난 주' },
    { v:'last7', l:'최근 7일' }, { v:'last14', l:'최근 14일' }, { v:'last30', l:'최근 30일' },
    { v:'thisMonth', l:'이번 달' }, { v:'lastMonth', l:'지난 달' }, { v:'custom', l:'직접 설정' },
  ];

  const TABS = [
    { v:'campaign', l:'📊 캠페인' },
    { v:'adset', l:'🎯 광고세트' },
    { v:'ad', l:'🖼 소재' },
  ];

  // 소재 탭 광고세트 목록 (필터 드롭다운용)
  const adsetOptions = tab === 'ad'
    ? [...new Set(data.map(d => d.adsetName).filter(Boolean))].sort()
    : [];

  // 소재 탭 필터링
  const filteredAds = adsetFilter ? data.filter(d => d.adsetName === adsetFilter) : data;

  // 광고세트 탭 — 캠페인_제품별 그룹
  const productGroupData = adsetSubTab === 'product' ? groupByProduct(data) : [];

  const displayData = tab === 'adset' && adsetSubTab === 'product' ? productGroupData
    : tab === 'ad' ? filteredAds
    : data;

  const displayTotals = { ...sumRows(displayData) };
  displayTotals.roas = displayTotals.spend > 0 ? Math.round(displayTotals.revenue/displayTotals.spend*1000)/10 : 0;

  return (
    <div className="min-h-screen bg-gray-50" style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif"}}>
      <Head>
        <title>삼대오백 광고 대시보드</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
      </Head>

      {/* 썸네일 호버 오버레이 */}
      {hoverThumb && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: Math.max(8, hoverThumb.y - 160), left: hoverThumb.x + 16 }}
        >
          <img src={hoverThumb.src} className="w-48 h-48 object-cover rounded-xl shadow-2xl border-2 border-white"/>
        </div>
      )}

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow">
              <span className="text-white text-xs font-extrabold tracking-tighter">500</span>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">삼대오백 광고 대시보드</p>
              <p className="text-xs text-gray-400">Meta Ads × GA4 통합 효율 분석 (사내용)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && <span className="text-xs text-gray-400 hidden sm:inline">업데이트: {lastUpdated}</span>}
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
              {loading ? <Spinner/> : <span>🔄</span>}
              <span className="hidden sm:inline">새로고침</span>
            </button>
          </div>
        </div>
      </header>

      {/* 날짜 필터 */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-screen-xl mx-auto px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map(p => (
              <button key={p.v} onClick={() => setPreset(p.v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${preset===p.v ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {p.l}
              </button>
            ))}
            {preset === 'custom' && (
              <div className="flex items-center gap-2 ml-1">
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"/>
                <span className="text-gray-400">~</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"/>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <span className="text-sm text-gray-500 whitespace-nowrap">이전 기간 비교</span>
              <button onClick={() => setCompare(!compare)}
                className={`relative w-11 h-6 rounded-full transition-colors ${compare ? 'bg-orange-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${compare ? 'translate-x-5' : ''}`}/>
              </button>
            </div>
          </div>
          {rangeStart && (
            <p className="mt-1.5 text-xs text-gray-400">
              📅 {rangeStart === rangeEnd ? rangeStart : `${rangeStart} ~ ${rangeEnd}`}
              {compare && prevStart && <span className="ml-2 text-blue-400">| 비교: {prevStart} ~ {prevEnd}</span>}
            </p>
          )}
        </div>
      </div>

      <main className="max-w-screen-xl mx-auto px-5 py-5 space-y-4">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <strong>⚠️ 오류:</strong> {error}
          </div>
        )}

        {/* 요약 카드 — 1열: 기본 지표 / 2열: 매출 구분 */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="col-span-2 md:col-span-4 lg:col-span-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <SummaryCard label="광고비(Meta)" value={krw(totals.spend)} curr={totals.spend} prev={compare?prevTotals.spend:undefined} loading={loading}/>
            <SummaryCard label="ROAS" value={`${totals.roas}%`} curr={totals.roas} prev={compare?prevTotals.roas:undefined} isRoas roasVal={totals.roas} loading={loading}/>
            <SummaryCard label="도달" value={num(totals.reach)} curr={totals.reach} prev={compare?prevTotals.reach:undefined} loading={loading}/>
            <SummaryCard label="노출" value={num(totals.impressions)} curr={totals.impressions} prev={compare?prevTotals.impressions:undefined} loading={loading}/>
            <SummaryCard label="링크 클릭" value={num(totals.clicks)} curr={totals.clicks} prev={compare?prevTotals.clicks:undefined} loading={loading}/>
          </div>
          <div className="col-span-2 md:col-span-4 lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <SummaryCard label="총 매출(GA4)" value={krw(totals.revenue)} curr={totals.revenue} prev={compare?prevTotals.revenue:undefined} loading={loading} accent/>
            <SummaryCard label="📣 광고 매출" value={krw(adRevenue)} curr={adRevenue} prev={compare?prevAdRevenue:undefined} loading={loading} accent/>
            <SummaryCard label="📱 바이럴 매출" value={krw(viralRevenue)} curr={viralRevenue} prev={compare?prevViralRevenue:undefined} loading={loading} accent/>
          </div>
        </div>

        {/* 테이블 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {/* 탭 + 소재 필터 */}
          <div className="flex items-center border-b border-gray-100 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.v} onClick={() => { setTab(t.v); setAdsetFilter(''); }}
                className={`px-6 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${tab===t.v ? 'border-orange-500 text-orange-600 bg-orange-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                {t.l}
              </button>
            ))}

            {/* 소재 탭 — 광고세트 필터 드롭다운 */}
            {tab === 'ad' && adsetOptions.length > 0 && (
              <div className="ml-3 flex items-center gap-2">
                <select value={adsetFilter} onChange={e => setAdsetFilter(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white max-w-[220px]">
                  <option value="">전체 광고세트</option>
                  {adsetOptions.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
                {adsetFilter && (
                  <button onClick={() => setAdsetFilter('')} className="text-xs text-gray-400 hover:text-gray-600 px-2">✕</button>
                )}
              </div>
            )}

            <div className="ml-auto px-4 py-3 shrink-0">
              <span className="text-xs text-gray-400">{loading ? '로딩 중…' : `${displayData.length}건`}</span>
            </div>
          </div>

          {/* 광고세트 탭 — 서브탭 */}
          {tab === 'adset' && (
            <div className="flex border-b border-gray-100 bg-gray-50/50">
              {[{ v:'adset', l:'세트별' }, { v:'product', l:'캠페인_제품별' }].map(st => (
                <button key={st.v} onClick={() => setAdsetSubTab(st.v)}
                  className={`px-5 py-2 text-xs font-semibold transition-colors ${adsetSubTab===st.v ? 'text-orange-600 border-b-2 border-orange-500 bg-white' : 'text-gray-400 hover:text-gray-600'}`}>
                  {st.l}
                </button>
              ))}
              {adsetSubTab === 'product' && (
                <span className="ml-auto px-4 py-2 text-xs text-gray-300 self-center">세트명 기준 두 번째 구분자(_)로 제품명 추출</span>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Spinner/>
              <p className="text-sm text-gray-400">Meta & GA4 데이터 불러오는 중…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {tab === 'ad' && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-20">썸네일</th>}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase min-w-[180px]">
                      {tab==='campaign' ? '캠페인명' : tab==='adset' ? (adsetSubTab==='product' ? '캠페인 / 제품' : '광고세트명') : '소재명'}
                    </th>
                    {tab !== 'campaign' && adsetSubTab !== 'product' && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase min-w-[120px]">캠페인</th>
                    )}
                    {tab === 'adset' && (
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">일예산</th>
                    )}
                    {['광고비','매출액','ROAS','도달','노출','클릭'].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayData.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-16 text-center">
                        <p className="text-3xl mb-2">📭</p>
                        <p className="text-gray-400 text-sm">데이터가 없습니다.</p>
                      </td>
                    </tr>
                  ) : displayData.map((row, i) => {
                    const prev = prevData.find(p => p.id === row.id);
                    return (
                      <tr key={i} className="hover:bg-orange-50/20 transition-colors">
                        {/* 썸네일 */}
                        {tab === 'ad' && (
                          <td className="px-4 py-2">
                            {row.thumbnail ? (
                              <img src={row.thumbnail} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 shadow-sm cursor-zoom-in"
                                onMouseEnter={e => setHoverThumb({ src: row.thumbnail, x: e.clientX, y: e.clientY })}
                                onMouseMove={e => setHoverThumb(prev => prev ? {...prev, x: e.clientX, y: e.clientY} : null)}
                                onMouseLeave={() => setHoverThumb(null)}
                                onError={e => { e.target.style.display='none'; }}/>
                            ) : (
                              <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-xl">🖼</div>
                            )}
                          </td>
                        )}
                        {/* 이름 */}
                        <td className="px-4 py-3">
                          {adsetSubTab === 'product' && tab === 'adset' ? (
                            <div>
                              <p className="text-xs text-gray-400 mb-0.5">{row.campaignName}</p>
                              <p className="font-semibold text-gray-900">{row.product}</p>
                              <p className="text-xs text-gray-300">{row.count}개 세트</p>
                            </div>
                          ) : (
                            <div>
                              <p className="font-medium text-gray-900 truncate max-w-xs" title={row.name}>{row.name}</p>
                              {tab === 'ad' && row.adsetName && (
                                <button
                                  onClick={() => { setTab('ad'); setAdsetFilter(row.adsetName); }}
                                  className="text-xs text-orange-400 hover:text-orange-600 hover:underline mt-0.5 text-left truncate max-w-xs block"
                                  title={row.adsetName}
                                >
                                  {row.adsetName}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        {/* 캠페인명 */}
                        {tab !== 'campaign' && adsetSubTab !== 'product' && (
                          <td className="px-4 py-3">
                            <p className="text-xs text-gray-400 truncate max-w-[140px]" title={row.campaignName}>{row.campaignName}</p>
                          </td>
                        )}
                        {/* 일예산 */}
                        {tab === 'adset' && (
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {row.dailyBudget > 0
                              ? <span className="text-gray-600">{krw(row.dailyBudget)}</span>
                              : <span className="text-xs text-gray-300">CBO</span>
                            }
                          </td>
                        )}
                        {/* 광고비 */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className="text-gray-700">{krw(row.spend)}</span>
                          {compare && prev && <DeltaBadge curr={row.spend} prev={prev.spend}/>}
                        </td>
                        {/* 매출액 */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className={row.revenue>0?'text-gray-700':'text-gray-300'}>{krw(row.revenue)}</span>
                          {compare && prev && <DeltaBadge curr={row.revenue} prev={prev.revenue}/>}
                        </td>
                        {/* ROAS */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className={roasBadge(row.roas)}>{row.roas}%</span>
                          {compare && prev && <DeltaBadge curr={row.roas} prev={prev.roas}/>}
                        </td>
                        {/* 도달/노출/클릭 */}
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{num(row.reach)}</td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{num(row.impressions)}</td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{num(row.clicks)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {displayData.length > 0 && (
                  <tfoot>
                    <tr className="bg-orange-50 border-t-2 border-orange-200 font-semibold">
                      {tab === 'ad' && <td className="px-4 py-3"/>}
                      <td className="px-4 py-3 text-sm text-orange-800">합계 / 전체</td>
                      {tab !== 'campaign' && adsetSubTab !== 'product' && <td className="px-4 py-3"/>}
                      {tab === 'adset' && <td className="px-4 py-3"/>}
                      <td className="px-4 py-3 text-right text-sm text-orange-800 whitespace-nowrap">{krw(displayTotals.spend)}</td>
                      <td className="px-4 py-3 text-right text-sm text-orange-800 whitespace-nowrap">{krw(displayTotals.revenue)}</td>
                      <td className={`px-4 py-3 text-right text-sm whitespace-nowrap ${roasBadge(displayTotals.roas)}`}>{displayTotals.roas}%</td>
                      <td className="px-4 py-3 text-right text-sm text-orange-800">{num(displayTotals.reach)}</td>
                      <td className="px-4 py-3 text-right text-sm text-orange-800">{num(displayTotals.impressions)}</td>
                      <td className="px-4 py-3 text-right text-sm text-orange-800">{num(displayTotals.clicks)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-400 pb-2">
          <span>ROAS 범례:</span>
          <span className="text-emerald-600 font-bold">■ 300%↑ 우수</span>
          <span className="text-amber-500 font-semibold">■ 150~299% 보통</span>
          <span className="text-rose-500 font-semibold">■ 150%↓ 주의</span>
          <span className="ml-auto text-gray-300">광고 매출 = GA4 소스/매체에 cpm 포함 | 바이럴 매출 = cpm 미포함</span>
        </div>
      </main>
    </div>
  );
}
