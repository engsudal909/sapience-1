'use client';

import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

const RouteBackgroundOverlay = () => {
  const pathname = usePathname();
  const isTerminal =
    pathname === '/terminal' || pathname?.startsWith('/terminal/');

  return (
    <motion.div
      className="fixed inset-0 bg-brand-black pointer-events-none z-0"
      initial={false}
      animate={{ opacity: isTerminal ? 1 : 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    />
  );
};

export default RouteBackgroundOverlay;
