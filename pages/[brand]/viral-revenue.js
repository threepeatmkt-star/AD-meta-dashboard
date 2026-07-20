/**
 * pages/[brand]/viral-revenue.js
 */
import { useRouter } from 'next/router';
import ViralRevenueView from '../../components/ViralRevenueView';
import { getBrand } from '../../lib/brands';

export default function BrandViralRevenuePage() {
  const router = useRouter();
  if (!router.isReady) return null;
  const brand = getBrand(router.query.brand);
  if (!brand) { if (typeof window !== 'undefined') router.replace('/'); return null; }
  return <ViralRevenueView brand={brand}/>;
}
