'use client';

import Ticker from '~/components/home/Ticker';
import HeroBackgroundLines from '~/components/home/HeroBackgroundLines';

export default function Hero() {
  return (
    <section className="relative isolate flex flex-col min-h-[100svh] w-full overflow-hidden">
      <HeroBackgroundLines />
      <div className="relative z-10 container mx-auto lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] px-4 md:px-8 pt-16 md:pt-24 pb-0 flex-1 flex flex-col justify-center">
        <div className="relative z-10 w-full flex flex-col items-center">
          <video
            className="w-full max-w-[330px] rounded-xl border-2 border-[hsl(var(--accent-gold)/0.25)] mb-6 md:mb-8"
            src="/hero.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="rounded-2xl md:rounded-[20px] bg-brand-black text-foreground px-5 md:px-8 py-5 md:py-6 flex flex-col items-center text-center shadow-sm border border-border/20">
            <h1 className="font-heading text-lg leading-snug md:text-2xl md:leading-snug lg:text-2xl max-w-5xl">
              Forecast the future with next-gen prediction markets
            </h1>
            <div className="mt-2 md:mt-3 flex items-center gap-3 md:gap-4 text-foreground">
              <span className="eyebrow">TRANSPARENT</span>
              <span className="text-foreground/50">|</span>
              <span className="eyebrow">PERMISSIONLESS</span>
              <span className="text-foreground/50">|</span>
              <span className="eyebrow">OPEN SOURCE</span>
            </div>
          </div>
        </div>
      </div>
      <div className="relative z-10 w-full bg-brand-black text-foreground">
        <Ticker />
      </div>
    </section>
  );
}
