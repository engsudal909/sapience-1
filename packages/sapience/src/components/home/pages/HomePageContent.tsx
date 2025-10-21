'use client';

import ElizosPreviewSection from '~/components/home/ElizosPreviewSection';
import SusdeCollateralPreviewSection from '~/components/home/SusdeCollateralPreviewSection';
import Hero from '~/components/home/Hero';
import HomepageEnd from '~/components/home/HomepageEnd';
import ValuesSection from '~/components/home/ValuesSection';
import ParticlesBackdrop from '~/components/home/ParticlesBackdrop';

const HomePageContent = () => {
  return (
    <div className="flex flex-col min-h-screen w-full overflow-x-hidden">
      <Hero />
      <div className="relative">
        <ParticlesBackdrop />
        <div className="relative z-0">
          <ValuesSection />
          <SusdeCollateralPreviewSection />
          <ElizosPreviewSection />
          <HomepageEnd />
        </div>
      </div>
    </div>
  );
};

export default HomePageContent;
