/**
 * pages/setup-check.js — 환경 진단
 * 자사몰 픽셀·GA4 설치 상태와 픽셀 과집계 정도를 실시간 점검합니다.
 * 페이지를 열 때마다 자동으로 다시 점검돼요.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

const ST = {
  ok:      { emoji: '✅', label: '정상',   color: '#059669', soft: '#ECFDF5' },
  warn:    { emoji: '🟡', label: '주의',   color: '#D97706', soft: '#FFFBEB' },
  fail:    { emoji: '🔴', label: '문제',   color: '#DC2626', soft: '#FEF2F2' },
  unknown: { emoji: '⚪', label: '확인 불가', color: '#6B7280', soft: '#F9FAFB' },
};
const krw = v => '₩' + Math.round(v || 0).toLocaleString('ko-KR');

export default function SetupCheckPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setAuthed(sessionStorage.getItem('dash_auth') === '1'); }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/setup-check');
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setData(j);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  if (authed === null) return null;
  if (!authed) { if (typeof window !== 'undefined') router.push('/'); return null; }

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif" }}>
      <Head>
        <title>환경 진단 | THREEPEAT</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"/>
      </Head>

      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-lg mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 font-medium text-sm">← 홈</button>
            <div className="w-px h-5 bg-gray-300"/>
            <span className="text-xl">🧪</span>
            <p className="text-xl font-extrabold text-gray-900">환경 진단</p>
          </div>
          <button onClick={load} disabled={loading}
            className="px-4 py-2.5 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-60 bg-gray-900">
            {loading ? '점검 중…' : '🔄 다시 점검'}
          </button>
        </div>
      </header>

      <main className="max-w-screen-lg mx-auto px-6 py-6">
        <p className="text-sm text-gray-500 mb-6">
          자사몰의 메타 픽셀·GA4 설치 상태와 픽셀 과집계 정도를 점검해요. <b>페이지를 열 때마다 실시간으로 다시 점검</b>되니 주 1회 열어보는 것만으로 정기 점검이 돼요.
          {data && <span className="text-gray-400"> · 마지막 점검: {data.generatedAt}</span>}
        </p>

        {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-4 text-sm font-medium">⚠ {error}</div>}
        {!data && loading && <p className="text-center text-gray-400 py-20">자사몰과 API를 점검하는 중이에요… (10~20초)</p>}

        {(data?.brands || []).map(b => (
          <section key={b.id} className="mb-8">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="px-3.5 py-1.5 rounded-full text-base font-extrabold text-white" style={{ background: b.color }}>{b.name}</span>
              <p className="text-sm text-gray-400">{b.site}</p>
            </div>
            <div className="space-y-2.5">
              {b.checks.map((c, i) => {
                const st = ST[c.status] || ST.unknown;
                return (
                  <div key={i} className="rounded-2xl bg-white border-2 px-5 py-4 flex items-start gap-4" style={{ borderColor: st.color + '40' }}>
                    <span className="text-2xl shrink-0 mt-0.5">{st.emoji}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-extrabold text-gray-900">{c.name}</p>
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: st.soft, color: st.color }}>{st.label}</span>
                      </div>
                      <p className="text-[15px] text-gray-600 mt-1 leading-relaxed">{c.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {b.stats && (
              <p className="mt-2 text-xs text-gray-400">
                최근 7일({b.stats.since}~{b.stats.until}) 광고비 {krw(b.stats.spend)} · 픽셀 매출 {krw(b.stats.pixelRev)} · GA4(SNS) 매출 {krw(b.stats.ga4Sns)}
              </p>
            )}
          </section>
        ))}

        {/* 과집계는 왜 생기나 */}
        <section className="mt-10 rounded-2xl bg-white border border-gray-200 p-6">
          <p className="text-lg font-extrabold text-gray-900 mb-4">📖 픽셀 과집계, 왜 생기는 걸까요?</p>
          <div className="space-y-3 text-[15px] text-gray-700 leading-relaxed">
            <p><b>① 집계 기준(어트리뷰션)이 넓어요</b> — 메타는 기본적으로 <b>클릭 후 7일 + 보기만 한 후 1일</b> 안의 구매를 전부 자기 성과로 잡아요. 광고를 스치듯 본 사람이 다음 날 네이버 검색으로 들어와 사도 메타 성과가 됩니다. GA4는 실제 유입 경로(마지막 클릭) 기준이라 훨씬 보수적이에요.</p>
            <p><b>② 조회(뷰스루) 전환 포함</b> — 클릭 없이 광고를 '본' 것만으로 성과에 포함돼요. 리타겟팅 광고일수록 어차피 살 사람에게 노출되는 경우가 많아 이 왜곡이 커져요.</p>
            <p><b>③ iOS 개인정보 보호 이후 '추정' 전환</b> — 애플 ATT 정책으로 실측이 어려워진 뒤, 메타는 모델링(추정)으로 빈 곳을 채워요. 추정치가 들어가는 만큼 숫자가 부풀 수 있어요.</p>
            <p><b>④ 채널 간 중복 귀속</b> — 같은 구매 1건을 메타도, 네이버도 각자 자기 성과로 잡아요. 채널별 성과를 다 더하면 실매출보다 커지는 이유예요.</p>
            <p className="text-gray-500">반대로 GA4는 쿠키 차단·기기 변경 때문에 <b>약간 과소</b>집계되는 면도 있어요. 진실은 둘 사이에 있지만, 예산 판단은 보수적인 <b>GA4 기준</b>으로 하는 게 안전해요 — 이 대시보드와 광고 진단이 GA4 기준인 이유입니다.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
