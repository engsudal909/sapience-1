'use client';

import { useEffect, useRef, useState } from 'react';
import HeroBackgroundLines from '~/components/home/HeroBackgroundLines';
import PulsingGradient from '~/components/shared/PulsingGradient';
import Ticker from '~/components/home/Ticker';

export default function Hero() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

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
      setIsVideoReady(true);
    } else {
      const onCanPlay = () => {
        attemptPlay();
        setIsVideoReady(true);
        v.removeEventListener('canplay', onCanPlay);
      };
      v.addEventListener('canplay', onCanPlay);
      return () => v.removeEventListener('canplay', onCanPlay);
    }
  }, []);
  return (
    <section className="relative isolate flex flex-col min-h-[100svh] w-full overflow-hidden">
      <HeroBackgroundLines />
      <div className="relative z-10 container mx-auto lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] px-4 md:px-8 pb-0 flex-1 flex flex-col justify-center pt-0">
        <div className="relative z-10 w-full flex flex-col items-center">
          <div
            className={`relative w-full max-w-[300px] md:max-w-[300px] lg:max-w-[340px] xl:max-w-[380px] 2xl:max-w-[420px] aspect-[3/2] rounded-2xl border border-[hsl(var(--accent-gold)/0.2)] ring-1 ring-[hsl(var(--accent-gold)/0.12)] shadow-[0_0_16px_hsl(var(--accent-gold)/0.1)] drop-shadow-[0_0_8px_hsl(var(--accent-gold)/0.16)] mb-8 md:mb-10 overflow-hidden transition-opacity duration-500 ${isVideoReady ? 'opacity-100' : 'opacity-0'}`}
          >
            <PulsingGradient
              className="inset-[-10px] rounded-[18px] -z-10"
              durationMs={9600}
              gradient={
                'radial-gradient(ellipse 80% 90% at 50% 50%, hsl(var(--accent-gold)/0.14) 0%, hsl(var(--accent-gold)/0.06) 45%, transparent 70%)'
              }
            />
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onLoadedData={() => setIsVideoReady(true)}
            >
              <source src="/hero.mp4" type="video/mp4" />
            </video>
          </div>
          <div className="w-full md:w-auto flex flex-col items-center text-center">
            <h1 className="headline text-center">
              Forecast the future with next-gen prediction markets
            </h1>
            <p className="mt-3 text-xs font-mono uppercase tracking-wider text-accent-gold flex items-center justify-center gap-1 md:gap-1.5 flex-wrap">
              <span>Transparent</span>
              <span className="opacity-50 mx-1.5">·</span>
              <span>Permissionless</span>
              <span className="hidden md:inline opacity-50 mx-1.5">·</span>
              {/* Force a wrap on small screens where the separator is hidden */}
              <span className="md:hidden basis-full h-0" aria-hidden="true" />
              <span>Open Source</span>
            </p>
          </div>
        </div>
      </div>
      <Ticker />
    </section>
  );
}
