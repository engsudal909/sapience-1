'use client';

// Hero section for the bots page - smaller than homepage hero but still exciting
export default function BotsHero() {
  // Removed Spline iframe background

  return (
    <div className="relative overflow-hidden flex items-center justify-center w-full pb-8 md:pb-16 lg:pb-24">
      {/* Outer container with padding and iframe background */}
      <div className="relative z-10 w-full px-0 md:px-6 pt-20 md:pt-24 max-w-[1020px] mx-auto">
        <div className="relative overflow-hidden rounded-none md:rounded-xl shadow-inner mt-2">
          {/* Content card */}
          <div className="relative z-10 w-100 text-center bg-background/[0.2] backdrop-blur-[2px] border-y md:border border-gray-500/20 rounded-none md:rounded-xl shadow-sm p-8 lg:p-16">
            <h1 className="font-sans text-2xl lg:text-4xl font-normal mb-2 lg:mb-4">
              Trade with Machine Intelligence
            </h1>

            <p className="md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Create software leveraging large language models that can conduct
              research and trade prediction markets with superhuman ability.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
