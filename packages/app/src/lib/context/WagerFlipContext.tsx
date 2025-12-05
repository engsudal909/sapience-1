'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface WagerFlipContextType {
  isFlipped: boolean;
  toggle: () => void;
}

const WagerFlipContext = createContext<WagerFlipContextType | undefined>(
  undefined
);

interface WagerFlipProviderProps {
  children: ReactNode;
}

export function WagerFlipProvider({ children }: WagerFlipProviderProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  const toggle = () => setIsFlipped((prev) => !prev);

  return (
    <WagerFlipContext.Provider value={{ isFlipped, toggle }}>
      {children}
    </WagerFlipContext.Provider>
  );
}

export function useWagerFlip(): WagerFlipContextType {
  const context = useContext(WagerFlipContext);
  if (context === undefined) {
    throw new Error('useWagerFlip must be used within a WagerFlipProvider');
  }
  return context;
}
