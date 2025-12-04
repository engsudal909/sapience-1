'use client';

import { useParams } from 'next/navigation';
import { MarketPageProvider } from '~/lib/context/MarketPageProvider';
import { parseUrlParameter } from '~/lib/utils/util';
import MarketPageContent from '~/components/markets/pages/MarketPageContent';

const MarketPage = () => {
  const params = useParams();
  const marketId = params.marketId as string;
  const chainParam = params.chainShortName as string;

  const { chainId, marketAddress } = parseUrlParameter(chainParam);

  return (
    <MarketPageProvider pageDetails={{ chainId, marketAddress, marketId }}>
      <MarketPageContent />
    </MarketPageProvider>
  );
};

export default MarketPage;
