import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';

// ── 날짜 유틸 ─────────────────────────────────────────────────────
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
    case 'last7': return [fmtDate(new Date(now-7*86400000)),fmtDate(yest)];
    case 'last14': return [fmtDate(new Date(now-14*86400000)),fmtDate(yest)];
    case 'last30': return [fmtDate(new Date(now-30*86400000)),fmtDate(yest)];
    case 'thisMonth': return [fmtDate(new Date(now.getFullYear(),now.getMonth(),1)),fmtDate(yest)];
    case 'lastMonth': return [fmtDate(new Date(now.getFullYear(),now.getMonth()-1,1)),fmtDate(new Date(now.getFullYear(),now.getMonth(),0))];
    default: return [fmtDate(new Date(now-7*86400000)),fmtDate(yest)];
  }
}
function getPrevRange(s,e) {
  const sd=new Date(s),ed=new Date(e),days=Math.ceil((ed-sd)/86400000)+1;
  const pe=new Date(sd-86400000),ps=new Date(pe-(days-1)*86400000);
  return [fmtDate(ps),fmtDate(pe)];
}

// ── 포맷 ──────────────────────────────────────────────────────────
const krw = n => n?'₩'+Math.round(n).toLocaleString('ko-KR'):'₩0';
const num = n => n?Number(n).toLocaleString('ko-KR'):'0';
const ctr = (c,i) => i>0?(c/i*100).toFixed(2)+'%':'0%';
function roasCls(r) {
  if(r>=300) return 'text-blue-600 font-bold';
  if(r>=150) return 'text-amber-500 font-semibold';
  if(r>0) return 'text-rose-500 font-semibold';
  return 'text-gray-400';
}
function DeltaBadge({curr,prev}) {
  if(prev==null||prev===0) return null;
  const p=((curr-prev)/prev)*100,up=p>=0;
  return <span className={`text-sm ml-1 ${up?'text-emerald-600':'text-rose-500'}`}>{up?'▲':'▼'}{Math.abs(p).toFixed(1)}%</span>;
}
function extractProduct(name) {
  if(!name) return '-'; const p=name.split('_'); return p.length>=2?p[1]:p[0];
}
function groupByProduct(rows) {
  const map={};
  rows.forEach(r=>{
    const prod=extractProduct(r.name),key=`${r.campaignName}||${prod}`;
    if(!map[key]) map[key]={id:key,campaignName:r.campaignName,product:prod,spend:0,revenue:0,reach:0,impressions:0,clicks:0,dailyBudget:0,count:0};
    map[key].spend+=r.spend; map[key].revenue+=r.revenue; map[key].reach+=r.reach;
    map[key].impressions+=r.impressions; map[key].clicks+=r.clicks; map[key].dailyBudget+=r.dailyBudget||0; map[key].count++;
  });
  return Object.values(map).map(g=>({...g,roas:g.spend>0?Math.round(g.revenue/g.spend*1000)/10:0}));
}
function sumRows(arr) {
  return arr.reduce((a,d)=>({spend:a.spend+d.spend,revenue:a.revenue+d.revenue,reach:a.reach+d.reach,impressions:a.impressions+d.impressions,clicks:a.clicks+d.clicks}),{spend:0,revenue:0,reach:0,impressions:0,clicks:0});
}
function Spinner({sm}) {
  return <svg className={`${sm?'w-4 h-4':'w-6 h-6'} animate-spin text-blue-500`} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>;
}

// ── 카드 컴포넌트 ──────────────────────────────────────────────────
function Card({label,value,curr,prev,isRoas,roasVal,loading,accent,sub}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${accent?'bg-blue-50 border-blue-200':'bg-white border-gray-200'}`}>
      <p className={`text-sm font-semibold mb-2 ${accent?'text-blue-500':'text-gray-400'}`}>{label}</p>
      {loading
        ?<div className="h-8 bg-gray-100 rounded animate-pulse w-28"/>
        :<>
          <div className="flex items-baseline flex-wrap gap-1">
            <span className={`text-2xl font-bold ${isRoas?roasCls(roasVal):accent?'text-blue-700':'text-gray-900'}`}>{value}</span>
            {prev!==undefined&&<DeltaBadge curr={curr} prev={prev}/>}
          </div>
          {sub&&<p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </>
      }
    </div>
  );
}

// ── 섹션 라벨 ─────────────────────────────────────────────────────
function SectionLabel({children}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-gray-200"/>
    </div>
  );
}

// ── 멀티셀렉트 광고세트 드롭다운 ─────────────────────────────────
function MultiAdsetSelect({options, selected, onChange}) {
  const [open,setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(()=>{
    const h = e => { if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown',h);
    return ()=>document.removeEventListener('mousedown',h);
  },[]);
  const toggle = v => onChange(selected.includes(v)?selected.filter(x=>x!==v):[...selected,v]);
  const label = selected.length===0?'전체 광고세트':selected.length===1?selected[0]:`${selected.length}개 선택됨`;
  return (
    <div className="relative" ref={ref}>
      <button onClick={()=>setOpen(!open)}
        className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-600 bg-white font-medium hover:border-blue-300 transition-colors min-w-[180px] max-w-[260px]">
        <span className="truncate flex-1 text-left">{label}</span>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open?'rotate-180':''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
      </button>
      {open&&(
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[260px] max-h-72 overflow-y-auto">
          <div className="p-2 border-b border-gray-100">
            <button onClick={()=>onChange([])} className="w-full text-left px-3 py-1.5 text-sm text-blue-500 font-semibold hover:bg-blue-50 rounded-lg">전체 선택 해제</button>
          </div>
          {options.map(o=>(
            <label key={o} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(o)} onChange={()=>toggle(o)} className="rounded text-blue-500"/>
              <span className="text-sm text-gray-700 truncate">{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 인사이트 패널 ──────────────────────────────────────────────────
function InsightPanel({data, level, dateRange}) {
  const [insight,setInsight] = useState('');
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');

  const generate = async () => {
    if(!data.length) return;
    setLoading(true); setError(''); setInsight('');
    try {
      const r = await fetch('/api/insights', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({data,level,dateRange}),
      });
      const j = await r.json();
      if(j.error) throw new Error(j.error);
      setInsight(j.insight);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  // 마크다운 굵게 처리
  const renderInsight = text => text
    .split('\n')
    .map((line,i)=>{
      const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return <p key={i} className={`${line.startsWith('**')?'text-base font-bold text-gray-900 mt-4 mb-1':'text-sm text-gray-700 leading-relaxed'}`} dangerouslySetInnerHTML={{__html:formatted||'&nbsp;'}}/>;
    });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <div>
            <p className="font-bold text-gray-900">AI 인사이트</p>
            <p className="text-xs text-gray-400">현재 {level==='campaign'?'캠페인':level==='adset'?'광고세트':'소재'} 데이터 기반 분석</p>
          </div>
        </div>
        <button onClick={generate} disabled={loading||!data.length}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl disabled:opacity-60 transition-colors"
          style={{background:'#1877F2'}}>
          {loading?<><Spinner sm/>분석 중…</>:<>✨ 인사이트 생성</>}
        </button>
      </div>
      <div className="px-6 py-5 min-h-[80px]">
        {error&&<p className="text-sm text-red-500">⚠️ {error}</p>}
        {!insight&&!loading&&!error&&(
          <p className="text-sm text-gray-400 italic">위 버튼을 클릭하면 현재 데이터를 AI가 분석하여 인사이트를 제공합니다.</p>
        )}
        {insight&&<div className="space-y-0.5">{renderInsight(insight)}</div>}
      </div>
    </div>
  );
}

// ── 엑셀 내보내기 ─────────────────────────────────────────────────
function exportToExcel(data, tab, dateRange) {
  // CSV 방식 (xlsx 라이브러리 없이 순수 브라우저에서 동작)
  const headers = {
    campaign: ['캠페인명','광고비','매출액','ROAS(%)','도달','노출','클릭','CTR(%)'],
    adset: ['광고세트명','캠페인','일예산','광고비','매출액','ROAS(%)','도달','노출','클릭','CTR(%)'],
    ad: ['소재명','광고세트','캠페인','광고비','매출액','ROAS(%)','도달','노출','클릭','CTR(%)'],
  };
  const rows = data.map(d => {
    const ctrVal = d.impressions>0?(d.clicks/d.impressions*100).toFixed(2):'0';
    if(tab==='campaign') return [d.name,d.spend,d.revenue,d.roas,d.reach,d.impressions,d.clicks,ctrVal];
    if(tab==='adset') return [d.name,d.campaignName,d.dailyBudget||0,d.spend,d.revenue,d.roas,d.reach,d.impressions,d.clicks,ctrVal];
    return [d.name,d.adsetName||'',d.campaignName,d.spend,d.revenue,d.roas,d.reach,d.impressions,d.clicks,ctrVal];
  });

  const csv = [headers[tab],...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const bom = '\uFEFF'; // 한글 깨짐 방지
  const blob = new Blob([bom+csv],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `삼대오백_광고리포트_${dateRange.replace(/~/g,'-').replace(/\s/g,'')}_${tab}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 메인 ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const [preset,setPreset]=useState('last7');
  const [customStart,setCustomStart]=useState('');
  const [customEnd,setCustomEnd]=useState('');
  const [compare,setCompare]=useState(false);
  const [tab,setTab]=useState('campaign');
  const [adsetSubTab,setAdsetSubTab]=useState('adset');
  const [selectedAdsets,setSelectedAdsets]=useState([]);
  const [data,setData]=useState([]);
  const [prevData,setPrevData]=useState([]);
  const [adRevenue,setAdRevenue]=useState(0);
  const [viralRevenue,setViralRevenue]=useState(0);
  const [prevAdRevenue,setPrevAdRevenue]=useState(0);
  const [prevViralRevenue,setPrevViralRevenue]=useState(0);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [lastUpdated,setLastUpdated]=useState(null);
  const [hoverThumb,setHoverThumb]=useState(null);

  const getRange=useCallback(()=>preset==='custom'?[customStart,customEnd]:getPresetRange(preset),[preset,customStart,customEnd]);

  const load=useCallback(async()=>{
    const [start,end]=getRange();
    if(!start||!end) return;
    setLoading(true);setError('');
    try {
      const r=await fetch(`/api/dashboard?startDate=${start}&endDate=${end}&level=${tab}`);
      const j=await r.json();
      if(j.error) throw new Error(j.error);
      setData(j.data||[]);setAdRevenue(j.adRevenue||0);setViralRevenue(j.viralRevenue||0);
      if(compare){
        const [ps,pe]=getPrevRange(start,end);
        const pr=await fetch(`/api/dashboard?startDate=${ps}&endDate=${pe}&level=${tab}`);
        const pj=await pr.json();
        setPrevData(pj.data||[]);setPrevAdRevenue(pj.adRevenue||0);setPrevViralRevenue(pj.viralRevenue||0);
      } else {setPrevData([]);setPrevAdRevenue(0);setPrevViralRevenue(0);}
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
    } catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[getRange,tab,compare]);

  useEffect(()=>{load();setSelectedAdsets([]);},[load]);

  const totals={...sumRows(data)};
  totals.roas=totals.spend>0?Math.round(totals.revenue/totals.spend*1000)/10:0;
  const prevTotals={...sumRows(prevData)};
  prevTotals.roas=prevTotals.spend>0?Math.round(prevTotals.revenue/prevTotals.spend*1000)/10:0;

  const [rangeStart,rangeEnd]=getRange();
  const [prevStart,prevEnd]=rangeStart&&rangeEnd?getPrevRange(rangeStart,rangeEnd):['',''];
  const dateRangeLabel = rangeStart===rangeEnd?rangeStart:`${rangeStart} ~ ${rangeEnd}`;

  const adsetOptions=tab==='ad'?[...new Set(data.map(d=>d.adsetName).filter(Boolean))].sort():[];
  const filteredAds=selectedAdsets.length>0?data.filter(d=>selectedAdsets.includes(d.adsetName)):data;
  const productGroupData=adsetSubTab==='product'?groupByProduct(data):[];
  const displayData=tab==='adset'&&adsetSubTab==='product'?productGroupData:tab==='ad'?filteredAds:data;
  const dispTotals={...sumRows(displayData)};
  dispTotals.roas=dispTotals.spend>0?Math.round(dispTotals.revenue/dispTotals.spend*1000)/10:0;

  const PRESETS=[
    {v:'today',l:'오늘'},{v:'yesterday',l:'어제'},{v:'thisWeek',l:'이번 주'},{v:'lastWeek',l:'지난 주'},
    {v:'last7',l:'최근 7일'},{v:'last14',l:'최근 14일'},{v:'last30',l:'최근 30일'},
    {v:'thisMonth',l:'이번 달'},{v:'lastMonth',l:'지난 달'},{v:'custom',l:'직접 설정'},
  ];
  const TABS=[{v:'campaign',l:'📊 캠페인'},{v:'adset',l:'🎯 광고세트'},{v:'ad',l:'🖼 소재'}];
  const BLU = '#1877F2';

  return (
    <div className="min-h-screen bg-slate-50" style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif"}}>
      <Head>
        <title>쓰리핏 메타광고 대시보드 | 삼대오백</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"/>
      </Head>

      {hoverThumb&&(
        <div className="fixed z-[9999] pointer-events-none" style={{top:Math.max(8,hoverThumb.y-250),left:hoverThumb.x+24}}>
          <img src={hoverThumb.src} className="w-64 h-64 object-cover rounded-2xl shadow-2xl border-2 border-white"/>
        </div>
      )}

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow" style={{background:`linear-gradient(135deg,${BLU},#0a5ec0)`}}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V10h2v6zm4 0h-2v-3.5c0-.83-.67-1.5-1.5-1.5S10 11.67 10 12.5V16H8v-6h2v.93c.5-.81 1.33-1.43 2.25-1.43C13.77 9.5 15 10.73 15 12.25V16z"/></svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-gray-900">쓰리핏 메타광고 대시보드</p>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white" style={{background:BLU}}>삼대오백</span>
              </div>
              <p className="text-sm text-gray-400">Meta Ads × GA4 통합 효율 분석 (사내용)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated&&<span className="text-sm text-gray-400 hidden sm:inline">업데이트: {lastUpdated}</span>}
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-60"
              style={{background:BLU}}>
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
                style={preset===p.v?{background:BLU}:{}}>
                {p.l}
              </button>
            ))}
            {preset==='custom'&&(
              <div className="flex items-center gap-2 ml-1">
                <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                <span className="text-gray-400 font-semibold">~</span>
                <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
              </div>
            )}
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <span className="text-sm text-gray-500 font-medium whitespace-nowrap">이전 기간 비교</span>
              <button onClick={()=>setCompare(!compare)}
                className={`relative w-12 h-6 rounded-full transition-colors ${compare?'':'bg-gray-300'}`}
                style={compare?{background:BLU}:{}}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${compare?'translate-x-6':''}`}/>
              </button>
            </div>
          </div>
          {rangeStart&&(
            <p className="mt-2 text-sm text-gray-400 font-medium">
              📅 {dateRangeLabel}
              {compare&&prevStart&&<span className="ml-3 text-blue-400">| 비교: {prevStart} ~ {prevEnd}</span>}
            </p>
          )}
        </div>
      </div>

      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
        {error&&(
          <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-base text-red-700">
            <strong>⚠️ 오류:</strong> {error}
          </div>
        )}

        {/* ── Row 1: 광고비 / 총매출 / ROAS ── */}
        <div>
          <SectionLabel>개요</SectionLabel>
          <div className="grid grid-cols-3 gap-4">
            <Card label="광고비 (Meta)" value={krw(totals.spend)} curr={totals.spend} prev={compare?prevTotals.spend:undefined} loading={loading}/>
            <Card label="총 매출 (GA4)" value={krw(totals.revenue)} curr={totals.revenue} prev={compare?prevTotals.revenue:undefined} loading={loading}/>
            <Card label="ROAS" value={`${totals.roas}%`} curr={totals.roas} prev={compare?prevTotals.roas:undefined} isRoas roasVal={totals.roas} loading={loading}/>
          </div>
          {/* ── Row 2: 도달 / 노출 / 클릭수 / 클릭률 ── */}
          <div className="grid grid-cols-4 gap-4 mt-4">
            <Card label="도달" value={num(totals.reach)} curr={totals.reach} prev={compare?prevTotals.reach:undefined} loading={loading}/>
            <Card label="노출" value={num(totals.impressions)} curr={totals.impressions} prev={compare?prevTotals.impressions:undefined} loading={loading}/>
            <Card label="클릭 수" value={num(totals.clicks)} curr={totals.clicks} prev={compare?prevTotals.clicks:undefined} loading={loading}/>
            <Card label="클릭률 (CTR)" value={ctr(totals.clicks,totals.impressions)} curr={totals.impressions>0?totals.clicks/totals.impressions:0} prev={compare&&prevTotals.impressions>0?prevTotals.clicks/prevTotals.impressions:undefined} loading={loading} sub="클릭 ÷ 노출"/>
          </div>
        </div>

        {/* ── Row 3: DA광고매출 / SNS바이럴매출 ── */}
        <div>
          <SectionLabel>자사몰 (GA4) 매출 개요 — SNS 채널 기준 (fb / insta / ig)</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            <Card label="📣 DA 광고 매출" value={krw(adRevenue)} curr={adRevenue} prev={compare?prevAdRevenue:undefined} loading={loading} accent/>
            <Card label="📱 SNS 바이럴 매출" value={krw(viralRevenue)} curr={viralRevenue} prev={compare?prevViralRevenue:undefined} loading={loading} accent sub="cpm 미포함 기준"/>
          </div>
        </div>

        {/* ── 테이블 ── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="flex items-center border-b border-gray-100 overflow-x-auto">
            {TABS.map(t=>(
              <button key={t.v} onClick={()=>{setTab(t.v);setSelectedAdsets([]);}}
                className={`px-7 py-4 text-base font-bold border-b-2 whitespace-nowrap transition-colors ${tab===t.v?'border-blue-500 text-blue-600 bg-blue-50/50':'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                {t.l}
              </button>
            ))}
            {/* 멀티셀렉트 필터 */}
            {tab==='ad'&&adsetOptions.length>0&&(
              <div className="ml-3">
                <MultiAdsetSelect options={adsetOptions} selected={selectedAdsets} onChange={setSelectedAdsets}/>
              </div>
            )}
            {/* 엑셀 내보내기 */}
            <div className="ml-auto px-4 flex items-center gap-3">
              <button onClick={()=>exportToExcel(displayData,tab,dateRangeLabel)}
                disabled={!displayData.length}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 transition-colors">
                📥 CSV 내보내기
              </button>
              <span className="text-sm text-gray-400 font-medium whitespace-nowrap">{loading?'로딩 중…':`${displayData.length}건`}</span>
            </div>
          </div>

          {tab==='adset'&&(
            <div className="flex border-b border-gray-100 bg-gray-50/50">
              {[{v:'adset',l:'세트별'},{v:'product',l:'캠페인 · 제품별'}].map(st=>(
                <button key={st.v} onClick={()=>setAdsetSubTab(st.v)}
                  className={`px-6 py-3 text-sm font-bold transition-colors ${adsetSubTab===st.v?'text-blue-600 border-b-2 border-blue-500 bg-white':'text-gray-400 hover:text-gray-600'}`}>
                  {st.l}
                </button>
              ))}
            </div>
          )}

          {loading?(
            <div className="flex flex-col items-center justify-center h-56 gap-4">
              <Spinner/><p className="text-base text-gray-400">Meta & GA4 데이터 불러오는 중…</p>
            </div>
          ):(
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {tab==='ad'&&<th className="px-5 py-4 text-left text-sm font-bold text-gray-500 uppercase w-24">썸네일</th>}
                    <th className="px-5 py-4 text-left text-sm font-bold text-gray-500 uppercase min-w-[200px]">
                      {tab==='campaign'?'캠페인명':tab==='adset'?(adsetSubTab==='product'?'캠페인 / 제품':'광고세트명'):'소재명'}
                    </th>
                    {tab!=='campaign'&&adsetSubTab!=='product'&&<th className="px-5 py-4 text-left text-sm font-bold text-gray-500 uppercase min-w-[130px]">캠페인</th>}
                    {tab==='adset'&&<th className="px-5 py-4 text-right text-sm font-bold text-gray-500 uppercase whitespace-nowrap">일예산</th>}
                    {['광고비','매출액','ROAS','도달','노출','클릭','CTR'].map(h=>(
                      <th key={h} className="px-5 py-4 text-right text-sm font-bold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayData.length===0?(
                    <tr><td colSpan={13} className="px-5 py-20 text-center">
                      <p className="text-4xl mb-3">📭</p>
                      <p className="text-gray-400 text-base">데이터가 없습니다.</p>
                    </td></tr>
                  ):displayData.map((row,i)=>{
                    const prev=prevData.find(p=>p.id===row.id);
                    return (
                      <tr key={i} className="hover:bg-blue-50/20 transition-colors">
                        {tab==='ad'&&(
                          <td className="px-5 py-3">
                            {row.thumbnail
                              ?<img src={row.thumbnail} alt="" className="w-20 h-20 rounded-xl object-cover border border-gray-200 shadow-sm cursor-zoom-in"
                                  onMouseEnter={e=>setHoverThumb({src:row.thumbnail,x:e.clientX,y:e.clientY})}
                                  onMouseMove={e=>setHoverThumb(p=>p?{...p,x:e.clientX,y:e.clientY}:null)}
                                  onMouseLeave={()=>setHoverThumb(null)}
                                  onError={e=>{e.target.style.display='none';}}/>
                              :<div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center text-gray-300 text-2xl">🖼</div>
                            }
                          </td>
                        )}
                        <td className="px-5 py-4">
                          {adsetSubTab==='product'&&tab==='adset'?(
                            <div>
                              <p className="text-sm text-gray-400 mb-0.5 font-medium">{row.campaignName}</p>
                              <p className="font-bold text-gray-900 text-base">{row.product}</p>
                              <p className="text-xs text-gray-300 mt-0.5">{row.count}개 세트</p>
                            </div>
                          ):(
                            <div>
                              <p className="font-semibold text-gray-900 truncate max-w-xs text-base" title={row.name}>{row.name}</p>
                              {tab==='ad'&&row.adsetName&&(
                                <button onClick={()=>{setSelectedAdsets([row.adsetName]);}}
                                  className="text-sm text-blue-400 hover:text-blue-600 hover:underline mt-0.5 text-left truncate max-w-xs block font-medium">
                                  {row.adsetName}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        {tab!=='campaign'&&adsetSubTab!=='product'&&(
                          <td className="px-5 py-4"><p className="text-sm text-gray-400 truncate max-w-[150px] font-medium" title={row.campaignName}>{row.campaignName}</p></td>
                        )}
                        {tab==='adset'&&(
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            {row.dailyBudget>0?<span className="text-gray-700 font-semibold">{krw(row.dailyBudget)}</span>:<span className="text-sm text-gray-300">CBO</span>}
                          </td>
                        )}
                        <td className="px-5 py-4 text-right whitespace-nowrap"><span className="text-gray-700 font-semibold">{krw(row.spend)}</span>{compare&&prev&&<DeltaBadge curr={row.spend} prev={prev.spend}/>}</td>
                        <td className="px-5 py-4 text-right whitespace-nowrap"><span className={row.revenue>0?'text-gray-700 font-semibold':'text-gray-300'}>{krw(row.revenue)}</span>{compare&&prev&&<DeltaBadge curr={row.revenue} prev={prev.revenue}/>}</td>
                        <td className="px-5 py-4 text-right whitespace-nowrap"><span className={roasCls(row.roas)}>{row.roas}%</span>{compare&&prev&&<DeltaBadge curr={row.roas} prev={prev.roas}/>}</td>
                        <td className="px-5 py-4 text-right text-gray-600 font-medium whitespace-nowrap">{num(row.reach)}</td>
                        <td className="px-5 py-4 text-right text-gray-600 font-medium whitespace-nowrap">{num(row.impressions)}</td>
                        <td className="px-5 py-4 text-right text-gray-600 font-medium whitespace-nowrap">{num(row.clicks)}</td>
                        <td className="px-5 py-4 text-right text-gray-600 font-medium whitespace-nowrap">{ctr(row.clicks,row.impressions)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {displayData.length>0&&(
                  <tfoot>
                    <tr className="bg-blue-50 border-t-2 border-blue-200">
                      {tab==='ad'&&<td className="px-5 py-4"/>}
                      <td className="px-5 py-4 text-base font-bold text-blue-800">합계 / 전체</td>
                      {tab!=='campaign'&&adsetSubTab!=='product'&&<td className="px-5 py-4"/>}
                      {tab==='adset'&&<td className="px-5 py-4"/>}
                      <td className="px-5 py-4 text-right text-base font-bold text-blue-800 whitespace-nowrap">{krw(dispTotals.spend)}</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-blue-800 whitespace-nowrap">{krw(dispTotals.revenue)}</td>
                      <td className={`px-5 py-4 text-right text-base whitespace-nowrap ${roasCls(dispTotals.roas)}`}>{dispTotals.roas}%</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-blue-800">{num(dispTotals.reach)}</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-blue-800">{num(dispTotals.impressions)}</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-blue-800">{num(dispTotals.clicks)}</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-blue-800">{ctr(dispTotals.clicks,dispTotals.impressions)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* ── AI 인사이트 ── */}
        <InsightPanel data={displayData} level={tab} dateRange={dateRangeLabel}/>

        <div className="flex items-center gap-5 text-sm text-gray-400 pb-3">
          <span className="font-semibold">ROAS 범례:</span>
          <span className="text-blue-600 font-bold">■ 300%↑ 우수</span>
          <span className="text-amber-500 font-semibold">■ 150~299% 보통</span>
          <span className="text-rose-500 font-semibold">■ 150%↓ 주의</span>
          <span className="ml-auto text-gray-300 text-xs">GA4 SNS 매출 필터: .*fb.*|.*insta.*|.*ig.* | DA=cpm포함 / 바이럴=cpm미포함</span>
        </div>
      </main>
    </div>
  );
}
