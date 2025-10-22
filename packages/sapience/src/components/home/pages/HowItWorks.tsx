'use client';

import { ArrowRight } from 'lucide-react';
import PulsingGradient from '../../shared/PulsingGradient';

export default function HowItWorks() {
  const steps: string[] = [
    'Users and AI agents forecast the probability of future events.',
    'Traders request positions.',
    'Agents / LPs compete to provide the best price.',
  ];

  return (
    <section className="relative isolate w-full py-16 md:py-24 xl:py-32 2xl:py-40 overflow-x-hidden">
      <PulsingGradient
        className="inset-0 -z-10"
        durationMs={9600}
        gradient={'radial-gradient(ellipse 45% 100% at 50% 0%, #E5D7C1 0%, #CBB892 35%, #7A6A47 70%, #151513 100%)'}
      />
      <div className="relative z-10 container mx-auto lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1200px] px-4 md:px-8 space-y-8 md:space-y-10">
        <div className="flex flex-col items-center text-center">
          <div className="eyebrow text-foreground">How It Works</div>
          <h2 className="mt-4 headline mx-auto">
            Sapience’s prediction markets operate like auctions
          </h2>
        </div>

        {/* Steps laid out as brand-black rounded cards; arrows overlay at 2xl to avoid overflow */}
        <div className="grid grid-cols-1 gap-5 md:gap-6 xl:gap-10 2xl:gap-12 xl:grid-cols-3 max-w-full overflow-x-hidden">
          {steps.map((text, index) => (
            <div key={index} className="relative min-w-0">
              <div className="bg-brand-black text-brand-white/90 rounded-lg border border-brand-white/10 px-4 py-4 md:px-5 md:py-5 w-full max-w-full sm:max-w-[340px] md:max-w-[400px] lg:max-w-[440px] xl:max-w-[480px] text-center min-w-0 mx-auto">
                <p className="text-sm md:text-base leading-relaxed mx-auto break-words">{text}</p>
              </div>
              {index < steps.length - 1 && (
                <div className="flex xl:hidden items-center justify-center my-2">
                  <ArrowRight
                    className="h-5 w-5 text-accent-gold opacity-50 rotate-90 animate-arrow-pulse"
                    aria-hidden="true"
                    strokeWidth={1.25}
                    style={{ animationDelay: `${index * 120}ms` }}
                  />
                </div>
              )}
              {index < steps.length - 1 && index % 3 !== 2 && (
                <span className="hidden xl:block absolute right-[-18px] 2xl:right-[-22px] top-1/2 -translate-y-1/2 translate-x-1/2 pointer-events-none">
                  <ArrowRight
                    className="h-5 w-5 text-accent-gold opacity-50 animate-arrow-pulse"
                    aria-hidden="true"
                    strokeWidth={1.25}
                    style={{ animationDelay: `${index * 120}ms` }}
                  />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


