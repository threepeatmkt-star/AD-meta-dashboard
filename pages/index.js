/**
 * pages/index.js — 로그인 → 브랜드 선택
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { BRAND_LIST } from '../lib/brands';

const BLU = '#1877F2';

function LoginPage({ onLogin }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: pw }),
      });
      const j = await r.json();
      if (j.ok) { sessionStorage.setItem('dash_auth', '1'); onLogin(); }
      else setError(j.error || 'ID 또는 비밀번호가 올바르지 않습니다.');
    } catch { setError('오류가 발생했습니다. 다시 시도해주세요.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center" style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif"}}>
      <Head>
        <title>로그인 — THREEPEAT Meta Ads Dashboard</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"/>
      </Head>
      <div className="bg-white rounded-3xl shadow-xl border border-gray-200 p-10 w-full max-w-sm mx-4">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl shadow-md mb-4 bg-white border border-gray-100 flex items-center justify-center">
            <img src="/meta_logo.png" alt="" className="w-10 h-10 object-contain"/>
          </div>
          <p className="text-xl font-bold text-gray-900">
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-gray-900 text-white text-sm align-middle">THREEPEAT</span>
            {' '}
            <span className="align-middle">Meta Ads Dashboard</span>
          </p>
          <p className="text-xs text-gray-300 mt-1">Meta Ads × GA4 통합 효율 분석</p>
          <p className="text-sm text-gray-400 mt-3">사내용 · 로그인 후 이용 가능합니다</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1.5">아이디</label>
            <input type="text" value={id} onChange={e=>setId(e.target.value)} placeholder="아이디 입력"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
              autoFocus autoComplete="username"/>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1.5">비밀번호</label>
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="비밀번호 입력"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
              autoComplete="current-password"/>
          </div>
          {error&&<p className="text-sm text-red-500 font-medium">⚠️ {error}</p>}
          <button type="submit" disabled={loading||!id||!pw}
            className="w-full py-3 text-white text-base font-bold rounded-xl disabled:opacity-60 transition-colors shadow-sm"
            style={{background:BLU}}>
            {loading?'확인 중…':'로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}

function BrandPicker() {
  const router = useRouter();
  const logout = () => { sessionStorage.removeItem('dash_auth'); window.location.reload(); };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif"}}>
      <Head>
        <title>브랜드 선택 — THREEPEAT Meta Ads Dashboard</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"/>
      </Head>

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl shadow-sm bg-white border border-gray-100 flex items-center justify-center overflow-hidden">
              <img src="/meta_logo.png" alt="" className="w-7 h-7 object-contain"/>
            </div>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
              <span className="px-3 py-1 rounded-full bg-gray-900 text-white text-xs font-bold tracking-wide whitespace-nowrap">THREEPEAT</span>
              <p className="text-base font-bold text-gray-900 whitespace-nowrap">Meta Ads Dashboard</p>
              <span className="hidden sm:inline text-gray-300">|</span>
              <p className="w-full sm:w-auto text-[11px] text-gray-300 sm:text-sm sm:text-gray-400">
                Meta Ads × GA4 통합 효율 분석
              </p>
            </div>
          </div>
          <button onClick={logout} className="px-3 py-2 border border-gray-200 text-gray-500 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
            로그아웃
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">어떤 브랜드를 보시겠어요?</h1>
          <p className="text-gray-400 mt-3 text-base">Meta Ads × GA4 통합 효율 분석</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
          {BRAND_LIST.map(b => (
            <button key={b.id} onClick={() => router.push(`/${b.id}`)}
              className="group relative bg-white rounded-3xl border-2 border-gray-200 p-10 text-left shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-200"
              style={{ borderColor: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#111827'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; }}>
              <div className="flex items-center gap-5 mb-6">
                <div className="w-20 h-20 rounded-2xl bg-white border border-gray-100 shadow-md flex items-center justify-center overflow-hidden shrink-0">
                  <img src={b.logo} alt={b.name} className="w-14 h-14 object-contain"
                    onError={e => { e.target.outerHTML = `<span style="font-size:36px">${b.emoji}</span>`; }}/>
                </div>
                <div>
                  <p className="text-2xl md:text-3xl font-bold text-gray-900">{b.name}</p>
                  <p className="text-sm font-semibold tracking-wider mt-1 text-gray-500">{b.nameEn}</p>
                </div>
              </div>
              <p className="text-gray-500 text-base mb-1">{b.desc}</p>
              <p className="text-gray-300 text-sm">{b.site}</p>
              <div className="mt-7 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white text-base font-bold shadow-sm group-hover:gap-3 transition-all bg-gray-900">
                대시보드 열기 <span>→</span>
              </div>
            </button>
          ))}
        </div>

        <button onClick={() => router.push('/all')}
          className="mt-10 px-8 py-5 bg-white border-2 border-gray-200 rounded-2xl text-center max-w-md w-full shadow-sm hover:shadow-lg hover:border-gray-900 transition-all group">
          <p className="text-base font-bold text-gray-900">
            🔗 통합 조회 <span className="text-gray-400 font-medium">(삼대오백 + 엠엑시브)</span>
          </p>
          <p className="text-xs text-gray-400 mt-1 group-hover:text-gray-600 transition-colors">
            전사 합계 · 브랜드 비교 · 통합 테이블 →
          </p>
        </button>
      </main>
    </div>
  );
}

export default function Home() {
  const [authed, setAuthed] = useState(null);
  useEffect(() => { setAuthed(sessionStorage.getItem('dash_auth') === '1'); }, []);
  if (authed === null) return null;
  if (!authed) return <LoginPage onLogin={() => setAuthed(true)}/>;
  return <BrandPicker/>;
}
