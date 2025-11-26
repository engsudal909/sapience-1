'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { Mail, Wallet } from 'lucide-react';
import Image from 'next/image';

import {
  useWalletDiscovery,
  type EIP6963ProviderDetail,
} from '~/hooks/useWalletDiscovery';
import { useExternalWalletConnect } from '~/hooks/useExternalWalletConnect';

interface ConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Wallet icons as data URLs (from @rainbow-me/rainbowkit)
const WALLET_ICONS = {
  walletConnect:
    'data:image/svg+xml,<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">%0A<rect width="28" height="28" fill="%233B99FC"/>%0A<path d="M8.38969 10.3739C11.4882 7.27538 16.5118 7.27538 19.6103 10.3739L19.9832 10.7468C20.1382 10.9017 20.1382 11.1529 19.9832 11.3078L18.7076 12.5835C18.6301 12.6609 18.5045 12.6609 18.4271 12.5835L17.9139 12.0703C15.7523 9.9087 12.2477 9.9087 10.0861 12.0703L9.53655 12.6198C9.45909 12.6973 9.3335 12.6973 9.25604 12.6198L7.98039 11.3442C7.82547 11.1893 7.82547 10.9381 7.98039 10.7832L8.38969 10.3739ZM22.2485 13.012L23.3838 14.1474C23.5387 14.3023 23.5387 14.5535 23.3838 14.7084L18.2645 19.8277C18.1096 19.9827 17.8584 19.9827 17.7035 19.8277C17.7035 19.8277 17.7035 19.8277 17.7035 19.8277L14.0702 16.1944C14.0314 16.1557 13.9686 16.1557 13.9299 16.1944C13.9299 16.1944 13.9299 16.1944 13.9299 16.1944L10.2966 19.8277C10.1417 19.9827 9.89053 19.9827 9.73561 19.8278C9.7356 19.8278 9.7356 19.8277 9.7356 19.8277L4.61619 14.7083C4.46127 14.5534 4.46127 14.3022 4.61619 14.1473L5.75152 13.012C5.90645 12.857 6.15763 12.857 6.31255 13.012L9.94595 16.6454C9.98468 16.6841 10.0475 16.6841 10.0862 16.6454C10.0862 16.6454 10.0862 16.6454 10.0862 16.6454L13.7194 13.012C13.8743 12.857 14.1255 12.857 14.2805 13.012C14.2805 13.012 14.2805 13.012 14.2805 13.012L17.9139 16.6454C17.9526 16.6841 18.0154 16.6841 18.0541 16.6454L21.6874 13.012C21.8424 12.8571 22.0936 12.8571 22.2485 13.012Z" fill="white"/>%0A</svg>%0A',
  coinbase:
    'data:image/svg+xml,<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">%0A<rect width="28" height="28" fill="%232C5FF6"/>%0A<path fill-rule="evenodd" clip-rule="evenodd" d="M14 23.8C19.4124 23.8 23.8 19.4124 23.8 14C23.8 8.58761 19.4124 4.2 14 4.2C8.58761 4.2 4.2 8.58761 4.2 14C4.2 19.4124 8.58761 23.8 14 23.8ZM11.55 10.8C11.1358 10.8 10.8 11.1358 10.8 11.55V16.45C10.8 16.8642 11.1358 17.2 11.55 17.2H16.45C16.8642 17.2 17.2 16.8642 17.2 16.45V11.55C17.2 11.1358 16.8642 10.8 16.45 10.8H11.55Z" fill="white"/>%0A</svg>%0A',
  okx: 'data:image/svg+xml,<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">%0A<rect width="28" height="28" fill="black"/>%0A<path d="M16.8 11.2H11.2V16.8H16.8V11.2Z" fill="white"/>%0A<path d="M11.2 5.6H5.6V11.2H11.2V5.6Z" fill="white"/>%0A<path d="M22.4 5.6H16.8V11.2H22.4V5.6Z" fill="white"/>%0A<path d="M11.2 16.8H5.6V22.4H11.2V16.8Z" fill="white"/>%0A<path d="M22.4 16.8H16.8V22.4H22.4V16.8Z" fill="white"/>%0A</svg>%0A',
};

export default function ConnectDialog({
  open,
  onOpenChange,
}: ConnectDialogProps) {
  const { login } = usePrivy();
  const { isConnected } = useAccount();
  const [isClient, setIsClient] = useState(false);

  // EIP-6963 wallet discovery
  const { discoveredWallets, isDiscovering } = useWalletDiscovery();

  // External wallet connection handlers
  const {
    connectingWallet,
    isConnecting,
    connectEIP6963Wallet,
    connectWalletConnect,
    connectCoinbaseWallet,
    connectOKXWallet,
  } = useExternalWalletConnect();

  // Track client-side hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Close dialog when connected
  useEffect(() => {
    if (isConnected && open) {
      onOpenChange(false);
    }
  }, [isConnected, open, onOpenChange]);

  const handleEmailLogin = useCallback(() => {
    onOpenChange(false);
    login();
  }, [login, onOpenChange]);

  const handleEIP6963Connect = useCallback(
    async (wallet: EIP6963ProviderDetail) => {
      await connectEIP6963Wallet(wallet);
    },
    [connectEIP6963Wallet]
  );

  const handleWalletConnectClick = useCallback(async () => {
    await connectWalletConnect();
  }, [connectWalletConnect]);

  const handleCoinbaseClick = useCallback(async () => {
    await connectCoinbaseWallet();
  }, [connectCoinbaseWallet]);

  const handleOKXClick = useCallback(async () => {
    await connectOKXWallet();
  }, [connectOKXWallet]);

  // Filter out WalletConnect, Coinbase, and OKX from discovered wallets
  // (they're shown separately as always-available options)
  const filteredDiscoveredWallets = discoveredWallets.filter((wallet) => {
    const rdns = wallet.info.rdns.toLowerCase();
    const name = wallet.info.name.toLowerCase();
    return (
      !rdns.includes('walletconnect') &&
      !name.includes('walletconnect') &&
      !rdns.includes('coinbase') &&
      !name.includes('coinbase') &&
      !rdns.includes('okx') &&
      !rdns.includes('okex') &&
      !name.includes('okx')
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-6 gap-0 border-border/50 bg-[hsl(var(--background))]">
        <DialogHeader className="pb-6">
          <DialogTitle className="text-center text-xl font-normal">
            Log in
          </DialogTitle>
        </DialogHeader>

        {/* Email/SMS Login Button */}
        <Button
          variant="outline"
          className="w-full h-14 justify-start gap-3 px-4 text-base font-medium bg-[hsl(var(--muted)/0.3)] border-border/50 hover:bg-[hsl(var(--muted)/0.5)]"
          onClick={handleEmailLogin}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded bg-muted/50">
            <Mail className="h-5 w-5 text-muted-foreground" />
          </div>
          <span>Log in with Email or SMS</span>
        </Button>

        {/* Divider */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-3 text-muted-foreground uppercase tracking-wide">
              or
            </span>
          </div>
        </div>

        {/* Wallet Options */}
        <div className="flex flex-col gap-3">
          {/* Loading state */}
          {!isClient && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Loading wallets...
            </p>
          )}

          {/* Discovered wallets from EIP-6963 */}
          {isClient &&
            filteredDiscoveredWallets.map((wallet) => {
              const isThisWalletConnecting =
                connectingWallet === wallet.info.rdns;

              return (
                <Button
                  key={wallet.info.uuid}
                  variant="outline"
                  className="w-full h-14 justify-start gap-3 px-4 text-base font-medium bg-[hsl(var(--muted)/0.3)] border-border/50 hover:bg-[hsl(var(--muted)/0.5)] disabled:opacity-50"
                  onClick={() => handleEIP6963Connect(wallet)}
                  disabled={isConnecting}
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded overflow-hidden shrink-0 bg-[#6f84fe]">
                    {wallet.info.icon ? (
                      <Image
                        src={wallet.info.icon}
                        alt={wallet.info.name}
                        width={28}
                        height={28}
                        className="w-[85%] h-[85%] object-contain"
                        unoptimized={wallet.info.icon.startsWith('data:')}
                      />
                    ) : (
                      <Wallet className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <span>
                    {isThisWalletConnecting
                      ? 'Connecting...'
                      : wallet.info.name}
                  </span>
                </Button>
              );
            })}

          {/* Discovering indicator */}
          {isClient &&
            isDiscovering &&
            filteredDiscoveredWallets.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-1">
                Detecting wallets...
              </p>
            )}

          {/* Always-available options: WalletConnect */}
          {isClient && (
            <Button
              variant="outline"
              className="w-full h-14 justify-start gap-3 px-4 text-base font-medium bg-[hsl(var(--muted)/0.3)] border-border/50 hover:bg-[hsl(var(--muted)/0.5)] disabled:opacity-50"
              onClick={handleWalletConnectClick}
              disabled={isConnecting}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded overflow-hidden shrink-0">
                <Image
                  src={WALLET_ICONS.walletConnect}
                  alt="WalletConnect"
                  width={28}
                  height={28}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <span>
                {connectingWallet === 'walletconnect'
                  ? 'Connecting...'
                  : 'WalletConnect'}
              </span>
            </Button>
          )}

          {/* Always-available options: OKX Wallet */}
          {isClient && (
            <Button
              variant="outline"
              className="w-full h-14 justify-start gap-3 px-4 text-base font-medium bg-[hsl(var(--muted)/0.3)] border-border/50 hover:bg-[hsl(var(--muted)/0.5)] disabled:opacity-50"
              onClick={handleOKXClick}
              disabled={isConnecting}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded overflow-hidden shrink-0">
                <Image
                  src={WALLET_ICONS.okx}
                  alt="OKX Wallet"
                  width={28}
                  height={28}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <span>
                {connectingWallet === 'okx' ? 'Connecting...' : 'OKX Wallet'}
              </span>
            </Button>
          )}

          {/* Always-available options: Coinbase Wallet */}
          {isClient && (
            <Button
              variant="outline"
              className="w-full h-14 justify-start gap-3 px-4 text-base font-medium bg-[hsl(var(--muted)/0.3)] border-border/50 hover:bg-[hsl(var(--muted)/0.5)] disabled:opacity-50"
              onClick={handleCoinbaseClick}
              disabled={isConnecting}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded overflow-hidden shrink-0">
                <Image
                  src={WALLET_ICONS.coinbase}
                  alt="Coinbase Wallet"
                  width={28}
                  height={28}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <span>
                {connectingWallet === 'coinbase'
                  ? 'Connecting...'
                  : 'Coinbase Wallet'}
              </span>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
