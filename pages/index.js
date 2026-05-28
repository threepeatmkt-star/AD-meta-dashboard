import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

function fmtDate(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function getPresetRange(preset) {
  const now = new Date();
  const yest = new Date(now.getTime() - 86400000);
  const dow = now.getDay();
  const diffToMon = dow === 0 ? 6 : dow - 1;
  const thisMon = new Date(now.getTime() - diffToMon * 86400000);
  const lastSun = new Date(thisMon.getTime() - 86400000);
  const lastMon = new Date(lastSun.getTime() - 6 * 86400000);
  switch (preset) {
    case 'today': return [fmtDate(now), fmtDate(now)];
    case 'yesterday': return [fmtDate(yest), fmtDate(yest)];
    case 'thisWeek': return [fmtDate(thisMon), fmtDate(now)];
    case 'lastWeek': return [fmtDate(lastMon), fmtDate(lastSun)];
    case 'last7': return [fmtDate(new Date(now-7*86400000)), fmtDate(yest)];
    case 'last14': return [fmtDate(new Date(now-14*86400000)), fmtDate(yest)];
    case 'last30': return [fmtDate(new Date(now-30*86400000)), fmtDate(yest)];
    case 'thisMonth': return [fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)), fmtDate(yest)];
    case 'lastMonth': return [fmtDate(new Date(now.getFullYear(), now.getMonth()-1, 1)), fmtDate(new Date(now.getFullYear(), now.getMonth(), 0))];
    default: return [fmtDate(new Date(now-7*86400000)), fmtDate(yest)];
  }
}

function getPrevRange(start, end) {
  const s = new Date(start), e = new Date(end);
  const days = Math.ceil((e - s) / 86400000) + 1;
  const pe = new Date(s - 86400000);
  const ps = new Date(pe - (days-1)*86400000);
  return [fmtDate(ps), fmtDate(pe)];
}

const krw = n => n ? '₩' + Math.round(n).toLocaleString('ko-KR') : '₩0';
const num = n => n ? Number(n).toLocaleString('ko-KR') : '0';

function roasCls(r) {
  if (r >= 300) return 'text-emerald-600 font-bold';
  if (r >= 150) return 'text-amber-500 font-semibold';
  if (r > 0) return 'text-rose-500 font-semibold';
  return 'text-gray-400';
}

function DeltaBadge({ curr, prev }) {
  if (!prev) return null;
  const pct = ((curr - prev) / prev) * 100;
  const up = pct >= 0;
  return <span className={`text-sm ml-1 ${up?'text-emerald-600':'text-rose-500'}`}>{up?'▲':'▼'}{Math.abs(pct).toFixed(1)}%</span>;
}

function extractProduct(name) {
  if (!name) return '-';
  const p = name.split('_');
  return p.length >= 2 ? p[1] : p[0];
}

function groupByProduct(rows) {
  const map = {};
  rows.forEach(r => {
    const prod = extractProduct(r.name);
    const key = `${r.campaignName}||${prod}`;
    if (!map[key]) map[key] = { id:key, campaignName:r.campaignName, product:prod, spend:0, revenue:0, reach:0, impressions:0, clicks:0, dailyBudget:0, count:0 };
    map[key].spend += r.spend; map[key].revenue += r.revenue;
    map[key].reach += r.reach; map[key].impressions += r.impressions; map[key].clicks += r.clicks;
    map[key].dailyBudget += r.dailyBudget||0; map[key].count++;
  });
  return Object.values(map).map(g => ({ ...g, roas: g.spend>0 ? Math.round(g.revenue/g.spend*1000)/10 : 0 }));
}

function sumRows(arr) {
  return arr.reduce((a,d) => ({ spend:a.spend+d.spend, revenue:a.revenue+d.revenue, reach:a.reach+d.reach, impressions:a.impressions+d.impressions, clicks:a.clicks+d.clicks }), { spend:0, revenue:0, reach:0, impressions:0, clicks:0 });
}

function Spinner() {
  return <svg className="w-6 h-6 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>;
}

function SummaryCard({ label, value, curr, prev, isRoas, roasVal, loading, accent }) {
  return (
    <div className={`bg-white rounded-2xl border p-5 shadow-sm ${accent ? 'border-orange-200 bg-orange-50/40' : 'border-gray-200'}`}>
      <p className="text-sm text-gray-400 mb-2 font-semibold tracking-wide">{label}</p>
      {loading
        ? <div className="h-9 bg-gray-100 rounded animate-pulse w-28"/>
        : <div className="flex items-baseline flex-wrap gap-1">
            <span className={`text-2xl font-bold ${isRoas ? roasCls(roasVal) : 'text-gray-900'}`}>{value}</span>
            {prev !== undefined && <DeltaBadge curr={curr} prev={prev}/>}
          </div>
      }
    </div>
  );
}

export default function Dashboard() {
  const [preset, setPreset] = useState('last7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [compare, setCompare] = useState(false);
  const [tab, setTab] = useState('campaign');
  const [adsetSubTab, setAdsetSubTab] = useState('adset');
  const [adsetFilter, setAdsetFilter] = useState('');
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

  const getRange = useCallback(() => preset === 'custom' ? [customStart, customEnd] : getPresetRange(preset), [preset, customStart, customEnd]);

  const load = useCallback(async () => {
    const [start, end] = getRange();
    if (!start || !end) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/dashboard?startDate=${start}&endDate=${end}&level=${tab}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setData(j.data||[]); setAdRevenue(j.adRevenue||0); setViralRevenue(j.viralRevenue||0);
      if (compare) {
        const [ps, pe] = getPrevRange(start, end);
        const pr = await fetch(`/api/dashboard?startDate=${ps}&endDate=${pe}&level=${tab}`);
        const pj = await pr.json();
        setPrevData(pj.data||[]); setPrevAdRevenue(pj.adRevenue||0); setPrevViralRevenue(pj.viralRevenue||0);
      } else { setPrevData([]); setPrevAdRevenue(0); setPrevViralRevenue(0); }
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }, [getRange, tab, compare]);

  useEffect(() => { load(); }, [load]);

  const totals = { ...sumRows(data) };
  totals.roas = totals.spend > 0 ? Math.round(totals.revenue/totals.spend*1000)/10 : 0;
  const prevTotals = { ...sumRows(prevData) };
  prevTotals.roas = prevTotals.spend > 0 ? Math.round(prevTotals.revenue/prevTotals.spend*1000)/10 : 0;

  const [rangeStart, rangeEnd] = getRange();
  const [prevStart, prevEnd] = rangeStart && rangeEnd ? getPrevRange(rangeStart, rangeEnd) : ['',''];

  const adsetOptions = tab === 'ad' ? [...new Set(data.map(d=>d.adsetName).filter(Boolean))].sort() : [];
  const filteredAds = adsetFilter ? data.filter(d=>d.adsetName===adsetFilter) : data;
  const productGroupData = adsetSubTab === 'product' ? groupByProduct(data) : [];
  const displayData = tab==='adset' && adsetSubTab==='product' ? productGroupData : tab==='ad' ? filteredAds : data;
  const dispTotals = { ...sumRows(displayData) };
  dispTotals.roas = dispTotals.spend > 0 ? Math.round(dispTotals.revenue/dispTotals.spend*1000)/10 : 0;

  const PRESETS = [
    {v:'today',l:'오늘'},{v:'yesterday',l:'어제'},{v:'thisWeek',l:'이번 주'},{v:'lastWeek',l:'지난 주'},
    {v:'last7',l:'최근 7일'},{v:'last14',l:'최근 14일'},{v:'last30',l:'최근 30일'},
    {v:'thisMonth',l:'이번 달'},{v:'lastMonth',l:'지난 달'},{v:'custom',l:'직접 설정'},
  ];
  const TABS = [{v:'campaign',l:'📊 캠페인'},{v:'adset',l:'🎯 광고세트'},{v:'ad',l:'🖼 소재'}];

  return (
    <div className="min-h-screen bg-gray-50" style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif"}}>
      <Head>
        <title>삼대오백 광고 대시보드</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link rel="preconnect" href="https://cdn.jsdelivr.net"/>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"/>
      </Head>

      {/* 썸네일 호버 */}
      {hoverThumb && (
        <div className="fixed z-[9999] pointer-events-none" style={{top:Math.max(8,hoverThumb.y-220), left:hoverThumb.x+20}}>
          <img src={hoverThumb.src} className="w-56 h-56 object-cover rounded-2xl shadow-2xl border-2 border-white"/>
        </div>
      )}

      {/* ── 헤더 ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center shadow">
              <span className="text-white text-sm font-extrabold tracking-tighter">500</span>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 leading-tight">삼대오백 광고 대시보드</p>
              <p className="text-sm text-gray-400">Meta Ads × GA4 통합 효율 분석 (사내용)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && <span className="text-sm text-gray-400 hidden sm:inline">업데이트: {lastUpdated}</span>}
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors shadow-sm">
              {loading ? <Spinner/> : <span>🔄</span>}
              <span className="hidden sm:inline">새로고침</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── 날짜 필터 ── */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-screen-xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map(p => (
              <button key={p.v} onClick={() => setPreset(p.v)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${preset===p.v ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {p.l}
              </button>
            ))}
            {preset === 'custom' && (
              <div className="flex items-center gap-2 ml-1">
                <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)}
                  className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"/>
                <span className="text-gray-400 font-semibold">~</span>
                <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)}
                  className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"/>
              </div>
            )}
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <span className="text-sm text-gray-500 font-medium whitespace-nowrap">이전 기간 비교</span>
              <button onClick={()=>setCompare(!compare)}
                className={`relative w-12 h-6 rounded-full transition-colors ${compare?'bg-orange-500':'bg-gray-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${compare?'translate-x-6':''}`}/>
              </button>
            </div>
          </div>
          {rangeStart && (
            <p className="mt-2 text-sm text-gray-400 font-medium">
              📅 {rangeStart === rangeEnd ? rangeStart : `${rangeStart} ~ ${rangeEnd}`}
              {compare && prevStart && <span className="ml-3 text-blue-400">| 비교: {prevStart} ~ {prevEnd}</span>}
            </p>
          )}
        </div>
      </div>

      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-5">
        {error && (
          <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-base text-red-700">
            <strong>⚠️ 오류:</strong> {error}
          </div>
        )}

        {/* ── 요약 카드 ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <div className="col-span-2 md:col-span-4 lg:col-span-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <SummaryCard label="광고비 (Meta)" value={krw(totals.spend)} curr={totals.spend} prev={compare?prevTotals.spend:undefined} loading={loading}/>
            <SummaryCard label="ROAS" value={`${totals.roas}%`} curr={totals.roas} prev={compare?prevTotals.roas:undefined} isRoas roasVal={totals.roas} loading={loading}/>
            <SummaryCard label="도달" value={num(totals.reach)} curr={totals.reach} prev={compare?prevTotals.reach:undefined} loading={loading}/>
            <SummaryCard label="노출" value={num(totals.impressions)} curr={totals.impressions} prev={compare?prevTotals.impressions:undefined} loading={loading}/>
            <SummaryCard label="링크 클릭" value={num(totals.clicks)} curr={totals.clicks} prev={compare?prevTotals.clicks:undefined} loading={loading}/>
          </div>
          <div className="col-span-2 md:col-span-4 lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard label="총 매출 (GA4)" value={krw(totals.revenue)} curr={totals.revenue} prev={compare?prevTotals.revenue:undefined} loading={loading} accent/>
            <SummaryCard label="📣 광고 매출" value={krw(adRevenue)} curr={adRevenue} prev={compare?prevAdRevenue:undefined} loading={loading} accent/>
            <SummaryCard label="📱 바이럴 매출" value={krw(viralRevenue)} curr={viralRevenue} prev={compare?prevViralRevenue:undefined} loading={loading} accent/>
          </div>
        </div>

        {/* ── 테이블 ── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          {/* 탭 */}
          <div className="flex items-center border-b border-gray-100 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.v} onClick={() => { setTab(t.v); setAdsetFilter(''); }}
                className={`px-7 py-4 text-base font-bold border-b-2 whitespace-nowrap transition-colors ${tab===t.v ? 'border-orange-500 text-orange-600 bg-orange-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                {t.l}
              </button>
            ))}
            {/* 소재 탭 광고세트 필터 */}
            {tab === 'ad' && adsetOptions.length > 0 && (
              <div className="ml-3 flex items-center gap-2">
                <select value={adsetFilter} onChange={e=>setAdsetFilter(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white max-w-[240px] font-medium">
                  <option value="">전체 광고세트</option>
                  {adsetOptions.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                {adsetFilter && <button onClick={()=>setAdsetFilter('')} className="text-sm text-gray-400 hover:text-gray-600 px-2 font-medium">✕</button>}
              </div>
            )}
            <div className="ml-auto px-5 py-4 shrink-0">
              <span className="text-sm text-gray-400 font-medium">{loading ? '로딩 중…' : `${displayData.length}건`}</span>
            </div>
          </div>

          {/* 광고세트 서브탭 */}
          {tab === 'adset' && (
            <div className="flex border-b border-gray-100 bg-gray-50/50">
              {[{v:'adset',l:'세트별'},{v:'product',l:'캠페인 · 제품별'}].map(st => (
                <button key={st.v} onClick={()=>setAdsetSubTab(st.v)}
                  className={`px-6 py-3 text-sm font-bold transition-colors ${adsetSubTab===st.v ? 'text-orange-600 border-b-2 border-orange-500 bg-white' : 'text-gray-400 hover:text-gray-600'}`}>
                  {st.l}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center h-56 gap-4">
              <Spinner/>
              <p className="text-base text-gray-400">Meta & GA4 데이터 불러오는 중…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {tab==='ad' && <th className="px-5 py-4 text-left text-sm font-bold text-gray-500 uppercase w-24">썸네일</th>}
                    <th className="px-5 py-4 text-left text-sm font-bold text-gray-500 uppercase min-w-[200px]">
                      {tab==='campaign' ? '캠페인명' : tab==='adset' ? (adsetSubTab==='product' ? '캠페인 / 제품' : '광고세트명') : '소재명'}
                    </th>
                    {tab!=='campaign' && adsetSubTab!=='product' && <th className="px-5 py-4 text-left text-sm font-bold text-gray-500 uppercase min-w-[140px]">캠페인</th>}
                    {tab==='adset' && <th className="px-5 py-4 text-right text-sm font-bold text-gray-500 uppercase whitespace-nowrap">일예산</th>}
                    {['광고비','매출액','ROAS','도달','노출','클릭'].map(h => (
                      <th key={h} className="px-5 py-4 text-right text-sm font-bold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayData.length === 0 ? (
                    <tr><td colSpan={12} className="px-5 py-20 text-center">
                      <p className="text-4xl mb-3">📭</p>
                      <p className="text-gray-400 text-base">데이터가 없습니다.</p>
                    </td></tr>
                  ) : displayData.map((row, i) => {
                    const prev = prevData.find(p=>p.id===row.id);
                    return (
                      <tr key={i} className="hover:bg-orange-50/20 transition-colors">
                        {tab==='ad' && (
                          <td className="px-5 py-3">
                            {row.thumbnail
                              ? <img src={row.thumbnail} alt="" className="w-20 h-20 rounded-xl object-cover border border-gray-200 shadow-sm cursor-zoom-in"
                                  onMouseEnter={e=>setHoverThumb({src:row.thumbnail,x:e.clientX,y:e.clientY})}
                                  onMouseMove={e=>setHoverThumb(p=>p?{...p,x:e.clientX,y:e.clientY}:null)}
                                  onMouseLeave={()=>setHoverThumb(null)}
                                  onError={e=>{e.target.style.display='none';}}/>
                              : <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center text-gray-300 text-2xl">🖼</div>
                            }
                          </td>
                        )}
                        <td className="px-5 py-4">
                          {adsetSubTab==='product' && tab==='adset' ? (
                            <div>
                              <p className="text-sm text-gray-400 mb-0.5 font-medium">{row.campaignName}</p>
                              <p className="font-bold text-gray-900 text-base">{row.product}</p>
                              <p className="text-xs text-gray-300 mt-0.5">{row.count}개 세트</p>
                            </div>
                          ) : (
                            <div>
                              <p className="font-semibold text-gray-900 truncate max-w-xs text-base" title={row.name}>{row.name}</p>
                              {tab==='ad' && row.adsetName && (
                                <button onClick={()=>{setTab('ad');setAdsetFilter(row.adsetName);}}
                                  className="text-sm text-orange-400 hover:text-orange-600 hover:underline mt-0.5 text-left truncate max-w-xs block font-medium">
                                  {row.adsetName}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        {tab!=='campaign' && adsetSubTab!=='product' && (
                          <td className="px-5 py-4">
                            <p className="text-sm text-gray-400 truncate max-w-[160px] font-medium" title={row.campaignName}>{row.campaignName}</p>
                          </td>
                        )}
                        {tab==='adset' && (
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            {row.dailyBudget > 0
                              ? <span className="text-gray-700 font-semibold">{krw(row.dailyBudget)}</span>
                              : <span className="text-sm text-gray-300 font-medium">CBO</span>
                            }
                          </td>
                        )}
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <span className="text-gray-700 font-semibold">{krw(row.spend)}</span>
                          {compare && prev && <DeltaBadge curr={row.spend} prev={prev.spend}/>}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <span className={row.revenue>0?'text-gray-700 font-semibold':'text-gray-300'}>{krw(row.revenue)}</span>
                          {compare && prev && <DeltaBadge curr={row.revenue} prev={prev.revenue}/>}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <span className={roasCls(row.roas)}>{row.roas}%</span>
                          {compare && prev && <DeltaBadge curr={row.roas} prev={prev.roas}/>}
                        </td>
                        <td className="px-5 py-4 text-right text-gray-600 font-medium whitespace-nowrap">{num(row.reach)}</td>
                        <td className="px-5 py-4 text-right text-gray-600 font-medium whitespace-nowrap">{num(row.impressions)}</td>
                        <td className="px-5 py-4 text-right text-gray-600 font-medium whitespace-nowrap">{num(row.clicks)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {displayData.length > 0 && (
                  <tfoot>
                    <tr className="bg-orange-50 border-t-2 border-orange-200">
                      {tab==='ad' && <td className="px-5 py-4"/>}
                      <td className="px-5 py-4 text-base font-bold text-orange-800">합계 / 전체</td>
                      {tab!=='campaign' && adsetSubTab!=='product' && <td className="px-5 py-4"/>}
                      {tab==='adset' && <td className="px-5 py-4"/>}
                      <td className="px-5 py-4 text-right text-base font-bold text-orange-800 whitespace-nowrap">{krw(dispTotals.spend)}</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-orange-800 whitespace-nowrap">{krw(dispTotals.revenue)}</td>
                      <td className={`px-5 py-4 text-right text-base whitespace-nowrap ${roasCls(dispTotals.roas)}`}>{dispTotals.roas}%</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-orange-800">{num(dispTotals.reach)}</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-orange-800">{num(dispTotals.impressions)}</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-orange-800">{num(dispTotals.clicks)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center gap-5 text-sm text-gray-400 pb-3">
          <span className="font-semibold">ROAS 범례:</span>
          <span className="text-emerald-600 font-bold">■ 300%↑ 우수</span>
          <span className="text-amber-500 font-semibold">■ 150~299% 보통</span>
          <span className="text-rose-500 font-semibold">■ 150%↓ 주의</span>
          <span className="ml-auto text-gray-300 text-xs">광고 매출 = GA4 소스/매체 cpm 포함 | 바이럴 매출 = cpm 미포함</span>
        </div>
      </main>
    </div>
  );
}
