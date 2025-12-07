import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import PageContainer from '~/components/layout/PageContainer';

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
    <PageContainer>
      <MarketsPage />
    </PageContainer>
  );
};

export default ForecastingPage;
