'use client';

import HeroBackgroundLines from '~/components/home/HeroBackgroundLines';
import PulsingGradient from '~/components/shared/PulsingGradient';

const HackathonPageContent = () => {
  return (
    <main className="min-h-screen w-full">
      <HackathonHero />
      <LogoBlock />
      <WhatIsSapience />
      <WhatIsHackathon />
      <Rules />
      <SignUp />
    </main>
  );
};

function HackathonHero() {
  return (
    <section className="relative isolate flex flex-col min-h-[80svh] w-full overflow-hidden">
      <HeroBackgroundLines />
      <PulsingGradient
        className="inset-0 -z-10"
        durationMs={12000}
        gradient={
          'radial-gradient(ellipse 70% 70% at 50% 30%, hsl(var(--accent-gold)/0.12) 0%, hsl(var(--accent-gold)/0.04) 50%, transparent 80%)'
        }
      />
      <div className="relative z-10 container mx-auto lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] px-4 md:px-8 pt-20 md:pt-28 pb-12 flex-1 flex flex-col justify-center">
        <div className="w-full flex flex-col items-center text-center">
          {/* Title */}
          <p className="eyebrow text-foreground mb-6 md:mb-8">
            Inaugural Agent-Building Hackathon
          </p>

          {/* H1 (a) - Date */}
          <h1 className="font-heading text-3xl md:text-5xl lg:text-6xl text-foreground mb-4 md:mb-6">
            December 8th - January 5th
          </h1>

          {/* H1 (b) - Tagline */}
          <h1 className="font-heading text-xl md:text-3xl lg:text-4xl text-foreground/90 max-w-4xl mb-6 md:mb-8">
            Build Agents. Win Prizes.{' '}
            <span className="text-accent-gold">Forecast the Future.</span>
          </h1>

          {/* H3 - Subheadline */}
          <p className="text-base md:text-lg lg:text-xl text-foreground/70 max-w-2xl leading-relaxed">
            You can shape the future of prediction markets by building
            autonomous agents and competing for 10000 USDe in prizes.
          </p>
        </div>
      </div>
    </section>
  );
}

function LogoBlock() {
  return (
    <section className="w-full py-12 md:py-16 border-y border-border/20">
      <div className="container mx-auto lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] px-4 md:px-8">
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 lg:gap-24">
          {/* Arbitrum (L) */}
          <a
            href="https://arbitrum.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-3 opacity-80 hover:opacity-100 transition-opacity"
          >
            <div className="h-16 w-16 md:h-20 md:w-20 flex items-center justify-center">
              <svg
                viewBox="0 0 40 40"
                className="h-full w-full"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="20" cy="20" r="20" fill="#213147" />
                <path
                  d="M24.308 24.6892L20.6506 15.8284C20.4894 15.4376 20.1682 15.1516 19.779 15.0916C19.3898 15.0316 18.9902 15.2092 18.729 15.5416L14.3478 21.3804C14.1686 21.6116 14.0978 21.91 14.1538 22.1996C14.2098 22.4892 14.3874 22.7376 14.6398 22.8824L19.021 25.3364C19.1922 25.4324 19.3878 25.4824 19.5858 25.4824C19.8166 25.4824 20.0438 25.4152 20.2394 25.2836L23.8506 22.8836C24.1914 22.6584 24.4046 22.2904 24.4186 21.8892C24.4326 21.488 24.2458 21.1064 23.9218 20.8576L21.6102 19.1032L24.308 24.6892Z"
                  fill="#12AAFF"
                />
                <path
                  d="M25.6518 26.1248L26.4034 27.6248L28.0702 26.5164L26.8538 24.2832L25.6518 26.1248Z"
                  fill="#9DCCED"
                />
                <path
                  d="M19.5858 27.2248L23.9506 29.6664C24.367 29.8996 24.8618 29.9248 25.2986 29.734C25.7354 29.5432 26.0666 29.1584 26.1986 28.692L26.7466 26.8248L19.5858 27.2248Z"
                  fill="#213147"
                />
                <path
                  d="M14.8702 25.1832L17.2974 28.9416C17.5098 29.272 17.8326 29.5136 18.2086 29.6212C18.5846 29.7288 18.9874 29.6952 19.339 29.5272L19.5858 27.2248L14.8702 25.1832Z"
                  fill="#213147"
                />
                <path
                  d="M13.2034 24.2832L11.9542 26.5412L13.621 27.6496L14.3726 26.1496L13.2034 24.2832Z"
                  fill="#9DCCED"
                />
              </svg>
            </div>
            <span className="text-sm text-foreground/70">Arbitrum</span>
          </a>

          {/* Sapience (C) */}
          <a
            href="https://sapience.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-3 opacity-80 hover:opacity-100 transition-opacity"
          >
            <img
              src="/sapience.svg"
              alt="Sapience"
              className="h-16 w-16 md:h-20 md:w-20"
            />
            <span className="text-sm text-foreground/70">Sapience</span>
          </a>

          {/* Eliza OS (R) */}
          <a
            href="https://elizaos.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-3 opacity-80 hover:opacity-100 transition-opacity"
          >
            <img
              src="/eliza-circle.svg"
              alt="Eliza OS"
              className="h-16 w-16 md:h-20 md:w-20"
            />
            <span className="text-sm text-foreground/70">Eliza OS</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function WhatIsSapience() {
  return (
    <section className="relative isolate w-full py-16 md:py-24 overflow-hidden">
      <PulsingGradient
        className="left-[-20%] top-0 h-full w-[80%] -z-10"
        durationMs={9600}
        gradient={
          'radial-gradient(ellipse 60% 80% at 0% 50%, hsl(var(--accent-gold)/0.08) 0%, transparent 70%)'
        }
      />
      <div className="container mx-auto lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1200px] px-4 md:px-8">
        <div className="flex flex-col items-start">
          <h2 className="eyebrow text-foreground mb-4">What is Sapience?</h2>
          <p className="headline max-w-4xl mb-8">
            Sapience is an open source platform for prediction markets, where
            people place wagers on future events. We believe recent developments
            in artificial intelligence have unlocked a new design space:
            forecasting agents. Prediction markets can incentivize their
            development and help society anticipate—and prepare for—the future.
            Our developer tools are designed for hobbyists with no programming
            experience as well as professional trading desks.
          </p>
          <p className="text-base md:text-lg text-foreground/80">
            <a href="https://www.sapience.xyz/bots" className="gold-link">
              Learn more about building bots on Sapience here.
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

function WhatIsHackathon() {
  return (
    <section className="relative isolate w-full py-16 md:py-24 overflow-hidden">
      <PulsingGradient
        className="inset-0 -z-10"
        durationMs={9600}
        gradient={
          'radial-gradient(ellipse 50% 100% at 50% 0%, #E5D7C1 0%, #CBB892 35%, #7A6A47 70%, #151513 100%)'
        }
      />
      <div className="container mx-auto lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1200px] px-4 md:px-8">
        <div className="flex flex-col items-start mb-12 md:mb-16">
          <h2 className="eyebrow text-foreground mb-4">
            What is this hackathon?
          </h2>
          <p className="headline max-w-4xl mb-6">
            You'll compete to build the most accurate forecasting agent and face
            off against other builders to forecast live, high-signal questions.
          </p>
          <p className="text-base md:text-lg text-foreground/70 max-w-3xl mb-6">
            This event is launched in partnership with{' '}
            <a
              href="https://elizaos.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="gold-link"
            >
              Eliza OS
            </a>{' '}
            and sponsored by a grant from{' '}
            <a
              href="https://arbitrum.io"
              target="_blank"
              rel="noopener noreferrer"
              className="gold-link"
            >
              Arbitrum
            </a>
            .
          </p>
          <p className="text-base md:text-lg text-foreground/70 max-w-3xl">
            Participants can compete with two types of bots, and each type is
            benchmarked separately.
          </p>
        </div>

        {/* Two tracks */}
        <div className="grid md:grid-cols-2 gap-6 md:gap-8">
          {/* Forecasting Agents */}
          <div className="bg-brand-black rounded-2xl border border-brand-white/10 p-6 md:p-8">
            <h3 className="font-heading text-xl md:text-2xl text-foreground mb-4">
              Forecasting Agents
            </h3>
            <p className="text-foreground/70 leading-relaxed">
              Forecasting agents are scored via Brier Score, which penalizes for
              both overconfidence and poor calibration. The lower your average
              Brier Score, the higher you'll rank on the forecasting
              leaderboard.
            </p>
          </div>

          {/* Market-Making Agents */}
          <div className="bg-brand-black rounded-2xl border border-brand-white/10 p-6 md:p-8">
            <h3 className="font-heading text-xl md:text-2xl text-foreground mb-4">
              Prediction Market-Making Agents
            </h3>
            <p className="text-foreground/70 leading-relaxed">
              Market-making agents are evaluated based on trading performance
              over the course of the hackathon. A separate leaderboard will be
              maintained for market making agents.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Rules() {
  const rules = [
    'Enter one prize-eligible bot per team.',
    'No human-in-the-loop. Bots must act autonomously.',
    'Send the address of the agent to the team in Discord.',
    'Make the codebase public. Or send a private codebase to the Sapience team.',
  ];

  return (
    <section className="w-full py-16 md:py-24">
      <div className="container mx-auto lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1200px] px-4 md:px-8">
        <div className="flex flex-col items-start mb-10">
          <h2 className="eyebrow text-foreground mb-4">What are the rules?</h2>
          <p className="headline max-w-2xl">
            This hackathon has four simple rules.
          </p>
        </div>

        <ul className="space-y-4 max-w-2xl">
          {rules.map((rule, index) => (
            <li
              key={index}
              className="flex items-start gap-4 text-base md:text-lg text-foreground/80"
            >
              <span className="text-accent-gold font-mono font-semibold">
                {index + 1}.
              </span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SignUp() {
  return (
    <section className="relative isolate w-full py-16 md:py-24 overflow-hidden">
      <PulsingGradient
        className="right-[-20%] bottom-0 h-full w-[80%] -z-10"
        durationMs={9600}
        gradient={
          'radial-gradient(ellipse 60% 80% at 100% 80%, hsl(var(--accent-gold)/0.1) 0%, transparent 70%)'
        }
      />
      <div className="container mx-auto lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1200px] px-4 md:px-8">
        <div className="flex flex-col items-start">
          <h2 className="eyebrow text-foreground mb-4">How can I sign up?</h2>
          <p className="headline max-w-3xl mb-6">
            Sapience and Eliza OS teams will host a live kickoff call in the
            Eliza Discord. On the call there will be Q&A with both teams, and
            you'll learn:
          </p>
          <ul className="space-y-3 text-base md:text-lg text-foreground/70 mb-8">
            <li className="flex items-start gap-3">
              <span className="text-accent-gold">•</span>
              <span>How to register your agent</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-accent-gold">•</span>
              <span>How to use the starter template</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-accent-gold">•</span>
              <span>Tips for track selection and benchmarking</span>
            </li>
          </ul>
          <p className="text-base md:text-lg text-foreground/80">
            <a
              href="https://discord.gg/ai16z"
              target="_blank"
              rel="noopener noreferrer"
              className="gold-link"
            >
              Join the Discord here.
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

export default HackathonPageContent;
