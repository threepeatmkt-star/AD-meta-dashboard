/**
 * pages/[brand]/index.js — /samdae500, /mxssive 대시보드
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Dashboard from '../../components/Dashboard';
import { getBrand } from '../../lib/brands';

export default function BrandDashboardPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(null);
  useEffect(() => { setAuthed(sessionStorage.getItem('dash_auth') === '1'); }, []);

  if (!router.isReady || authed === null) return null;

  const brand = getBrand(router.query.brand);
  if (!brand) { if (typeof window !== 'undefined') router.replace('/'); return null; }
  if (!authed) { if (typeof window !== 'undefined') router.replace('/'); return null; }

  return <Dashboard brand={brand}/>;
}
