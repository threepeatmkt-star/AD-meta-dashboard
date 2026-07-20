/**
 * pages/[brand]/da-revenue.js
 */
import { useRouter } from 'next/router';
import DARevenueView from '../../components/DARevenueView';
import { getBrand } from '../../lib/brands';

export default function BrandDARevenuePage() {
  const router = useRouter();
  if (!router.isReady) return null;
  const brand = getBrand(router.query.brand);
  if (!brand) { if (typeof window !== 'undefined') router.replace('/'); return null; }
  return <DARevenueView brand={brand}/>;
}
