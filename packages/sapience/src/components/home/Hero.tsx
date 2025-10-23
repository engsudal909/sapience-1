'use client';

import { useEffect, useRef } from 'react';
import Ticker from '~/components/home/Ticker';
import HeroBackgroundLines from '~/components/home/HeroBackgroundLines';
import PulsingGradient from '~/components/shared/PulsingGradient';

export default function Hero() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Try to ensure autoplay starts even if the browser blocks the initial attempt
    const attemptPlay = () => {
      const playPromise = v.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch(() => {
          // ignore autoplay rejection; user interaction will start playback
        });
      }
    };

    if (v.readyState >= 2) {
      attemptPlay();
    } else {
      const onCanPlay = () => {
        attemptPlay();
        v.removeEventListener('canplay', onCanPlay);
      };
      v.addEventListener('canplay', onCanPlay);
      return () => v.removeEventListener('canplay', onCanPlay);
    }
  }, []);
  return (
    <section className="relative isolate flex flex-col min-h-[100svh] w-full overflow-hidden">
      <HeroBackgroundLines />
      <div className="relative z-10 container mx-auto lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] px-4 md:px-8 pt-16 md:pt-24 pb-0 flex-1 flex flex-col justify-center">
        <div className="relative z-10 w-full flex flex-col items-center">
          <div className="relative">
            <PulsingGradient
              className="inset-[-10px] rounded-[18px] -z-10"
              durationMs={9600}
              gradient={
                'radial-gradient(ellipse 80% 90% at 50% 50%, hsl(var(--accent-gold)/0.14) 0%, hsl(var(--accent-gold)/0.06) 45%, transparent 70%)'
              }
            />
            <video
              ref={videoRef}
              className="relative w-full max-w-[300px] md:max-w-[300px] lg:max-w-[340px] xl:max-w-[380px] 2xl:max-w-[420px] rounded-2xl border border-[hsl(var(--accent-gold)/0.2)] ring-1 ring-[hsl(var(--accent-gold)/0.12)] shadow-[0_0_16px_hsl(var(--accent-gold)/0.1)] drop-shadow-[0_0_8px_hsl(var(--accent-gold)/0.16)] mb-6 md:mb-8"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
            >
              <source src="/hero.mp4" type="video/mp4" />
            </video>
          </div>
          <div className="rounded-2xl md:rounded-[20px] bg-brand-black text-foreground px-5 md:px-8 py-5 md:py-6 flex flex-col items-center text-center shadow-sm border border-border/20">
            <h1 className="font-heading text-2xl leading-snug md:text-2xl md:leading-snug lg:text-2xl max-w-5xl">
              Forecast the future with next-gen prediction markets
            </h1>
            <div className="mt-5 md:mt-3 flex flex-col md:flex-row items-center gap-3 md:gap-4 text-foreground">
              <span className="eyebrow">TRANSPARENT</span>
              <div className="md:hidden h-px w-8 bg-foreground opacity-50" />
              <span className="hidden md:inline text-foreground/50">|</span>
              <span className="eyebrow">PERMISSIONLESS</span>
              <div className="md:hidden h-px w-8 bg-foreground opacity-50" />
              <span className="hidden md:inline text-foreground/50">|</span>
              <span className="eyebrow">OPEN SOURCE</span>
            </div>
          </div>
        </div>
      </div>
      <div className="relative z-10 w-full">
        <Ticker />
      </div>
    </section>
  );
}
