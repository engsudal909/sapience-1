'use client';

import { useState, useEffect } from 'react';
import HackathonBanner from './HackathonBanner';
import LowBalanceBanner from './LowBalanceBanner';

/**
 * Coordinates banner visibility and height tracking.
 * LowBalanceBanner takes priority over HackathonBanner.
 */
const BannerCoordinator = () => {
  const [isLowBalanceVisible, setIsLowBalanceVisible] = useState(false);

  // Initialize CSS custom property
  useEffect(() => {
    document.documentElement.style.setProperty('--banner-height', '0px');
  }, []);

  return (
    <>
      <LowBalanceBanner
        onVisibilityChange={(isVisible) => setIsLowBalanceVisible(isVisible)}
      />
      <HackathonBanner showWhenLowBalanceHidden={!isLowBalanceVisible} />
    </>
  );
};

export default BannerCoordinator;
