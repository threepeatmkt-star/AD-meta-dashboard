/**
 * pages/[brand]/decisions.js — /samdae500/decisions, /mxssive/decisions 결정보드
 */
import { useRouter } from 'next/router';
import DecisionBoard from '../../components/DecisionBoard';
import { getBrand } from '../../lib/brands';

export default function BrandDecisionsPage() {
  const router = useRouter();
  if (!router.isReady) return null;
  const brand = getBrand(router.query.brand);
  if (!brand) { if (typeof window !== 'undefined') router.replace('/'); return null; }
  return <DecisionBoard brand={brand}/>;
}
