/**
 * 삼대오백 Meta Ads × GA4 통합 대시보드
 * pages/index.js
 */

import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

// ── 날짜 유틸 ────────────────────────────────────────────────────
function fmtDate(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getPresetRange(preset) {
  const now = new Date();
  const yest = new Date(now.getTime() - 86400000);
  switch (preset) {
    case 'today':
      return [fmtDate(now), fmtDate(now)];
    case 'yesterday':
      return [fmtDate(yest), fmtDate(yest)];
    case 'last7':
      return [fmtDate(new Date(now.getTime() - 7 * 86400000)), fmtDate(yest)];
    case 'last14':
      return [fmtDate(new Date(now.getTime() - 14 * 86400000)), fmtDate(yest)];
    case 'last30':
      return [fmtDate(new Date(now.getTime() - 30 * 86400000)), fmtDate(yest)];
    case 'thisMonth': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return [fmtDate(s), fmtDate(yest)];
    }
    case 'lastMonth': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return [fmtDate(s), fmtDate(e)];
    }
    default:
      return [fmtDate(new Date(now.getTime() - 7 * 86400000)), fmtDate(yest)];
  }
}

function getPrevRange(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const days = Math.ceil((e - s) / 86400000) + 1;
  const pe = new Date(s.getTime() - 86400000);
  const ps = new Date(pe.getTime() - (days - 1) * 86400000);
  return [fmtDate(ps), fmtDate(pe)];
}

function displayDate(s, e) {
  return s === e ? s : `${s} ~ ${e}`;
}

// ── 숫자 포맷 ────────────────────────────────────────────────────
const krw = (n) => (n ? '₩' + Math.round(n).toLocaleString('ko-KR') : '₩0');
const num = (n) => (n ? Number(n).toLocaleString('ko-KR') : '0');

function roasBadge(roas) {
  if (roas >= 300) return 'text-emerald-600 font-bold';
  if (roas >= 150) return 'text-amber-500 font-semibold';
  if (roas > 0) return 'text-rose-500 font-semibold';
  return 'text-gray-400';
}

function delta(curr, prev) {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function DeltaBadge({ curr, prev }) {
  const pct = delta(curr, prev);
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span className={`text-xs ml-1 ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
      {up ? '▲' : '▼'}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── 요약 카드 ────────────────────────────────────────────────────
function SummaryCard({ label, value, prev, curr, isRoas, roasVal, loading }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">{label}</p>
      {loading ? (
        <div className="h-7 bg-gray-100 rounded animate-pulse w-24" />
      ) : (
        <div className="flex items-baseline flex-wrap gap-1">
          <span className={`text-xl font-bold ${isRoas ? roasBadge(roasVal) : 'text-gray-900'}`}>
            {value}
          </span>
          {prev !== undefined && <DeltaBadge curr={curr} prev={prev} />}
        </div>
      )}
    </div>
  );
}

// ── 스피너 ──────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="w-6 h-6 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ── 메인 대시보드 ────────────────────────────────────────────────
export default function Dashboard() {
  const [preset, setPreset] = useState('last7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [compare, setCompare] = useState(false);
  const [tab, setTab] = useState('campaign');

  const [data, setData] = useState([]);
  const [prevData, setPrevData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const getRange = useCallback(() => {
    if (preset === 'custom') return [customStart, customEnd];
    return getPresetRange(preset);
  }, [preset, customStart, customEnd]);

  const load = useCallback(async () => {
    const [start, end] = getRange();
    if (!start || !end) return;
    setLoading(true);
    setError('');

    try {
      const r = await fetch(`/api/dashboard?startDate=${start}&endDate=${end}&level=${tab}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setData(j.data || []);

      if (compare) {
        const [ps, pe] = getPrevRange(start, end);
        const pr = await fetch(`/api/dashboard?startDate=${ps}&endDate=${pe}&level=${tab}`);
        const pj = await pr.json();
        setPrevData(pj.data || []);
      } else {
        setPrevData([]);
      }

      setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getRange, tab, compare]);

  useEffect(() => {
    load();
  }, [load]);

  // 합계 계산
  const sum = (arr) =>
    arr.reduce(
      (a, d) => ({
        spend: a.spend + d.spend,
        revenue: a.revenue + d.revenue,
        reach: a.reach + d.reach,
        impressions: a.impressions + d.impressions,
        clicks: a.clicks + d.clicks,
      }),
      { spend: 0, revenue: 0, reach: 0, impressions: 0, clicks: 0 }
    );

  const totals = { ...sum(data) };
  totals.roas = totals.spend > 0 ? Math.round((totals.revenue / totals.spend) * 100 * 10) / 10 : 0;

  const prevTotals = { ...sum(prevData) };
  prevTotals.roas =
    prevTotals.spend > 0
      ? Math.round((prevTotals.revenue / prevTotals.spend) * 100 * 10) / 10
      : 0;

  const [rangeStart, rangeEnd] = getRange();
  const [prevStart, prevEnd] =
    rangeStart && rangeEnd ? getPrevRange(rangeStart, rangeEnd) : ['', ''];

  const PRESETS = [
    { v: 'today', l: '오늘' },
    { v: 'yesterday', l: '어제' },
    { v: 'last7', l: '최근 7일' },
    { v: 'last14', l: '최근 14일' },
    { v: 'last30', l: '최근 30일' },
    { v: 'thisMonth', l: '이번 달' },
    { v: 'lastMonth', l: '지난 달' },
    { v: 'custom', l: '직접 설정' },
  ];

  const TABS = [
    { v: 'campaign', l: '📊 캠페인' },
    { v: 'adset', l: '🎯 광고세트' },
    { v: 'ad', l: '🖼 소재' },
  ];

  const colSpan = tab === 'ad' ? 10 : tab === 'adset' ? 9 : 8;

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>삼대오백 광고 대시보드</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💪</text></svg>" />
      </Head>

      {/* ── 헤더 ── */}
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
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                마지막 업데이트: {lastUpdated}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? <Spinner /> : <span>🔄</span>}
              <span className="hidden sm:inline">새로고침</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── 날짜 필터 바 ── */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-screen-xl mx-auto px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* 프리셋 버튼 */}
            {PRESETS.map((p) => (
              <button
                key={p.v}
                onClick={() => setPreset(p.v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  preset === p.v
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.l}
              </button>
            ))}

            {/* 직접 날짜 입력 */}
            {preset === 'custom' && (
              <div className="flex items-center gap-2 ml-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <span className="text-gray-400">~</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
            )}

            {/* 이전 기간 비교 토글 */}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <span className="text-sm text-gray-500 whitespace-nowrap">이전 기간 비교</span>
              <button
                onClick={() => setCompare(!compare)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  compare ? 'bg-orange-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                    compare ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 날짜 범위 표시 */}
          {rangeStart && (
            <p className="mt-1.5 text-xs text-gray-400">
              📅 {displayDate(rangeStart, rangeEnd)}
              {compare && prevStart && (
                <span className="ml-2 text-blue-400">
                  | 비교: {displayDate(prevStart, prevEnd)}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <main className="max-w-screen-xl mx-auto px-5 py-5 space-y-4">
        {/* ── 오류 메시지 ── */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 space-y-1">
            <p>
              <strong>⚠️ 오류:</strong> {error}
            </p>
            <p className="text-xs text-red-400">
              Vercel 환경변수(META_AD_ACCOUNT_ID, META_ACCESS_TOKEN, GA4_PROPERTY_ID,
              GA4_SERVICE_ACCOUNT_KEY)를 확인해주세요.
            </p>
          </div>
        )}

        {/* ── 요약 카드 ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard
            label="광고비 (Meta)"
            value={krw(totals.spend)}
            curr={totals.spend}
            prev={compare ? prevTotals.spend : undefined}
            loading={loading}
          />
          <SummaryCard
            label="매출액 (GA4)"
            value={krw(totals.revenue)}
            curr={totals.revenue}
            prev={compare ? prevTotals.revenue : undefined}
            loading={loading}
          />
          <SummaryCard
            label="ROAS"
            value={`${totals.roas}%`}
            curr={totals.roas}
            prev={compare ? prevTotals.roas : undefined}
            isRoas
            roasVal={totals.roas}
            loading={loading}
          />
          <SummaryCard
            label="도달"
            value={num(totals.reach)}
            curr={totals.reach}
            prev={compare ? prevTotals.reach : undefined}
            loading={loading}
          />
          <SummaryCard
            label="노출"
            value={num(totals.impressions)}
            curr={totals.impressions}
            prev={compare ? prevTotals.impressions : undefined}
            loading={loading}
          />
          <SummaryCard
            label="링크 클릭"
            value={num(totals.clicks)}
            curr={totals.clicks}
            prev={compare ? prevTotals.clicks : undefined}
            loading={loading}
          />
        </div>

        {/* ── 탭 + 테이블 ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {/* 탭 */}
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.v}
                onClick={() => setTab(t.v)}
                className={`px-6 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.v
                    ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.l}
              </button>
            ))}
            <div className="ml-auto px-4 py-3 flex items-center">
              <span className="text-xs text-gray-400">
                {loading ? '로딩 중…' : `${data.length}건`}
              </span>
            </div>
          </div>

          {/* 테이블 */}
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Spinner />
              <p className="text-sm text-gray-400">Meta & GA4 데이터 불러오는 중…</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {tab === 'ad' && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-14">
                        썸네일
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[180px]">
                      {tab === 'campaign' ? '캠페인명' : tab === 'adset' ? '광고세트명' : '소재명'}
                    </th>
                    {tab !== 'campaign' && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[120px]">
                        캠페인
                      </th>
                    )}
                    {['광고비', '매출액', 'ROAS', '도달', '노출', '클릭'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {data.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan} className="px-4 py-16 text-center">
                        <p className="text-3xl mb-2">📭</p>
                        <p className="text-gray-400 text-sm">데이터가 없습니다.</p>
                        <p className="text-gray-300 text-xs mt-1">
                          선택한 기간에 ON 상태인 광고가 없거나, API 설정을 확인해주세요.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    data.map((row, i) => {
                      const prev = prevData.find((p) => p.id === row.id);
                      return (
                        <tr key={i} className="hover:bg-orange-50/20 transition-colors">
                          {/* 썸네일 */}
                          {tab === 'ad' && (
                            <td className="px-4 py-3">
                              {row.thumbnail ? (
                                <img
                                  src={row.thumbnail}
                                  alt=""
                                  className="w-12 h-12 rounded-lg object-cover border border-gray-200 shadow-sm"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div
                                className="w-12 h-12 rounded-lg bg-gray-100 items-center justify-center text-gray-300 text-xl"
                                style={{ display: row.thumbnail ? 'none' : 'flex' }}
                              >
                                🖼
                              </div>
                            </td>
                          )}

                          {/* 이름 */}
                          <td className="px-4 py-3">
                            <p
                              className="font-medium text-gray-900 truncate max-w-xs"
                              title={row.name}
                            >
                              {row.name}
                            </p>
                          </td>

                          {/* 캠페인명 (광고세트/소재 레벨) */}
                          {tab !== 'campaign' && (
                            <td className="px-4 py-3">
                              <p
                                className="text-xs text-gray-400 truncate max-w-[140px]"
                                title={row.campaignName}
                              >
                                {row.campaignName}
                              </p>
                            </td>
                          )}

                          {/* 광고비 */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className="text-gray-700">{krw(row.spend)}</span>
                            {compare && prev && (
                              <DeltaBadge curr={row.spend} prev={prev.spend} />
                            )}
                          </td>

                          {/* 매출액 */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className={row.revenue > 0 ? 'text-gray-700' : 'text-gray-300'}>
                              {krw(row.revenue)}
                            </span>
                            {compare && prev && (
                              <DeltaBadge curr={row.revenue} prev={prev.revenue} />
                            )}
                          </td>

                          {/* ROAS */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className={roasBadge(row.roas)}>{row.roas}%</span>
                            {compare && prev && (
                              <DeltaBadge curr={row.roas} prev={prev.roas} />
                            )}
                          </td>

                          {/* 도달 */}
                          <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                            {num(row.reach)}
                          </td>

                          {/* 노출 */}
                          <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                            {num(row.impressions)}
                          </td>

                          {/* 클릭 */}
                          <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                            {num(row.clicks)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* 합계 행 */}
                {data.length > 0 && (
                  <tfoot>
                    <tr className="bg-orange-50 border-t-2 border-orange-200 font-semibold">
                      {tab === 'ad' && <td className="px-4 py-3" />}
                      <td className="px-4 py-3 text-sm text-orange-800">합계 / 전체</td>
                      {tab !== 'campaign' && <td className="px-4 py-3" />}
                      <td className="px-4 py-3 text-right text-sm text-orange-800 whitespace-nowrap">
                        {krw(totals.spend)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-orange-800 whitespace-nowrap">
                        {krw(totals.revenue)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right text-sm whitespace-nowrap ${roasBadge(
                          totals.roas
                        )}`}
                      >
                        {totals.roas}%
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-orange-800">
                        {num(totals.reach)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-orange-800">
                        {num(totals.impressions)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-orange-800">
                        {num(totals.clicks)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* ── ROAS 범례 ── */}
        <div className="flex items-center gap-4 text-xs text-gray-400 pb-2">
          <span>ROAS 범례:</span>
          <span className="text-emerald-600 font-bold">■ 300%↑ 우수</span>
          <span className="text-amber-500 font-semibold">■ 150~299% 보통</span>
          <span className="text-rose-500 font-semibold">■ 150%↓ 주의</span>
        </div>
      </main>
    </div>
  );
}
