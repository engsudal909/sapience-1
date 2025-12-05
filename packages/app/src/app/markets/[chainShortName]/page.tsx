'use client';

import { useParams } from 'next/navigation';
import { MarketGroupPageProvider } from '~/lib/context/MarketGroupPageProvider';
import { parseUrlParameter } from '~/lib/utils/util';
import MarketGroupPageContent from '~/components/markets/pages/MarketGroupPageContent';

const MarketGroupPage = () => {
  const params = useParams();
  const paramString = params.chainShortName as string;
  const { chainShortName, marketAddress } = parseUrlParameter(paramString);

  return (
    <MarketGroupPageProvider pageDetails={{ chainShortName, marketAddress }}>
      <MarketGroupPageContent />
    </MarketGroupPageProvider>
  );
};

export default MarketGroupPage;
