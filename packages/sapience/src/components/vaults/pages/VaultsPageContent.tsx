'use client';

import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { passiveLiquidityVault } from '@sapience/sdk/contracts';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { Card, CardContent } from '@sapience/sdk/ui/components/ui/card';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/sdk/ui/components/ui/tabs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConnectOrCreateWallet } from '@privy-io/react-auth';
import { parseUnits } from 'viem';
import { useAccount } from 'wagmi';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { usePassiveLiquidityVault } from '~/hooks/contract/usePassiveLiquidityVault';

const VaultsPageContent = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { isConnected } = useAccount();
  const { connectOrCreateWallet } = useConnectOrCreateWallet({});
  // Constants for vault integration
  const VAULT_CHAIN_ID = DEFAULT_CHAIN_ID; // default chain
  const VAULT_ADDRESS = passiveLiquidityVault[DEFAULT_CHAIN_ID]?.address;

  // Vaults are always enabled

  // Vault integration
  const {
    vaultData,
    userData,
    depositRequest: _depositRequest,
    withdrawalRequest: _withdrawalRequest,
    pendingRequest,
    userAssetBalance,
    assetDecimals,
    isLoadingUserData: _isLoadingUserData,
    isVaultPending,
    deposit,
    requestWithdrawal,
    cancelDeposit,
    cancelWithdrawal,
    formatAssetAmount,
    formatSharesAmount,
    minDeposit,
    allowance,
    pricePerShare,
    vaultManager: _vaultManager,
    quoteSignatureValid,
    expirationTime,
    interactionDelay,
    interactionDelayRemainingSec: _interactionDelayRemainingSec,
    isInteractionDelayActive,
    lastInteractionAt,
  } = usePassiveLiquidityVault({
    vaultAddress: VAULT_ADDRESS,
    chainId: VAULT_CHAIN_ID,
  });

  // Form state
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [pendingAction, setPendingAction] = useState<
    'deposit' | 'withdraw' | 'cancelDeposit' | 'cancelWithdrawal' | undefined
  >(undefined);
  // No slippage; we rely on manager-provided decimal pricePerShare quote

  // Derived validation
  const depositWei =
    depositAmount && assetDecimals !== undefined
      ? (() => {
          try {
            return parseUnits(depositAmount, assetDecimals);
          } catch {
            return 0n;
          }
        })()
      : 0n;
  const belowMinDeposit =
    (minDeposit ?? 0n) > 0n &&
    (depositWei === 0n || depositWei < (minDeposit ?? 0n));
  const requiresApproval = depositWei > 0n && (allowance ?? 0n) < depositWei;

  // UI helpers
  const shortWalletBalance = (() => {
    try {
      const num = Number(
        userAssetBalance ? formatAssetAmount(userAssetBalance) : '0'
      );
      if (Number.isFinite(num)) return num.toFixed(2);
      return '0.00';
    } catch {
      return '0.00';
    }
  })();

  const _pendingWithdrawalDisplay = (() => {
    const pending = userData?.pendingWithdrawal ?? 0n;
    if (pending <= 0n) return null;
    try {
      const num = Number(formatAssetAmount(pending));
      if (!Number.isFinite(num)) return null;
      return num.toFixed(2);
    } catch {
      return null;
    }
  })();

  const _pendingDepositDisplay = (() => {
    const pending = userData?.pendingDeposit ?? 0n;
    if (pending <= 0n) return null;
    try {
      const num = Number(formatAssetAmount(pending));
      if (!Number.isFinite(num)) return null;
      return num.toFixed(2);
    } catch {
      return null;
    }
  })();

  const depositQueuePosition = (() => {
    const index = userData?.depositIndex ?? 0n;
    if (index <= 0n) return null;
    try {
      const num = Number(index);
      if (!Number.isFinite(num)) return null;
      return num;
    } catch {
      return null;
    }
  })();

  // Removed withdrawal delay header display; keep minimal derived UI state only

  // Prefill deposit with minimum amount once when available
  const didPrefillMinRef = useRef(false);
  useEffect(() => {
    if (didPrefillMinRef.current) return;
    if (!assetDecimals) return;
    const min = minDeposit ?? 0n;
    if (min <= 0n) return;
    try {
      const currentWei = depositAmount
        ? (() => {
            try {
              return parseUnits(depositAmount, assetDecimals);
            } catch {
              return 0n;
            }
          })()
        : 0n;
      if (!depositAmount || currentWei < min) {
        setDepositAmount(formatAssetAmount(min));
        didPrefillMinRef.current = true;
      }
    } catch {
      /* noop */
    }
  }, [assetDecimals, minDeposit, depositAmount, formatAssetAmount]);

  useEffect(() => {
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[VaultPage] inputs', {
          VAULT_CHAIN_ID,
          VAULT_ADDRESS,
        });
      }
    } catch {
      /* noop */
    }
  }, []);

  // Quotes: estimated shares/assets and minimum thresholds with slippage
  const estDepositShares = useMemo(() => {
    if (!depositAmount || !assetDecimals) return 0n;
    try {
      const amountWei = parseUnits(depositAmount, assetDecimals);
      const ppsScaled = parseUnits(
        pricePerShare && pricePerShare !== '0' ? pricePerShare : '1',
        assetDecimals
      );
      return ppsScaled === 0n
        ? 0n
        : (amountWei * 10n ** BigInt(assetDecimals)) / ppsScaled;
    } catch {
      return 0n;
    }
  }, [depositAmount, assetDecimals, pricePerShare]);

  const estWithdrawAssets = useMemo(() => {
    if (!withdrawAmount || !assetDecimals) return 0n;
    try {
      const sharesWei = parseUnits(withdrawAmount, assetDecimals);
      const ppsScaled = parseUnits(
        pricePerShare && pricePerShare !== '0' ? pricePerShare : '1',
        assetDecimals
      );
      return (sharesWei * ppsScaled) / 10n ** BigInt(assetDecimals);
    } catch {
      return 0n;
    }
  }, [withdrawAmount, assetDecimals, pricePerShare]);

  const withdrawSharesWei = useMemo(() => {
    if (!withdrawAmount || !assetDecimals) return 0n;
    try {
      return parseUnits(withdrawAmount, assetDecimals);
    } catch {
      return 0n;
    }
  }, [withdrawAmount, assetDecimals]);

  const withdrawExceedsShareBalance = useMemo(() => {
    const balanceShares = userData?.balance ?? 0n;
    try {
      return withdrawSharesWei > balanceShares;
    } catch {
      return false;
    }
  }, [withdrawSharesWei, userData]);

  // Force light mode rendering for the iframe
  useEffect(() => {
    const handleIframeLoad = () => {
      const iframe = iframeRef.current;
      // Guard already exists here, but keeping it doesn't hurt
      if (typeof document === 'undefined') return;
      if (iframe && iframe.contentDocument) {
        try {
          // Try to inject a style element to force light mode
          const style = iframe.contentDocument.createElement('style');
          style.textContent =
            'html { color-scheme: light !important; } * { filter: none !important; }';
          iframe.contentDocument.head.appendChild(style);
        } catch (e) {
          // Security policy might prevent this
          console.error('Could not inject styles into iframe:', e);
        }
      }
    };

    const iframe = iframeRef.current;
    if (iframe) {
      // Ensure load event listener is attached only once iframe exists
      iframe.addEventListener('load', handleIframeLoad);
      // Clean up listener on unmount
      return () => iframe.removeEventListener('load', handleIframeLoad);
    }
  }, []); // Empty dependency array ensures this runs once client-side

  // Live cooldown countdown (HH:MM:SS)
  const [cooldownDisplay, setCooldownDisplay] = useState<string>('');
  useEffect(() => {
    if (!isInteractionDelayActive) {
      setCooldownDisplay('');
      return;
    }

    const compute = () => {
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        const target = Number(lastInteractionAt + interactionDelay);
        const remaining = Math.max(0, target - nowSec);
        const totalHours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        const hourLabel = totalHours === 1 ? 'hour' : 'hours';
        const minuteLabel = minutes === 1 ? 'minute' : 'minutes';
        const secondLabel = seconds === 1 ? 'second' : 'seconds';
        setCooldownDisplay(
          `${totalHours} ${hourLabel}, ${minutes} ${minuteLabel}, and ${seconds} ${secondLabel}`
        );
      } catch {
        setCooldownDisplay('');
      }
    };

    compute();
    const id = window.setInterval(compute, 1000);
    return () => window.clearInterval(id);
  }, [isInteractionDelayActive, lastInteractionAt, interactionDelay]);

  const renderVaultForm = () => (
    <Tabs defaultValue="deposit" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="deposit">Deposit</TabsTrigger>
        <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
      </TabsList>

      <TabsContent value="deposit" className="space-y-2 mt-1">
        {/* Amount Input */}
        <div className="space-y-0.5">
          <div className="border border-input bg-background rounded-md px-3 py-3">
            <div className="flex items-center justify-between mb-0">
              <Input
                placeholder="0.0"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="text-lg bg-transparent border-none p-0 h-auto font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <div className="flex items-center gap-2">
                <span className="text-lg text-muted-foreground">testUSDe</span>
              </div>
            </div>
          </div>
        </div>

        {/* Balance and Requested row (outside input box) */}
        <div className="flex items-center justify-between text-sm text-muted-foreground py-0">
          <div className="flex items-center gap-2">
            <span>
              Balance: <NumberDisplay value={Number(shortWalletBalance)} />{' '}
              testUSDe
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setDepositAmount(shortWalletBalance)}
            >
              MAX
            </Button>
          </div>
          {depositAmount &&
          estDepositShares > 0n &&
          ((minDeposit ?? 0n) === 0n || depositWei >= (minDeposit ?? 0n)) ? (
            <div className="text-right">
              Requested Shares: {formatSharesAmount(estDepositShares)} sapLP
            </div>
          ) : (
            (minDeposit ?? 0n) > 0n && (
              <div className="text-right">
                Minimum Deposit: {formatAssetAmount(minDeposit ?? 0n)} testUSDe
              </div>
            )
          )}
        </div>

        {/* Cooldown + Deposit Button Group */}
        <div className="space-y-2 pt-3 md:pt-4">
          {isInteractionDelayActive && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300 mb-2">
              This vault implements a cooldown period. Please wait{' '}
              {cooldownDisplay} before submitting another request.
            </div>
          )}

          {/* Deposit Button */}
          <Button
            size="lg"
            className="w-full text-base"
            disabled={
              !depositAmount ||
              isVaultPending ||
              !!vaultData?.paused ||
              belowMinDeposit ||
              !pricePerShare ||
              pricePerShare === '0' ||
              isInteractionDelayActive ||
              !!(pendingRequest && !pendingRequest.processed)
            }
            onClick={async () => {
              if (!isConnected) {
                try {
                  await Promise.resolve(connectOrCreateWallet?.());
                } catch {
                  // ignore wallet connect errors
                }
                return;
              }
              setPendingAction('deposit');
              await deposit(depositAmount, VAULT_CHAIN_ID);
              setDepositAmount('');
              setPendingAction(undefined);
            }}
          >
            {pendingRequest && !pendingRequest.processed
              ? 'Request Pending'
              : isVaultPending && pendingAction === 'deposit'
                ? 'Processing...'
                : vaultData?.paused
                  ? 'Vault Paused'
                  : isInteractionDelayActive
                    ? 'Cooldown in progress'
                    : quoteSignatureValid === false
                      ? 'Waiting for Price Quote'
                      : !pricePerShare || pricePerShare === '0'
                        ? 'No Price Available'
                        : requiresApproval
                          ? 'Approve & Deposit'
                          : 'Submit Deposit'}
          </Button>
        </div>

        {/* Consolidated pending section rendered below tabs */}
      </TabsContent>

      <TabsContent value="withdraw" className="space-y-2 mt-1">
        {/* Amount Input */}
        <div className="space-y-0.5">
          <div className="border border-input bg-background rounded-md px-3 py-3">
            <div className="flex items-center justify-between mb-0">
              <Input
                placeholder="0.0"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="text-lg bg-transparent border-none p-0 h-auto font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <div className="flex items-center gap-2">
                <span className="text-lg text-muted-foreground">sapLP</span>
              </div>
            </div>
          </div>
        </div>

        {/* Balance and Requested row (outside input box) */}
        <div className="flex items-center justify-between text-sm text-muted-foreground py-0">
          <div className="flex items-center gap-2">
            <span>
              Balance:{' '}
              {userData ? formatSharesAmount(userData?.balance ?? 0n) : '0'}{' '}
              sapLP
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() =>
                setWithdrawAmount(
                  userData ? formatSharesAmount(userData?.balance ?? 0n) : '0'
                )
              }
            >
              MAX
            </Button>
          </div>
          {withdrawAmount &&
            estWithdrawAssets > 0n &&
            !withdrawExceedsShareBalance && (
              <div className="text-right">
                Requested Collateral: {formatAssetAmount(estWithdrawAssets)}{' '}
                testUSDe
              </div>
            )}
        </div>

        {/* Cooldown + Withdraw Button Group */}
        <div className="space-y-2 pt-3 md:pt-4">
          {isInteractionDelayActive && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300 mb-2">
              This vault implements a cooldown period. Please wait{' '}
              {cooldownDisplay} before submitting another request.
            </div>
          )}

          {/* Withdraw Button */}
          <Button
            size="lg"
            className="w-full text-base"
            disabled={
              !withdrawAmount ||
              isVaultPending ||
              !!vaultData?.paused ||
              !pricePerShare ||
              pricePerShare === '0' ||
              isInteractionDelayActive ||
              !!(pendingRequest && !pendingRequest.processed) ||
              withdrawExceedsShareBalance
            }
            onClick={async () => {
              if (!isConnected) {
                try {
                  await Promise.resolve(connectOrCreateWallet?.());
                } catch {
                  // ignore wallet connect errors
                }
                return;
              }
              setPendingAction('withdraw');
              await requestWithdrawal(withdrawAmount, VAULT_CHAIN_ID);
              setPendingAction(undefined);
            }}
          >
            {pendingRequest && !pendingRequest.processed
              ? 'Request Pending'
              : isVaultPending && pendingAction === 'withdraw'
                ? 'Processing...'
                : vaultData?.paused
                  ? 'Vault Paused'
                  : withdrawExceedsShareBalance
                    ? 'Insufficient Balance'
                    : isInteractionDelayActive
                      ? 'Cooldown in progress'
                      : !pricePerShare || pricePerShare === '0'
                        ? 'No Price Available'
                        : 'Request Withdrawal'}
          </Button>
        </div>

        {/* Consolidated pending section rendered below tabs */}
      </TabsContent>
    </Tabs>
  );

  // Number formatting helpers (no decimals, thousands separators)
  const roundToIntString = (value: string): string => {
    try {
      const trimmed = value.trim();
      if (!trimmed) return '0';
      const neg = trimmed.startsWith('-');
      const t = neg ? trimmed.slice(1) : trimmed;
      const [intRaw, fracRaw = ''] = t.split('.');
      const intPart = intRaw.replace(/^\D+/, '') || '0';
      const frac = fracRaw.replace(/\D+/g, '');
      const shouldRoundUp = frac.length > 0 && Number(frac[0]) >= 5;
      if (!shouldRoundUp) {
        return (neg ? '-' : '') + (intPart || '0');
      }
      // add 1 to intPart
      let carry = 1;
      let res = '';
      for (let i = intPart.length - 1; i >= 0; i--) {
        const code = intPart.charCodeAt(i);
        const isDigit = code >= 48 && code <= 57;
        const digit = (isDigit ? code - 48 : 0) + carry;
        if (digit >= 10) {
          res = String(digit - 10) + res;
          carry = 1;
        } else {
          res = String(digit) + res;
          carry = 0;
        }
      }
      if (carry) res = '1' + res;
      return (neg ? '-' : '') + res;
    } catch {
      return '0';
    }
  };

  const formatIntWithCommas = (intStr: string): string => {
    try {
      const neg = intStr.startsWith('-');
      const digits =
        (neg ? intStr.slice(1) : intStr).replace(/\D+/g, '') || '0';
      const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return (neg ? '-' : '') + withCommas;
    } catch {
      return '0';
    }
  };

  const formatWholeWithCommasFromAmount = (amountStr: string): string => {
    return formatIntWithCommas(roundToIntString(amountStr));
  };

  // Derived vault metrics for display
  const tvlWei = useMemo(() => {
    try {
      const totalAssetsWei = vaultData?.totalAssets ?? 0n;
      if (totalAssetsWei > 0n) return totalAssetsWei;

      // Fallback: derive TVL from totalSupply * pricePerShare when assets aren't populated
      if (
        vaultData?.totalSupply &&
        pricePerShare &&
        pricePerShare !== '0' &&
        assetDecimals !== undefined
      ) {
        try {
          const ppsScaled = parseUnits(pricePerShare, assetDecimals);
          return (
            (vaultData.totalSupply * ppsScaled) / 10n ** BigInt(assetDecimals)
          );
        } catch {
          // ignore fallback errors and return 0n below
        }
      }

      return 0n;
    } catch {
      return 0n;
    }
  }, [vaultData, pricePerShare, assetDecimals]);

  const deployedWei = useMemo(() => {
    try {
      return vaultData?.totalDeployed ?? 0n;
    } catch {
      return 0n;
    }
  }, [vaultData]);

  const utilizationPercent = useMemo(() => {
    try {
      // Primary: on-chain utilization rate in basis points
      if (vaultData?.utilizationRate !== undefined) {
        const pct = Number(vaultData.utilizationRate) / 100; // bps -> percent
        if (!Number.isFinite(pct)) return 0;
        return Math.max(0, Math.min(100, pct));
      }
      // Fallback: compute from deployed/total
      if (tvlWei > 0n) {
        const bps = Number((deployedWei * 10000n) / tvlWei);
        const pct = bps / 100;
        if (!Number.isFinite(pct)) return 0;
        return Math.max(0, Math.min(100, pct));
      }
      return 0;
    } catch {
      return 0;
    }
  }, [vaultData, tvlWei, deployedWei]);

  // Preformatted display strings
  const tvlDisplay = useMemo(() => {
    try {
      return formatWholeWithCommasFromAmount(formatAssetAmount(tvlWei));
    } catch {
      return '0';
    }
  }, [tvlWei, formatAssetAmount]);

  const deployedDisplay = useMemo(() => {
    try {
      return formatWholeWithCommasFromAmount(formatAssetAmount(deployedWei));
    } catch {
      return '0';
    }
  }, [deployedWei, formatAssetAmount]);

  const utilizationDisplay = useMemo(() => {
    try {
      return `${Math.round(utilizationPercent)}%`;
    } catch {
      return '0%';
    }
  }, [utilizationPercent]);

  return (
    <div className="relative min-h-screen">
      {/* Spline Background - Full Width */}
      <div className="absolute inset-0 pointer-events-none top-0 left-0 w-full h-100dvh -scale-y-100 -translate-y-1/4 opacity-50 dark:opacity-75">
        <iframe
          ref={iframeRef}
          src="https://my.spline.design/particlesfutarchy-SDhuN0OYiCRHRPt2fFec4bCm/"
          className="w-full h-full"
          style={{
            opacity: 0.5,
            border: 'none',
            colorScheme: 'light',
            filter: 'none',
          }}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
        />
        <div className="absolute top-0 left-0 h-full w-[100px] bg-gradient-to-r from-background to-transparent hidden md:block" />
      </div>

      {/* Main Content */}
      <div className="container max-w-[600px] mx-auto px-4 pt-32 pb-12 relative z-10">
        <div className="mb-5 md:mb-10 flex items-center justify-between">
          <h1 className="text-3xl md:text-5xl font-heading font-normal">
            Vaults
          </h1>
          {/* Deploy Vault action hidden until implementation is available */}
        </div>

        <div className="grid grid-cols-1 gap-8">
          {/* Vault */}
          <div>
            <Card className="relative isolate overflow-hidden bg-card border border-border rounded-xl shadow-sm">
              <CardContent className="p-6">
                <div className="space-y-6">
                  {/* Vault Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-medium mb-1">
                        Protocol Vault
                      </h3>
                      <p className="text-muted-foreground text-lg">
                        This vault bids on parlays.
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">
                        Total Value Locked
                      </div>
                      <div className="text-2xl font-medium">
                        {tvlDisplay} testUSDe
                      </div>
                    </div>
                  </div>

                  {/* Vault Stats */}
                  <div className="space-y-4">
                    {/* Utilization Block */}
                    <div className="p-5 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-normal">
                          Utilization Rate: {utilizationDisplay}
                        </div>
                        <div className="text-sm font-normal">
                          Deployed: {deployedDisplay} testUSDe
                        </div>
                      </div>
                      <div className="w-full h-4 rounded-sm bg-muted/60 overflow-hidden shadow-inner">
                        <div
                          className="h-4 bg-primary rounded-sm transition-all"
                          style={{ width: `${utilizationPercent}%` }}
                        />
                      </div>
                    </div>
                    {/* APY Row intentionally omitted until calculation available */}
                  </div>

                  {/* Deposit/Withdraw Tabs */}
                  {renderVaultForm()}

                  {/* Pending Requests (mapping-based) */}
                  {pendingRequest && !pendingRequest.processed && (
                    <div className="mt-4 space-y-2">
                      <div className="p-3 bg-muted/30 border border-border rounded-md">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm text-muted-foreground">
                            <p className="font-medium">
                              {pendingRequest.isDeposit
                                ? 'Pending Deposit'
                                : 'Pending Withdrawal'}
                            </p>
                            <p className="text-xs">
                              {pendingRequest.isDeposit ? (
                                <>
                                  {formatAssetAmount(pendingRequest.assets)}{' '}
                                  testUSDe
                                  {depositQueuePosition
                                    ? ` · Queue #${depositQueuePosition}`
                                    : ''}
                                </>
                              ) : (
                                <>
                                  {formatSharesAmount(pendingRequest.shares)}{' '}
                                  sapLP
                                </>
                              )}
                            </p>
                          </div>
                          {pendingRequest.isDeposit ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                Date.now() >=
                                (Number(pendingRequest.timestamp) +
                                  Number(expirationTime ?? 0n)) *
                                  1000
                              }
                              onClick={async () => {
                                setPendingAction('cancelDeposit');
                                await cancelDeposit(VAULT_CHAIN_ID);
                                setPendingAction(undefined);
                              }}
                            >
                              {isVaultPending &&
                              pendingAction === 'cancelDeposit'
                                ? 'Processing...'
                                : 'Cancel'}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                Date.now() >=
                                (Number(pendingRequest.timestamp) +
                                  Number(expirationTime ?? 0n)) *
                                  1000
                              }
                              onClick={async () => {
                                setPendingAction('cancelWithdrawal');
                                await cancelWithdrawal(VAULT_CHAIN_ID);
                                setPendingAction(undefined);
                              }}
                            >
                              {isVaultPending &&
                              pendingAction === 'cancelWithdrawal'
                                ? 'Processing...'
                                : 'Cancel'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VaultsPageContent;
