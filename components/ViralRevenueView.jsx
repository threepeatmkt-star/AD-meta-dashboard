/**
 * components/ViralRevenueView.jsx — SNS 바이럴 매출 상세 (브랜드 공용)
 */
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#1877F2','#00C49F','#FFBB28','#FF8042','#A855F7','#EC4899','#14B8A6'];
const krw = n => n ? '₩' + Math.round(n).toLocaleString('ko-KR') : '₩0';
const krwShort = n => {
  if (!n) return '₩0';
  if (n >= 10000000) return `₩${(n/10000000).toFixed(1)}천만`;
  if (n >= 1000000) return `₩${(n/1000000).toFixed(1)}백만`;
  if (n >= 10000) return `₩${(n/10000).toFixed(0)}만`;
  return `₩${Math.round(n).toLocaleString()}`;
};

function fmtDate(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function getPresetRange(preset) {
  const now = new Date(), yest = new Date(now-86400000);
  switch(preset) {
    case 'last7': return [fmtDate(new Date(now-7*86400000)),fmtDate(yest)];
    case 'last14': return [fmtDate(new Date(now-14*86400000)),fmtDate(yest)];
    case 'last30': return [fmtDate(new Date(now-30*86400000)),fmtDate(yest)];
    case 'thisMonth': return [fmtDate(new Date(now.getFullYear(),now.getMonth(),1)),fmtDate(yest)];
    case 'lastMonth': return [fmtDate(new Date(now.getFullYear(),now.getMonth()-1,1)),fmtDate(new Date(now.getFullYear(),now.getMonth(),0))];
    default: return [fmtDate(new Date(now-30*86400000)),fmtDate(yest)];
  }
}

function Spinner() {
  return <div className="flex items-center justify-center h-48">
    <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  </div>;
}

function ChartToggle({ value, onChange, color }) {
  const opts = [
    { v: 'line', l: '📈 꺾은선형' },
    { v: 'bar', l: '📊 세로막대형' },
    { v: 'pie', l: '🥧 원형' },
  ];
  return (
    <div className="flex gap-2">
      {opts.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${value===o.v?'text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          style={value===o.v?{background:color}:{}}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export default function ViralRevenueView({ brand }) {
  const router = useRouter();
  const BC = brand.color;
  const [authed, setAuthed] = useState(null);
  const [preset, setPreset] = useState('last30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [chartType, setChartType] = useState('line');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setAuthed(sessionStorage.getItem('dash_auth') === '1');
    const { start, end } = router.query;
    if (start && end) {
      setCustomStart(start);
      setCustomEnd(end);
      setUseCustom(true);
    }
  }, [router.query]);

  const getRange = useCallback(() => {
    if (useCustom && customStart && customEnd) return [customStart, customEnd];
    return getPresetRange(preset);
  }, [useCustom, customStart, customEnd, preset]);

  const load = useCallback(async () => {
    const [start, end] = getRange();
    if (!start || !end) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/revenue-detail?brand=${brand.id}&type=viral&startDate=${start}&endDate=${end}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setData(j);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [getRange, brand.id]);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  if (authed === null || !mounted) return null;
  if (!authed) { router.push('/'); return null; }

  const [rangeStart, rangeEnd] = getRange();
  const totalRevenue = data?.dailyData?.reduce((s, d) => s + d.revenue, 0) || 0;
  const totalSessions = data?.dailyData?.reduce((s, d) => s + d.sessions, 0) || 0;

  const PRESETS = [
    {v:'last7',l:'최근 7일'},{v:'last14',l:'최근 14일'},{v:'last30',l:'최근 30일'},
    {v:'thisMonth',l:'이번 달'},{v:'lastMonth',l:'지난 달'},
  ];

  const chartData = (data?.dailyData || []).map(d => ({
    date: d.date.slice(5),
    매출액: Math.round(d.revenue),
    세션수: d.sessions,
  }));

  const pieData = (data?.sourceBreakdown || [])
    .filter(s => s.revenue > 0)
    .slice(0, 7)
    .map(s => ({ name: s.source, value: Math.round(s.revenue) }));

  return (
    <div className="min-h-screen bg-slate-50" style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif"}}>
      <Head>
        <title>{`SNS 바이럴 매출 상세 | ${brand.name}`}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"/>
      </Head>

      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push(`/${brand.id}`)}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 font-medium text-sm">
              ← 돌아가기
            </button>
            <div className="w-px h-5 bg-gray-300"/>
            <div className="flex items-center gap-2">
              <span className="text-lg">📱</span>
              <p className="text-lg font-bold text-gray-900">SNS 바이럴 매출 상세</p>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white" style={{background:BC}}>{brand.name}</span>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="px-4 py-2 text-white rounded-xl text-sm font-bold disabled:opacity-60"
            style={{background:BC}}>
            🔄 새로고침
          </button>
        </div>
      </header>

      <div className="bg-white border-b border-gray-100">
        <div className="max-w-screen-xl mx-auto px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map(p => (
              <button key={p.v} onClick={() => { setPreset(p.v); setUseCustom(false); }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${!useCustom&&preset===p.v?'text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                style={!useCustom&&preset===p.v?{background:BC}:{}}>
                {p.l}
              </button>
            ))}
            <button onClick={() => setUseCustom(true)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold ${useCustom?'text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              style={useCustom?{background:BC}:{}}>
              직접 설정
            </button>
            {useCustom && (
              <div className="flex items-center gap-2">
                <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                <span className="text-gray-400">~</span>
                <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
              </div>
            )}
          </div>
          <p className="mt-1.5 text-sm text-gray-400">📅 {rangeStart} ~ {rangeEnd}</p>
        </div>
      </div>

      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">⚠️ {error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border p-5 shadow-sm" style={{background:brand.colorSoft,borderColor:BC+'33'}}>
            <p className="text-sm font-semibold mb-2" style={{color:BC}}>📱 바이럴 매출 합계</p>
            <p className="text-3xl font-bold" style={{color:BC}}>{krw(totalRevenue)}</p>
            <p className="text-xs text-gray-400 mt-1">{rangeStart} ~ {rangeEnd}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-400 mb-2">총 세션 수</p>
            <p className="text-3xl font-bold text-gray-900">{totalSessions.toLocaleString('ko-KR')}</p>
            <p className="text-xs text-gray-400 mt-1">SNS 유입 세션 합계</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <p className="font-bold text-gray-900">매출 · 세션 추이</p>
            <ChartToggle value={chartType} onChange={setChartType} color={BC}/>
          </div>
          <div className="p-6">
            {loading ? <Spinner/> : (
              <>
                {chartType === 'line' && (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis dataKey="date" tick={{fontSize:12}} interval="preserveStartEnd"/>
                      <YAxis yAxisId="left" tickFormatter={v=>krwShort(v)} tick={{fontSize:11}} width={80}/>
                      <YAxis yAxisId="right" orientation="right" tickFormatter={v=>v.toLocaleString()} tick={{fontSize:11}} width={60}/>
                      <Tooltip formatter={(v,n) => n==='매출액' ? krw(v) : v.toLocaleString()+'건'}/>
                      <Legend/>
                      <Line yAxisId="left" type="monotone" dataKey="매출액" stroke={BC} strokeWidth={2.5} dot={false}/>
                      <Line yAxisId="right" type="monotone" dataKey="세션수" stroke="#00C49F" strokeWidth={2} dot={false} strokeDasharray="4 2"/>
                    </LineChart>
                  </ResponsiveContainer>
                )}
                {chartType === 'bar' && (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis dataKey="date" tick={{fontSize:12}} interval="preserveStartEnd"/>
                      <YAxis yAxisId="left" tickFormatter={v=>krwShort(v)} tick={{fontSize:11}} width={80}/>
                      <YAxis yAxisId="right" orientation="right" tickFormatter={v=>v.toLocaleString()} tick={{fontSize:11}} width={60}/>
                      <Tooltip formatter={(v,n) => n==='매출액' ? krw(v) : v.toLocaleString()+'건'}/>
                      <Legend/>
                      <Bar yAxisId="left" dataKey="매출액" fill={BC} radius={[4,4,0,0]}/>
                      <Bar yAxisId="right" dataKey="세션수" fill="#00C49F" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {chartType === 'pie' && (
                  <div className="flex flex-col md:flex-row items-center gap-6">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" outerRadius={110} dataKey="value"
                          label={({name,percent})=>`${name.slice(0,12)} ${(percent*100).toFixed(0)}%`}>
                          {pieData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                        </Pie>
                        <Tooltip formatter={v=>krw(v)}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 min-w-[200px]">
                      {pieData.map((d,i)=>(
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{background:COLORS[i%COLORS.length]}}/>
                          <span className="text-sm text-gray-700 truncate flex-1">{d.name}</span>
                          <span className="text-sm font-semibold text-gray-900">{krwShort(d.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {data?.sourceBreakdown?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="font-bold text-gray-900">소스별 상세</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">소스</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase">매출액</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase">비중</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase">세션 수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.sourceBreakdown.map((s,i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{s.source}</td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-700">{krw(s.revenue)}</td>
                      <td className="px-5 py-3 text-right text-gray-500">
                        {totalRevenue > 0 ? (s.revenue/totalRevenue*100).toFixed(1) : 0}%
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">{s.sessions.toLocaleString('ko-KR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
