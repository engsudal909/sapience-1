'use client';

import AuctionPageContent from '~/components/auction/pages/AuctionPageContent';

const AuctionPage = () => {
  return (
    <div className="relative min-h-screen">
      <div className="relative">
        <AuctionPageContent />
      </div>
    </div>
  );
};

export default AuctionPage;
