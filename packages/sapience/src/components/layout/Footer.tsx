'use client';

import { Button } from '@sapience/sdk/ui/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';
import { SiSubstack } from 'react-icons/si';
import { BookOpen } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="hidden md:block w-full border-t border-border/20 bg-background/60 backdrop-blur-sm">
      <div className="mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs">
          <span>Powered by</span>
          <a
            href="https://ethena.fi"
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit"
          >
            <Image
              src="/ethena.svg"
              alt="Ethena"
              width={64}
              height={18}
              className="dark:invert opacity-90 hover:opacity-100 transition-opacity duration-200"
            />
          </a>
        </div>

        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-3 text-xs">
            <Link
              href="https://docs.sapience.xyz/terms-of-service"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center font-normal text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </Link>
            <Link
              href="https://docs.sapience.xyz/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center font-normal text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" className="h-4 w-4 rounded-full" asChild>
              <a
                href="https://github.com/sapiencexyz/sapience"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  className="dark:invert"
                  src="/github.svg"
                  alt="GitHub"
                  width={10}
                  height={10}
                />
              </a>
            </Button>
            <Button size="icon" className="h-4 w-4 rounded-full" asChild>
              <a
                href="https://x.com/sapiencehq"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  className="dark:invert"
                  src="/x.svg"
                  alt="Twitter"
                  width={10}
                  height={10}
                />
              </a>
            </Button>
            <Button size="icon" className="h-4 w-4 rounded-full" asChild>
              <a
                href="https://discord.gg/sapience"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  className="dark:invert"
                  src="/discord.svg"
                  alt="Discord"
                  width={10}
                  height={10}
                />
              </a>
            </Button>
            <Button size="icon" className="h-4 w-4 rounded-full" asChild>
              <a
                href="https://blog.sapience.xyz"
                target="_blank"
                rel="noopener noreferrer"
              >
                <SiSubstack
                  className="h-0.5 w-0.5 scale-[60%]"
                  aria-label="Substack"
                />
              </a>
            </Button>
            <Button size="icon" className="h-4 w-4 rounded-full" asChild>
              <a
                href="https://docs.sapience.xyz"
                target="_blank"
                rel="noopener noreferrer"
              >
                <BookOpen
                  className="h-0.5 w-0.5 scale-[60%]"
                  strokeWidth={1.25}
                />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
