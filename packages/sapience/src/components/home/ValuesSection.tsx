'use client';

import Link from 'next/link';
import { Users, Code2, ShieldCheck } from 'lucide-react';

export default function ValuesSection() {
  return (
    <section className="relative pt-20 md:pt-24 lg:pt-32 xl:pt-40 pb-20 md:pb-24 lg:pb-32 xl:pb-40 px-4 sm:px-6 w-full">
      <div className="max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 lg:gap-14">
          <div className="rounded-lg border-[1.5px] border-ethena/25 bg-card p-5 md:p-6 shadow-[0_0_10px_rgba(136,180,245,0.25)]">
            <h3 className="text-xl font-medium mb-2 flex items-center gap-2">
              <Users className="h-5 w-5" aria-hidden="true" />
              <span>Community First</span>
            </h3>
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
              <span className="font-medium">
                No fees collected by an exchange.
              </span>{' '}
              Sapience is being built in public with its users.{' '}
              <Link
                href="https://discord.gg/sapience"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-foreground/20 underline-offset-4 transition-colors hover:decoration-foreground/60"
              >
                Join the conversation
              </Link>
            </p>
          </div>
          <div className="rounded-lg border-[1.5px] border-ethena/25 bg-card p-5 md:p-6 shadow-[0_0_10px_rgba(136,180,245,0.25)]">
            <h3 className="text-xl font-medium mb-2 flex items-center gap-2">
              <Code2 className="h-5 w-5" aria-hidden="true" />
              <span>Open Source</span>
            </h3>
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
              <Link
                href="https://github.com/sapiencexyz/sapience"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-foreground/20 underline-offset-4 transition-colors hover:decoration-foreground/60"
              >
                Public code
              </Link>{' '}
              with permissive licensing. Anyone can contribute, audit, or build
              on the platform without asking permission.
            </p>
          </div>
          <div className="rounded-lg border-[1.5px] border-ethena/25 bg-card p-5 md:p-6 shadow-[0_0_10px_rgba(136,180,245,0.25)]">
            <h3 className="text-xl font-medium mb-2 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              <span>Trustless by Design</span>
            </h3>
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
              Unchangeable smart contracts and decentralized settlement remove
              the need to trust an exchange.{' '}
              <Link
                href="http://docs.sapience.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-foreground/20 underline-offset-4 transition-colors hover:decoration-foreground/60"
              >
                Learn more
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
