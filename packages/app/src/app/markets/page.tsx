import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

const MarketsPageSkeleton = () => <div className="space-y-4" />;

// Dynamically import MarketsPage
const MarketsPage = dynamic(() => import('~/components/markets/MarketsPage'), {
  ssr: false, // Disable server-side rendering
  loading: () => <MarketsPageSkeleton />, // Show skeleton while loading
});

export const metadata: Metadata = {
  title: 'Prediction Markets',
  description: 'Browse prediction markets across various focus areas',
};

const ForecastingPage = () => {
  return (
    <div className="w-full mx-auto px-4 md:px-8 lg:pr-0 md:pt-8 mt-16">
      <MarketsPage />
    </div>
  );
};

export default ForecastingPage;
