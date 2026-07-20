/**
 * pages/all.js — 통합 조회 (삼대오백 + 엠엑시브)
 * A안(전사 요약 + 브랜드 비교 + 차트) + B안(브랜드 컬럼 통합 테이블)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { BRAND_LIST } from '../lib/brands';

const INK = '#111827';

function fmtDate(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function getPresetRange(preset) {
  const now = new Date(), yest = new Date(now-86400000);
  const dow = now.getDay(), dm = dow===0?6:dow-1;
  const thisMon = new Date(now-dm*86400000);
  const lastSun = new Date(thisMon-86400000), lastMon = new Date(lastSun-6*86400000);
  switch(preset) {
    case 'today': return [fmtDate(now),fmtDate(now)];
    case 'yesterday': return [fmtDate(yest),fmtDate(yest)];
    case 'thisWeek': return [fmtDate(thisMon),fmtDate(now)];
    case 'lastWeek': return [fmtDate(lastMon),fmtDate(lastSun)];
    case 'lastLastWeek': {
      const llSun = new Date(lastMon - 86400000);
      const llMon = new Date(llSun - 6 * 86400000);
      return [fmtDate(llMon), fmtDate(llSun)];
    }
    case 'last7': return [fmtDate(new Date(now-7*86400000)),fmtDate(yest)];
    case 'last14': return [fmtDate(new Date(now-14*86400000)),fmtDate(yest)];
    case 'last30': return [fmtDate(new Date(now-30*86400000)),fmtDate(yest)];
    case 'thisMonth': return [fmtDate(new Date(now.getFullYear(),now.getMonth(),1)),fmtDate(yest)];
    case 'lastMonth': return [fmtDate(new Date(now.getFullYear(),now.getMonth()-1,1)),fmtDate(new Date(now.getFullYear(),now.getMonth(),0))];
    default: return [fmtDate(lastMon),fmtDate(lastSun)];
  }
}
function getPrevRange(s,e) {
  const sd=new Date(s),ed=new Date(e),days=Math.ceil((ed-sd)/86400000)+1;
  const pe=new Date(sd-86400000),ps=new Date(pe-(days-1)*86400000);
  return [fmtDate(ps),fmtDate(pe)];
}

const krw = n => n?'₩'+Math.round(n).toLocaleString('ko-KR'):'₩0';
const krwShort = n => {
  if (!n) return '₩0';
  if (n >= 100000000) return `₩${(n/100000000).toFixed(1)}억`;
  if (n >= 10000000) return `₩${(n/10000000).toFixed(1)}천만`;
  if (n >= 10000) return `₩${(n/10000).toFixed(0)}만`;
  return `₩${Math.round(n).toLocaleString()}`;
};
const num = n => n?Number(n).toLocaleString('ko-KR'):'0';
const ctr = (c,i) => i>0?(c/i*100).toFixed(2)+'%':'0%';
function roasCls(r) {
  if(r>=300) return 'text-blue-600 font-bold';
  if(r>=150) return 'text-amber-500 font-semibold';
  if(r>0) return 'text-rose-500 font-semibold';
  return 'text-gray-400';
}
function Delta({curr,prev,type='pct'}) {
  if(prev==null||prev===0) return null;
  const diff=curr-prev, up=diff>=0;
  const color=up?'text-emerald-600':'text-rose-500';
  const arrow=up?'▲':'▼';
  if(type==='currency') return <span className={`text-sm ml-1 ${color}`}>{arrow}₩{Math.round(Math.abs(diff)).toLocaleString('ko-KR')}</span>;
  if(type==='number') return <span className={`text-sm ml-1 ${color}`}>{arrow}{Math.abs(diff).toLocaleString('ko-KR')}</span>;
  const p=((curr-prev)/prev)*100;
  return <span className={`text-sm ml-1 ${color}`}>{arrow}{Math.abs(p).toFixed(1)}%</span>;
}
function Spinner({sm}) {
  return <svg className={`${sm?'w-4 h-4':'w-6 h-6'} animate-spin text-gray-500`} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>;
}
function sumRows(arr) {
  return arr.reduce((a,d)=>({spend:a.spend+d.spend,revenue:a.revenue+d.revenue,reach:a.reach+d.reach,impressions:a.impressions+d.impressions,clicks:a.clicks+d.clicks}),{spend:0,revenue:0,reach:0,impressions:0,clicks:0});
}

async function loadHtml2Canvas() {
  if (window.html2canvas) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function AllBrandsPage() {
  const router = useRouter();
  const summaryRef = useRef(null);
  const [authed, setAuthed] = useState(null);
  const [preset, setPreset] = useState('lastWeek');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [compare, setCompare] = useState(true);
  const [level, setLevel] = useState('campaign');
  const [sortKey, setSortKey] = useState('spend');
  const [copying, setCopying] = useState(false);

  const [byBrand, setByBrand] = useState({});     // { id: {rows, adRevenue, viralRevenue} }
  const [prevByBrand, setPrevByBrand] = useState({});
  const [dailyByBrand, setDailyByBrand] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => { setAuthed(sessionStorage.getItem('dash_auth') === '1'); }, []);

  const getRange = useCallback(
    () => (preset === 'custom' ? [customStart, customEnd] : getPresetRange(preset)),
    [preset, customStart, customEnd]
  );

  const load = useCallback(async () => {
    const [start, end] = getRange();
    if (!start || !end) return;
    setLoading(true); setError('');
    try {
      const [ps, pe] = getPrevRange(start, end);
      const results = await Promise.all(BRAND_LIST.map(async b => {
        const [curR, dailyR, prevR] = await Promise.all([
          fetch(`/api/dashboard?brand=${b.id}&startDate=${start}&endDate=${end}&level=${level}`).then(r=>r.json()),
          fetch(`/api/daily?brand=${b.id}&startDate=${start}&endDate=${end}`).then(r=>r.json()),
          compare
            ? fetch(`/api/dashboard?brand=${b.id}&startDate=${ps}&endDate=${pe}&level=${level}`).then(r=>r.json())
            : Promise.resolve(null),
        ]);
        if (curR.error) throw new Error(`[${b.name}] ${curR.error}`);
        return { b, curR, dailyR, prevR };
      }));

      const cur = {}, prev = {}, daily = {};
      results.forEach(({ b, curR, dailyR, prevR }) => {
        cur[b.id] = { rows: curR.data || [], adRevenue: curR.adRevenue || 0, viralRevenue: curR.viralRevenue || 0 };
        daily[b.id] = dailyR.daily || [];
        if (prevR && !prevR.error) prev[b.id] = { rows: prevR.data || [], adRevenue: prevR.adRevenue || 0, viralRevenue: prevR.viralRevenue || 0 };
      });
      setByBrand(cur); setPrevByBrand(prev); setDailyByBrand(daily);
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [getRange, level, compare]);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  if (authed === null) return null;
  if (!authed) { if (typeof window !== 'undefined') router.replace('/'); return null; }

  const [rangeStart, rangeEnd] = getRange();
  const [prevStart, prevEnd] = rangeStart && rangeEnd ? getPrevRange(rangeStart, rangeEnd) : ['',''];
  const dateRangeLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart} ~ ${rangeEnd}`;

  // ── 브랜드별 집계 ──────────────────────────────────────────────
  const stats = BRAND_LIST.map(b => {
    const d = byBrand[b.id];
    const p = prevByBrand[b.id];
    const t = d ? sumRows(d.rows) : { spend:0,revenue:0,reach:0,impressions:0,clicks:0 };
    const revenue = d ? d.adRevenue + d.viralRevenue : 0;
    const pt = p ? sumRows(p.rows) : null;
    const pRevenue = p ? p.adRevenue + p.viralRevenue : null;
    return {
      brand: b,
      spend: t.spend, revenue,
      roas: t.spend > 0 ? Math.round(revenue / t.spend * 1000) / 10 : 0,
      reach: t.reach, impressions: t.impressions, clicks: t.clicks,
      adRevenue: d?.adRevenue || 0, viralRevenue: d?.viralRevenue || 0,
      prevSpend: pt ? pt.spend : null,
      prevRevenue: pRevenue,
      prevRoas: pt && pt.spend > 0 ? Math.round(pRevenue / pt.spend * 1000) / 10 : null,
    };
  });

  const total = stats.reduce((a, s) => ({
    spend: a.spend + s.spend, revenue: a.revenue + s.revenue,
    reach: a.reach + s.reach, impressions: a.impressions + s.impressions, clicks: a.clicks + s.clicks,
    prevSpend: a.prevSpend + (s.prevSpend || 0), prevRevenue: a.prevRevenue + (s.prevRevenue || 0),
  }), { spend:0, revenue:0, reach:0, impressions:0, clicks:0, prevSpend:0, prevRevenue:0 });
  total.roas = total.spend > 0 ? Math.round(total.revenue / total.spend * 1000) / 10 : 0;
  total.prevRoas = total.prevSpend > 0 ? Math.round(total.prevRevenue / total.prevSpend * 1000) / 10 : null;

  // ── 차트 데이터 ────────────────────────────────────────────────
  const allDates = [...new Set(BRAND_LIST.flatMap(b => (dailyByBrand[b.id] || []).map(d => d.date)))].sort();
  const trendData = allDates.map(date => {
    const row = { date: date.slice(5) };
    BRAND_LIST.forEach(b => {
      const hit = (dailyByBrand[b.id] || []).find(d => d.date === date);
      row[b.name] = hit ? hit.roas : null;
    });
    return row;
  });
  const pieData = stats.filter(s => s.spend > 0).map(s => ({ name: s.brand.name, value: Math.round(s.spend), color: s.brand.color }));

  // ── 통합 테이블 ────────────────────────────────────────────────
  const merged = BRAND_LIST.flatMap(b =>
    (byBrand[b.id]?.rows || []).map(r => ({ ...r, _brand: b }))
  ).sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

  const mergedTotals = sumRows(merged);
  mergedTotals.roas = mergedTotals.spend > 0 ? Math.round(mergedTotals.revenue / mergedTotals.spend * 1000) / 10 : 0;

  const copySummary = async () => {
    setCopying(true);
    try {
      await loadHtml2Canvas();
      const canvas = await window.html2canvas(summaryRef.current, { backgroundColor:'#f8fafc', scale:2, useCORS:true, logging:false });
      canvas.toBlob(async blob => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          alert('📋 클립보드에 복사됐어요! 슬랙/카톡에 붙여넣기 하세요.');
        } catch {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `통합조회_${dateRangeLabel.replace(/\s/g,'')}.png`; a.click();
          URL.revokeObjectURL(url);
        }
      }, 'image/png');
    } catch (e) { alert('캡처 실패: ' + e.message); }
    finally { setCopying(false); }
  };

  const exportCSV = () => {
    const head = ['브랜드', level==='campaign'?'캠페인명':level==='adset'?'광고세트명':'소재명','캠페인','광고비','매출액','ROAS(%)','도달','노출','클릭','CTR(%)'];
    const rows = merged.map(r => [
      r._brand.name, r.name, r.campaignName, r.spend, r.revenue, r.roas, r.reach, r.impressions, r.clicks,
      r.impressions>0?(r.clicks/r.impressions*100).toFixed(2):'0',
    ]);
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `통합_광고리포트_${dateRangeLabel.replace(/~/g,'-').replace(/\s/g,'')}_${level}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const PRESETS=[
    {v:'today',l:'오늘'},{v:'yesterday',l:'어제'},{v:'thisWeek',l:'이번 주'},{v:'lastWeek',l:'지난 주'},{v:'lastLastWeek',l:'지지난 주'},
    {v:'last7',l:'최근 7일'},{v:'last14',l:'최근 14일'},{v:'last30',l:'최근 30일'},
    {v:'thisMonth',l:'이번 달'},{v:'lastMonth',l:'지난 달'},{v:'custom',l:'직접 설정'},
  ];
  const SORTS=[{v:'spend',l:'광고비순'},{v:'revenue',l:'매출액순'},{v:'roas',l:'ROAS순'}];
  const LEVELS=[{v:'campaign',l:'📊 캠페인'},{v:'adset',l:'🎯 광고세트'},{v:'ad',l:'🖼 소재'}];

  return (
    <div className="min-h-screen bg-slate-50" style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif"}}>
      <Head>
        <title>통합 조회 | THREEPEAT Meta Ads Dashboard</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"/>
      </Head>

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl shadow-md bg-white border border-gray-100 flex items-center justify-center overflow-hidden">
              <img src="/meta_logo.png" alt="" className="w-8 h-8 object-contain"/>
            </div>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
              <span className="px-3 py-1 rounded-full text-white text-xs font-bold whitespace-nowrap" style={{background:INK}}>통합</span>
              <p className="text-base sm:text-lg font-bold text-gray-900 whitespace-nowrap">Meta Ads Dashboard</p>
              <span className="hidden sm:inline text-gray-300">|</span>
              <p className="w-full sm:w-auto text-[11px] text-gray-300 sm:text-sm sm:text-gray-400">
                삼대오백 + 엠엑시브 통합 효율 분석
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated&&<span className="text-sm text-gray-400 hidden lg:inline">업데이트: {lastUpdated}</span>}
            <button onClick={()=>router.push('/')}
              className="px-3 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-semibold hover:bg-gray-50 whitespace-nowrap">
              🔀 브랜드 변경
            </button>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-60"
              style={{background:INK}}>
              {loading?<Spinner/>:<span>🔄</span>}
              <span className="hidden sm:inline">새로고침</span>
            </button>
          </div>
        </div>
      </header>

      {/* 날짜 필터 */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-screen-xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map(p=>(
              <button key={p.v} onClick={()=>setPreset(p.v)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${preset===p.v?'text-white shadow-sm':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                style={preset===p.v?{background:INK}:{}}>
                {p.l}
              </button>
            ))}
            {preset==='custom'&&(
              <div className="flex items-center gap-2 ml-1">
                <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm"/>
                <span className="text-gray-400 font-semibold">~</span>
                <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm"/>
              </div>
            )}
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <span className="text-sm text-gray-500 font-medium whitespace-nowrap">이전 기간 비교</span>
              <button onClick={()=>setCompare(!compare)}
                className={`relative w-12 h-6 rounded-full transition-colors ${compare?'':'bg-gray-300'}`}
                style={compare?{background:INK}:{}}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${compare?'translate-x-6':''}`}/>
              </button>
            </div>
          </div>
          {rangeStart&&(
            <p className="mt-2 text-sm text-gray-400 font-medium">
              📅 {dateRangeLabel}
              {compare&&prevStart&&<span className="ml-3 text-gray-400">| 비교: {prevStart} ~ {prevEnd}</span>}
            </p>
          )}
        </div>
      </div>

      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
        {error&&<div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-base text-red-700"><strong>⚠️ 오류:</strong> {error}</div>}

        {/* ── A안: 요약 + 브랜드 비교 ───────────────────────── */}
        <div ref={summaryRef} className="rounded-2xl p-1 space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-white text-xs font-bold" style={{background:INK}}>통합</span>
              <span className="text-sm text-gray-500 font-medium">📅 {dateRangeLabel}</span>
              {compare&&prevStart&&<span className="text-sm text-gray-400">| 비교: {prevStart} ~ {prevEnd}</span>}
            </div>
            <button onClick={copySummary} disabled={copying}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-xl text-xs font-bold hover:bg-gray-50 disabled:opacity-60">
              {copying?'⏳ 캡처 중…':'📋 COPY'}
            </button>
          </div>

          {/* 전사 합계 */}
          <div className="rounded-2xl border-2 p-6 shadow-sm bg-white" style={{borderColor:INK}}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">전사 합계</p>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-sm font-semibold text-gray-400 mb-1">광고비 (Meta)</p>
                <div className="flex items-baseline flex-wrap gap-1">
                  <span className="text-3xl font-bold text-gray-900">{krw(total.spend)}</span>
                  {compare&&<Delta curr={total.spend} prev={total.prevSpend} type="currency"/>}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-400 mb-1">총 매출 (GA4·SNS)</p>
                <div className="flex items-baseline flex-wrap gap-1">
                  <span className="text-3xl font-bold text-gray-900">{krw(total.revenue)}</span>
                  {compare&&<Delta curr={total.revenue} prev={total.prevRevenue} type="currency"/>}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-400 mb-1">통합 ROAS</p>
                <div className="flex items-baseline flex-wrap gap-1">
                  <span className={`text-3xl ${roasCls(total.roas)}`}>{total.roas}%</span>
                  {compare&&<Delta curr={total.roas} prev={total.prevRoas} type="pct"/>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-6 mt-6 pt-5 border-t border-gray-100">
              {[['도달',num(total.reach)],['노출',num(total.impressions)],['클릭 수',num(total.clicks)],['CTR',ctr(total.clicks,total.impressions)]].map(([l,v])=>(
                <div key={l}>
                  <p className="text-xs font-semibold text-gray-400 mb-1">{l}</p>
                  <p className="text-xl font-bold text-gray-700">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 브랜드별 비교 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.map(s=>(
              <div key={s.brand.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center overflow-hidden">
                      <img src={s.brand.logo} alt="" className="w-7 h-7 object-contain"
                        onError={e=>{e.target.outerHTML=`<span style="font-size:20px">${s.brand.emoji}</span>`;}}/>
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-lg">{s.brand.name}</p>
                      <p className="text-xs text-gray-300 tracking-wider">{s.brand.nameEn}</p>
                    </div>
                  </div>
                  <button onClick={()=>router.push(`/${s.brand.id}`)}
                    className="px-3 py-1.5 rounded-lg text-white text-xs font-bold" style={{background:s.brand.color}}>
                    상세 →
                  </button>
                </div>
                <div className="space-y-3">
                  {[
                    ['광고비', krw(s.spend), s.spend, s.prevSpend, 'currency'],
                    ['매출액', krw(s.revenue), s.revenue, s.prevRevenue, 'currency'],
                  ].map(([l,v,c,p,t])=>(
                    <div key={l} className="flex items-baseline justify-between">
                      <span className="text-sm text-gray-400 font-medium">{l}</span>
                      <span className="text-lg font-bold text-gray-900">
                        {v}{compare&&<Delta curr={c} prev={p} type={t}/>}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-gray-400 font-medium">ROAS</span>
                    <span className={`text-lg ${roasCls(s.roas)}`}>
                      {s.roas}%{compare&&<Delta curr={s.roas} prev={s.prevRoas} type="pct"/>}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">├ DA 광고 매출</span>
                      <span className="text-gray-600 font-semibold">{krw(s.adRevenue)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">└ SNS 바이럴 매출</span>
                      <span className="text-gray-600 font-semibold">{krw(s.viralRevenue)}</span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="text-gray-400 font-medium">예산 비중</span>
                      <span className="font-bold" style={{color:s.brand.color}}>
                        {total.spend>0?(s.spend/total.spend*100).toFixed(1):0}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{width:`${total.spend>0?s.spend/total.spend*100:0}%`,background:s.brand.color}}/>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 차트 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="font-bold text-gray-900">일별 ROAS 추이</p>
              <p className="text-xs text-gray-400 mt-0.5">브랜드별 비교</p>
            </div>
            <div className="p-5">
              {loading?<div className="h-[280px] flex items-center justify-center"><Spinner/></div>:(
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="date" tick={{fontSize:11}} interval="preserveStartEnd"/>
                    <YAxis tickFormatter={v=>`${v}%`} tick={{fontSize:11}} width={55}/>
                    <Tooltip formatter={v=>`${v}%`}/>
                    <Legend/>
                    {BRAND_LIST.map(b=>(
                      <Line key={b.id} type="monotone" dataKey={b.name} stroke={b.color}
                        strokeWidth={2.5} dot={false} connectNulls activeDot={{r:5}}/>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="font-bold text-gray-900">광고비 배분</p>
              <p className="text-xs text-gray-400 mt-0.5">{krw(total.spend)}</p>
            </div>
            <div className="p-5">
              {loading?<div className="h-[280px] flex items-center justify-center"><Spinner/></div>:(
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                        {pieData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                      </Pie>
                      <Tooltip formatter={v=>krw(v)}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {pieData.map((d,i)=>(
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{background:d.color}}/>
                        <span className="text-sm text-gray-600 flex-1">{d.name}</span>
                        <span className="text-sm font-bold text-gray-900">{krwShort(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── B안: 통합 테이블 ──────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="flex items-center border-b border-gray-100 overflow-x-auto">
            {LEVELS.map(t=>(
              <button key={t.v} onClick={()=>setLevel(t.v)}
                className={`px-7 py-4 text-base font-bold border-b-2 whitespace-nowrap transition-colors ${level===t.v?'bg-gray-50':'border-transparent text-gray-500 hover:bg-gray-50'}`}
                style={level===t.v?{borderColor:INK,color:INK}:{}}>
                {t.l}
              </button>
            ))}
            <div className="ml-auto px-4 flex items-center gap-2">
              {SORTS.map(s=>(
                <button key={s.v} onClick={()=>setSortKey(s.v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${sortKey===s.v?'text-white':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  style={sortKey===s.v?{background:INK}:{}}>
                  {s.l}
                </button>
              ))}
              <button onClick={exportCSV} disabled={!merged.length}
                className="px-3 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-40">
                📥 CSV
              </button>
              <span className="text-sm text-gray-400 font-medium whitespace-nowrap">{loading?'로딩 중…':`${merged.length}건`}</span>
            </div>
          </div>

          {loading?(
            <div className="flex flex-col items-center justify-center h-56 gap-4">
              <Spinner/><p className="text-base text-gray-400">두 브랜드 데이터 불러오는 중…</p>
            </div>
          ):(
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-5 py-4 text-left text-sm font-bold text-gray-500 uppercase w-28">브랜드</th>
                    <th className="px-5 py-4 text-left text-sm font-bold text-gray-500 uppercase min-w-[200px]">
                      {level==='campaign'?'캠페인명':level==='adset'?'광고세트명':'소재명'}
                    </th>
                    {level!=='campaign'&&<th className="px-5 py-4 text-left text-sm font-bold text-gray-500 uppercase min-w-[130px]">캠페인</th>}
                    {['광고비','매출액','ROAS','도달','노출','클릭','CTR'].map(h=>(
                      <th key={h} className="px-5 py-4 text-right text-sm font-bold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {merged.length===0?(
                    <tr><td colSpan={11} className="px-5 py-20 text-center">
                      <p className="text-4xl mb-3">📭</p><p className="text-gray-400 text-base">데이터가 없습니다.</p>
                    </td></tr>
                  ):merged.map((row,i)=>(
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <span className="px-2.5 py-1 rounded-lg text-white text-xs font-bold whitespace-nowrap" style={{background:row._brand.color}}>
                          {row._brand.name}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-900 truncate max-w-xs text-base" title={row.name}>{row.name}</p>
                      </td>
                      {level!=='campaign'&&(
                        <td className="px-5 py-4"><p className="text-sm text-gray-400 truncate max-w-[150px] font-medium" title={row.campaignName}>{row.campaignName}</p></td>
                      )}
                      <td className="px-5 py-4 text-right whitespace-nowrap text-gray-700 font-semibold">{krw(row.spend)}</td>
                      <td className={`px-5 py-4 text-right whitespace-nowrap font-semibold ${row.revenue>0?'text-gray-700':'text-gray-300'}`}>{krw(row.revenue)}</td>
                      <td className={`px-5 py-4 text-right whitespace-nowrap ${roasCls(row.roas)}`}>{row.roas}%</td>
                      <td className="px-5 py-4 text-right text-gray-600 font-medium whitespace-nowrap">{num(row.reach)}</td>
                      <td className="px-5 py-4 text-right text-gray-600 font-medium whitespace-nowrap">{num(row.impressions)}</td>
                      <td className="px-5 py-4 text-right text-gray-600 font-medium whitespace-nowrap">{num(row.clicks)}</td>
                      <td className="px-5 py-4 text-right text-gray-600 font-medium whitespace-nowrap">{ctr(row.clicks,row.impressions)}</td>
                    </tr>
                  ))}
                </tbody>
                {merged.length>0&&(
                  <tfoot>
                    <tr className="bg-gray-100 border-t-2" style={{borderColor:INK}}>
                      <td className="px-5 py-4 text-base font-bold text-gray-900" colSpan={level==='campaign'?2:3}>합계 / 전체</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-gray-900 whitespace-nowrap">{krw(mergedTotals.spend)}</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-gray-900 whitespace-nowrap">{krw(mergedTotals.revenue)}</td>
                      <td className={`px-5 py-4 text-right text-base whitespace-nowrap ${roasCls(mergedTotals.roas)}`}>{mergedTotals.roas}%</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-gray-900">{num(mergedTotals.reach)}</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-gray-900">{num(mergedTotals.impressions)}</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-gray-900">{num(mergedTotals.clicks)}</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-gray-900">{ctr(mergedTotals.clicks,mergedTotals.impressions)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center gap-5 text-sm text-gray-400 pb-3 flex-wrap">
          <span className="font-semibold">ROAS:</span>
          <span className="text-blue-600 font-bold">■ 300%↑ 우수</span>
          <span className="text-amber-500 font-semibold">■ 150~299% 보통</span>
          <span className="text-rose-500 font-semibold">■ 150%↓ 주의</span>
          <span className="ml-auto text-gray-300 text-xs">매출은 브랜드별 GA4 SNS 채널 기준 합산</span>
        </div>
      </main>
    </div>
  );
}
