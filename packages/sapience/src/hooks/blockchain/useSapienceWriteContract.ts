'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { useTransactionReceipt } from 'wagmi';
import {
  useWriteContract,
  useSendCalls,
  useConnectorClient,
  useAccount,
  useReadContract,
} from 'wagmi';
import type { Hash } from 'viem';
import { encodeFunctionData, parseAbi } from 'viem';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';

import { useToast } from '@sapience/sdk/ui/hooks/use-toast';
import { waitForCallsStatus } from 'viem/actions';
import { handleViemError } from '~/utils/blockchain/handleViemError';
import { useChainValidation } from '~/hooks/blockchain/useChainValidation';
import { useMonitorTxStatus } from '~/hooks/blockchain/useMonitorTxStatus';

// Ethereal chain configuration
const CHAIN_ID_ETHEREAL = 5064014;
const WUSDE_ADDRESS = '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';

// WUSDe ABI for wrapping/unwrapping operations
const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function balanceOf(address account) view returns (uint256)',
]);

interface ShareIntentOg {
  imagePath: string;
  params?: Record<string, string | number | boolean | null | undefined>;
}

interface ShareIntentPartial {
  positionId?: string | number;
  og?: ShareIntentOg;
  // Additional optional hints can be added over time
}

interface useSapienceWriteContractProps {
  onSuccess?: (
    receipt: ReturnType<typeof useTransactionReceipt>['data']
  ) => void;
  onError?: (error: Error) => void;
  onTxHash?: (txHash: Hash) => void;
  successMessage?: string;
  fallbackErrorMessage?: string;
  redirectProfileAnchor?: 'trades' | 'parlays' | 'lp' | 'forecasts';
  /**
   * Optional share intent hints. When provided, a durable record will be written
   * to sessionStorage as soon as a tx hash is known (or immediately if not available),
   * before redirecting to the profile page. This enables the profile page to
   * automatically open a share dialog with the correct OG image.
   */
  shareIntent?: ShareIntentPartial;
}

export function useSapienceWriteContract({
  onSuccess,
  onError,
  onTxHash,
  successMessage,
  fallbackErrorMessage = 'Transaction failed',
  redirectProfileAnchor,
  shareIntent,
}: useSapienceWriteContractProps) {
  const { data: client } = useConnectorClient();
  const [txHash, setTxHash] = useState<Hash | undefined>(undefined);
  const { toast } = useToast();
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { wallets } = useWallets();
  const { user, login } = usePrivy();
  const { address: wagmiAddress } = useAccount();
  const router = useRouter();
  const didRedirectRef = useRef(false);
  const didShowSuccessToastRef = useRef(false);
  const embeddedWallet = useMemo(() => {
    const match = wallets?.find(
      (wallet: any) => wallet?.walletClientType === 'privy'
    );
    return match;
  }, [wallets]);
  const isEmbeddedWallet = Boolean(embeddedWallet);

  // Helper to check if we're on Ethereal chain
  const isEtherealChain = useCallback((chainId: number) => {
    return chainId === CHAIN_ID_ETHEREAL;
  }, []);

  // Helper to create WUSDe wrap transaction for Ethereal chain
  const createWrapTransaction = useCallback((amount: bigint) => {
    return {
      to: WUSDE_ADDRESS as `0x${string}`,
      data: encodeFunctionData({
        abi: WUSDE_ABI,
        functionName: 'deposit',
      }),
      value: amount,
    };
  }, []);

  // Helper to create WUSDe unwrap transaction for Ethereal chain
  const createUnwrapTransaction = useCallback((amount: bigint) => {
    return {
      to: WUSDE_ADDRESS as `0x${string}`,
      data: encodeFunctionData({
        abi: WUSDE_ABI,
        functionName: 'withdraw',
        args: [amount],
      }),
      value: 0n,
    };
  }, []);

  // Helper to get user's WUSDe balance
  const getUserWUSDEBalance = useCallback(async () => {
    if (!client || !wagmiAddress || !isEtherealChain(chainId || 0)) {
      return 0n;
    }
    
    try {
      const balance = await client.readContract({
        address: WUSDE_ADDRESS,
        abi: WUSDE_ABI,
        functionName: 'balanceOf',
        args: [wagmiAddress],
      });
      return balance as bigint;
    } catch (error) {
      console.error('Failed to get WUSDe balance:', error);
      return 0n;
    }
  }, [client, wagmiAddress, chainId]);

  // Write durable share intent to sessionStorage
  const writeShareIntent = useCallback(
    (maybeHash?: string) => {
      try {
        if (typeof window === 'undefined') return;
        if (!redirectProfileAnchor) return;
        if (shareIntent === undefined) return; // only write when caller explicitly opts-in

        const connectedAddress = (
          wagmiAddress ||
          (wallets?.[0] as any)?.address ||
          ''
        )
          .toString()
          .toLowerCase();
        if (!connectedAddress) return;

        // Check for temporary trade data stored by Betslip or trade forms
        let tempTradeData = null;
        if (redirectProfileAnchor === 'trades') {
          try {
            const tempData = window.sessionStorage.getItem(
              'sapience:trade-data-temp'
            );
            if (tempData) {
              tempTradeData = JSON.parse(tempData);
              window.sessionStorage.removeItem('sapience:trade-data-temp');
            }
          } catch {
            // ignore
          }
        }

        // Check for temporary LP data stored by LP forms
        let tempLpData = null;
        if (redirectProfileAnchor === 'lp') {
          try {
            const tempData = window.sessionStorage.getItem(
              'sapience:lp-data-temp'
            );
            if (tempData) {
              tempLpData = JSON.parse(tempData);
              window.sessionStorage.removeItem('sapience:lp-data-temp');
            }
          } catch {
            // ignore
          }
        }

        const intent = {
          address: connectedAddress,
          anchor: redirectProfileAnchor,
          clientTimestamp: Date.now(),
          txHash: maybeHash || undefined,
          // Spread all shareIntent properties to allow custom data like tradeData
          ...shareIntent,
          // Add temporary trade data if available
          ...(tempTradeData ? { tradeData: tempTradeData } : {}),
          // Add temporary LP data if available
          ...(tempLpData ? { lpData: tempLpData } : {}),
        } as Record<string, any>;

        window.sessionStorage.setItem(
          'sapience:share-intent',
          JSON.stringify(intent)
        );
      } catch (e) {
        // best-effort only
        console.error(e);
      }
    },
    [redirectProfileAnchor, shareIntent, wagmiAddress, wallets]
  );

  // Helper to detect if this is a withdrawal operation that should trigger unwrapping
  const shouldAutoUnwrap = useCallback((functionName: string) => {
    if (!isEtherealChain(chainId || 0)) {
      return false;
    }
    
    // Common withdrawal/redeem function names that should trigger unwrapping
    const withdrawalFunctions = [
      'withdraw',
      'redeem', 
      'redeemCollateral',
      'exitPosition',
      'closeTrade',
      'removeLP',
      'removeLiquidity',
      'unstake',
      'claimRewards',
      // Additional patterns found in codebase
      'settlePosition',  // Settling/closing positions
      'decreaseLiquidity',  // Reducing LP positions
      'cancelWithdrawal',  // Canceling withdrawals (funds return to user)
      'cancelDeposit',  // Canceling deposits (funds return to user)
      'burn',  // Burning prediction NFTs for payout
      'processWithdrawals'  // Processing withdrawal queue
    ];
    
    // Special case: modifyTraderPosition with size 0 is a full close
    // (we can't detect this here without args, but it's worth noting)
    
    return withdrawalFunctions.some(fn => 
      functionName.toLowerCase().includes(fn.toLowerCase())
    );
  }, [chainId]);

  // Helper to execute auto-unwrap after main transaction
  const executeAutoUnwrap = useCallback(async (balanceBefore: bigint) => {
    // Get the current balance after transaction
    const balanceAfter = await getUserWUSDEBalance();
    
    // Calculate how much WUSDe was received
    const received = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0n;
    
    if (received <= 0n) {
      return null; // No new WUSDe to unwrap
    }

    // Only unwrap the amount received from this transaction
    const unwrapTx = createUnwrapTransaction(received);
    return unwrapTx;
  }, [getUserWUSDEBalance, createUnwrapTransaction]);

  const maybeRedirectToProfile = useCallback(() => {
    if (!redirectProfileAnchor) return; // Opt-in only
    if (didRedirectRef.current) return; // Guard against double navigation
    if (typeof window === 'undefined') return; // SSR safety

    try {
      const connectedAddress = wagmiAddress || (wallets?.[0] as any)?.address;
      if (!connectedAddress) return; // No address available yet
      const addressLower = String(connectedAddress).toLowerCase();
      didRedirectRef.current = true;
      const redirectUrl = `/profile/${addressLower}#${redirectProfileAnchor}`;
      router.push(redirectUrl);
    } catch (e) {
      console.error(e);
      // noop on navigation errors
    }
  }, [redirectProfileAnchor, wallets, wagmiAddress, router]);

  // Common success handler
  const handleTransactionSuccess = useCallback((hash?: Hash) => {
    if (hash) {
      writeShareIntent(hash);
      onTxHash?.(hash);
      setTxHash(hash);
    } else {
      writeShareIntent(undefined);
      onSuccess?.(undefined as any);
    }
    
    maybeRedirectToProfile();
    
    try {
      toast({
        title: successTitle,
        description: formatSuccessDescription(successMessage),
        duration: 5000,
      });
      didShowSuccessToastRef.current = true;
    } catch (e) {
      console.error(e);
    }
    
    setIsSubmitting(false);
  }, [writeShareIntent, onTxHash, setTxHash, onSuccess, maybeRedirectToProfile, toast, successMessage]);

  // Execute unwrap for embedded wallets
  const executeEmbeddedUnwrap = useCallback(async (walletId: string, chainId: number, balanceBefore: bigint) => {
    try {
      const unwrapTx = await executeAutoUnwrap(balanceBefore);
      if (unwrapTx) {
        const response = await fetch('/api/privy/send-calls', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            walletId,
            chainId,
            to: unwrapTx.to,
            data: unwrapTx.data,
            value: unwrapTx.value,
            sponsor: true,
          }),
        });
        if (response.ok) {
          console.log('Auto-unwrap completed successfully');
        }
      }
    } catch (error) {
      console.error('Auto-unwrap failed:', error);
    }
  }, [executeAutoUnwrap]);

  const ensureEmbeddedAuth = useCallback(async () => {
    if (!isEmbeddedWallet) return true;
    if (user?.wallet?.id) return true;
    try {
      if (!login) return false;
      await Promise.resolve(login());
      return Boolean(user?.wallet?.id);
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [isEmbeddedWallet, login, user?.wallet?.id]);

  // Unified success toast formatting
  const successTitle = 'Transaction successfully submitted.';
  const successSuffixNote =
    'It may take a few moments for the transaction to be processed and reflected in the app.';
  const formatSuccessDescription = (message?: string) =>
    message && message.length > 0
      ? `${message}\n\n${successSuffixNote}`
      : successSuffixNote;

  // Chain validation
  const { validateAndSwitchChain } = useChainValidation({
    onError: (errorMessage) => {
      toast({
        title: 'Chain Validation Failed',
        description: errorMessage,
        duration: 5000,
        variant: 'destructive',
      });
    },
  });

  // Wagmi write contract hook (async usage; we handle promise resolution ourselves)
  const {
    writeContractAsync,
    isPending: isWritingContract,
    reset: resetWrite,
  } = useWriteContract();

  // Wagmi send calls hook (async usage; we handle promise resolution ourselves)
  const {
    sendCallsAsync,
    isPending: isSendingCalls,
    reset: resetCalls,
  } = useSendCalls();


  // Execute unwrap for non-embedded wallets
  const executeNonEmbeddedUnwrap = useCallback((chainId: number, balanceBefore: bigint) => {
    setTimeout(async () => {
      try {
        const unwrapTx = await executeAutoUnwrap(balanceBefore);
        if (unwrapTx) {
          await sendCallsAsync({
            chainId,
            calls: [unwrapTx],
            experimental_fallback: true,
          });
          console.log('Auto-unwrap completed successfully');
        }
      } catch (error) {
        console.error('Auto-unwrap failed:', error);
      }
    }, 2000);
  }, [executeAutoUnwrap, sendCallsAsync]);

  // Custom write contract function that handles chain validation
  const sapienceWriteContract = useCallback(
    async (...args: Parameters<typeof writeContractAsync>) => {
      const _chainId = args[0].chainId;
      if (!_chainId) {
        throw new Error('Chain ID is required');
      }
      setChainId(_chainId);

      try {
        // Reset state
        setTxHash(undefined);
        resetWrite();
        didRedirectRef.current = false;
        didShowSuccessToastRef.current = false;

        // Validate and switch chain if needed
        await validateAndSwitchChain(_chainId);

        // If using an embedded wallet, route via backend sponsorship endpoint as a single-call batch
        if (isEmbeddedWallet) {
          setIsSubmitting(true);
          const params = args[0];
          const {
            address,
            abi,
            functionName,
            args: fnArgs,
            value,
          } = params as any;

          // Handle WUSDe wrapping on Ethereal chain
          const callsToExecute: Array<{
            to: `0x${string}`;
            data: string;
            value: bigint;
          }> = [];

          if (isEtherealChain(_chainId)) {
            if (value && BigInt(value) > 0n) {
              // On Ethereal, if there's a value (USDe), we need to wrap it first
              const wrapTx = createWrapTransaction(BigInt(value));
              callsToExecute.push({
                to: wrapTx.to,
                data: wrapTx.data,
                value: wrapTx.value,
              });
            }
          }

          // Add the main transaction
          const calldata = encodeFunctionData({
            abi,
            functionName,
            args: fnArgs,
          });
          callsToExecute.push({
            to: address,
            data: calldata,
            value: isEtherealChain(_chainId) ? '0x0' : (value ?? '0x0'), // No value on Ethereal since we wrapped
          });

          // Check if we need to add unwrapping based on the function being called
          const needsUnwrap = shouldAutoUnwrap(functionName);
          
          // Get balance before transaction if unwrapping might be needed
          let balanceBeforeTransaction = 0n;
          if (needsUnwrap && isEtherealChain(_chainId)) {
            balanceBeforeTransaction = await getUserWUSDEBalance();
          }

          const ok = await ensureEmbeddedAuth();
          const walletId = user?.wallet?.id;
          if (!ok || !walletId) {
            throw new Error('Authentication required. Please try again.');
          }
          // Execute calls sequentially (wrapping first, then main tx)
          let lastResult: any = undefined;
          for (const call of callsToExecute) {
            const response = await fetch('/api/privy/send-calls', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({
                walletId,
                chainId: Number(_chainId),
                to: call.to,
                data: call.data,
                value: call.value,
                sponsor: true,
              }),
            });
            if (!response.ok) {
              const errText = await response.text();
              // Minimal debug info to help diagnose missing fields during development
              if (
                typeof console !== 'undefined' &&
                typeof console.warn === 'function'
              ) {
                console.warn('[Privy send-calls] request body', {
                  walletId,
                  chainId: _chainId,
                  to: call.to,
                  hasData: Boolean(call.data),
                });
              }
              throw new Error(errText || 'Sponsored transaction request failed');
            }
            lastResult = await response.json();
          }
          const data = lastResult;
          const maybeHash: string | undefined =
            data?.receipts?.[0]?.transactionHash ||
            data?.transactionHash ||
            data?.txHash;
          
          handleTransactionSuccess(maybeHash as Hash);
          
          // Execute auto-unwrap if this was a withdrawal operation
          if (needsUnwrap) {
            await executeEmbeddedUnwrap(walletId, Number(_chainId), balanceBeforeTransaction);
          }
        } else {
          // For non-embedded wallets, use sendCalls if on Ethereal and wrapping is needed
          if (isEtherealChain(_chainId)) {
            const params = args[0];
            const { value } = params as any;
            
            if (value && BigInt(value) > 0n) {
              // Check if we need unwrapping for this operation
              const needsUnwrap = shouldAutoUnwrap((params as any).functionName, (params as any).address);
              
              // Get balance before transaction if unwrapping might be needed
              let balanceBeforeTransaction = 0n;
              if (needsUnwrap) {
                balanceBeforeTransaction = await getUserWUSDEBalance();
              }
              
              // Need to wrap USDe first, then execute main transaction
              const wrapTx = createWrapTransaction(BigInt(value));
              const mainCalldata = encodeFunctionData({
                abi: (params as any).abi,
                functionName: (params as any).functionName,
                args: (params as any).args,
              });
              
              const calls = [
                wrapTx,
                {
                  to: (params as any).address as `0x${string}`,
                  data: mainCalldata,
                  value: 0n, // No value for main tx since we wrapped
                },
              ];

              const result = await sendCallsAsync({
                chainId: _chainId,
                calls,
                experimental_fallback: true,
              });
              
              const transactionHash = result?.receipts?.[0]?.transactionHash || result?.transactionHash;
              handleTransactionSuccess(transactionHash);
              
              // Execute auto-unwrap if this is a withdrawal operation
              if (needsUnwrap) {
                executeNonEmbeddedUnwrap(_chainId, balanceBeforeTransaction);
              }
            } else {
              // No wrapping needed, check if unwrapping is needed
              const needsUnwrap = shouldAutoUnwrap((args[0] as any).functionName);
              
              // Get balance before transaction if unwrapping might be needed
              let balanceBeforeTransaction = 0n;
              if (needsUnwrap) {
                balanceBeforeTransaction = await getUserWUSDEBalance();
              }
              
              // Execute main transaction
              const hash = await writeContractAsync(...args);
              handleTransactionSuccess(hash);
              
              // Execute auto-unwrap if this is a withdrawal operation
              if (needsUnwrap) {
                await executeNonEmbeddedUnwrap(_chainId, balanceBeforeTransaction);
              }
            }
          } else {
            // Execute the transaction normally for non-Ethereal chains
            const hash = await writeContractAsync(...args);
            handleTransactionSuccess(hash);
          }
        }
      } catch (error) {
        setIsSubmitting(false);
        toast({
          title: 'Transaction Failed',
          description: handleViemError(error, fallbackErrorMessage),
          duration: 5000,
          variant: 'destructive',
        });
        onError?.(error as Error);
      }
    },
    [
      resetWrite,
      validateAndSwitchChain,
      writeContractAsync,
      isEmbeddedWallet,
      toast,
      fallbackErrorMessage,
      onError,
      user,
      shouldAutoUnwrap,
      executeEmbeddedUnwrap,
      executeNonEmbeddedUnwrap,
      handleTransactionSuccess,
      ensureEmbeddedAuth,
    ]
  );

  // Custom send calls function that handles chain validation
  const sapienceSendCalls = useCallback(
    async (...args: Parameters<typeof sendCallsAsync>) => {
      const _chainId = args[0].chainId;
      if (!_chainId) {
        throw new Error('Chain ID is required');
      }

      setChainId(_chainId);
      try {
        // Reset state
        setTxHash(undefined);
        resetCalls();
        didRedirectRef.current = false;
        didShowSuccessToastRef.current = false;

        // Validate and switch chain if needed
        await validateAndSwitchChain(_chainId);
        // Execute the batch calls
        const data = isEmbeddedWallet
          ? // Route via backend sponsorship endpoint for embedded wallets
            await (async () => {
              setIsSubmitting(true);
              const body = (args[0] as any) ?? {};
              const calls = Array.isArray(body?.calls) ? body.calls : [];
              let lastResult: any = undefined;
              const ok = await ensureEmbeddedAuth();
              const walletId = user?.wallet?.id;
              if (!ok || !walletId) {
                throw new Error('Authentication required. Please try again.');
              }
              // Execute each call sequentially as individual sponsored txs
              for (const call of calls) {
                const response = await fetch('/api/privy/send-calls', {
                  method: 'POST',
                  headers: {
                    'content-type': 'application/json',
                  },
                  credentials: 'include',
                  body: JSON.stringify({
                    walletId,
                    chainId: Number(_chainId),
                    to: call.to,
                    data: call.data,
                    value: call.value ?? '0x0',
                    sponsor: true,
                  }),
                });
                if (!response.ok) {
                  const errText = await response.text();
                  if (
                    typeof console !== 'undefined' &&
                    typeof console.warn === 'function'
                  ) {
                    console.warn('[Privy send-calls batch] request body', {
                      walletId,
                      chainId: _chainId,
                      to: call.to,
                      hasData: Boolean(call.data),
                    });
                  }
                  throw new Error(
                    errText || 'Sponsored transaction request failed'
                  );
                }
                lastResult = await response.json();
              }
              setIsSubmitting(false);
              return lastResult;
            })()
          : // Use wallet_sendCalls with fallback for non-embedded wallets
            await sendCallsAsync({
              ...(args[0] as any),
              experimental_fallback: true,
            });
        // If the wallet supports EIP-5792, we can poll for calls status using the returned id.
        // If it does not (fallback path), `waitForCallsStatus` may throw or `id` may be unusable.
        try {
          if (!isEmbeddedWallet && data?.id) {
            const result = await waitForCallsStatus(client!, { id: data.id });
            const transactionHash = result?.receipts?.[0]?.transactionHash;
            if (transactionHash) {
              // Persist share intent before redirect
              writeShareIntent(transactionHash);
              // Redirect as soon as a tx hash is known
              maybeRedirectToProfile();
              // Show success toast after navigation so it appears on profile
              try {
                toast({
                  title: successTitle,
                  description: formatSuccessDescription(successMessage),
                  duration: 5000,
                });
                didShowSuccessToastRef.current = true;
              } catch (e) {
                console.error(e);
              }
              onTxHash?.(transactionHash);
              setTxHash(transactionHash);
              setIsSubmitting(false);
            } else {
              // No tx hash available from aggregator; consider operation successful.
              // Redirect before showing success toast
              writeShareIntent(undefined);
              maybeRedirectToProfile();
              toast({
                title: successTitle,
                description: formatSuccessDescription(successMessage),
                duration: 5000,
              });
              onSuccess?.(undefined as any);
              didShowSuccessToastRef.current = true;
            }
          } else {
            // Embedded path or fallback path without aggregator id.
            const transactionHash =
              data?.receipts?.[0]?.transactionHash ||
              data?.transactionHash ||
              data?.txHash;
            if (transactionHash) {
              // Persist share intent before redirect
              writeShareIntent(transactionHash);
              // Redirect as soon as a tx hash is known
              maybeRedirectToProfile();
              // Show success toast after navigation so it appears on profile
              try {
                toast({
                  title: successTitle,
                  description: formatSuccessDescription(successMessage),
                  duration: 5000,
                });
                didShowSuccessToastRef.current = true;
              } catch (e) {
                console.error(e);
              }
              onTxHash?.(transactionHash);
              setTxHash(transactionHash);
              setIsSubmitting(false);
              return;
            }
            // Fallback path without aggregator id.
            // Redirect before showing success toast
            writeShareIntent(undefined);
            maybeRedirectToProfile();
            toast({
              title: successTitle,
              description: formatSuccessDescription(successMessage),
              duration: 5000,
            });
            onSuccess?.(undefined as any);
            didShowSuccessToastRef.current = true;
            setIsSubmitting(false);
          }
        } catch (e) {
          console.error(e);
          // `wallet_getCallsStatus` unsupported or failed; assume success since `sendCalls` resolved.
          // Redirect before showing success toast
          writeShareIntent(undefined);
          maybeRedirectToProfile();
          toast({
            title: successTitle,
            description: formatSuccessDescription(successMessage),
            duration: 5000,
          });
          onSuccess?.(undefined as any);
          didShowSuccessToastRef.current = true;
          setIsSubmitting(false);
        }
      } catch (error) {
        setIsSubmitting(false);
        toast({
          title: 'Transaction Failed',
          description: handleViemError(error, fallbackErrorMessage),
          duration: 5000,
          variant: 'destructive',
        });
        onError?.(error as Error);
      }
    },
    [
      resetCalls,
      validateAndSwitchChain,
      sendCallsAsync,
      client,
      embeddedWallet,
      toast,
      fallbackErrorMessage,
      onError,
      onTxHash,
      isEmbeddedWallet,
      user,
      maybeRedirectToProfile,
      writeShareIntent,
      shouldAutoUnwrap,
      executeAutoUnwrap,
      ensureEmbeddedAuth,
    ]
  );

  const handleTxSuccess = useCallback(
    (receipt: ReturnType<typeof useTransactionReceipt>['data']) => {
      if (!txHash) return;
      // Avoid duplicate success toast if already shown after redirect
      if (!didShowSuccessToastRef.current) {
        toast({
          title: successTitle,
          description: formatSuccessDescription(successMessage),
          duration: 5000,
        });
      }
      onSuccess?.(receipt);
      setTxHash(undefined);
      setIsSubmitting(false);
      didShowSuccessToastRef.current = false;
    },
    [txHash, toast, successMessage, onSuccess]
  );

  const handleTxError = useCallback(
    (error: Error) => {
      if (!txHash) return;

      toast({
        title: 'Transaction Failed',
        description: handleViemError(error, fallbackErrorMessage),
        duration: 5000,
        variant: 'destructive',
      });

      onError?.(error);
      setTxHash(undefined);
      setIsSubmitting(false);
    },
    [txHash, toast, fallbackErrorMessage, onError]
  );

  // Transaction monitoring via useMonitorTxStatus with stable callbacks
  const { isPending: txPending } = useMonitorTxStatus({
    hash: txHash,
    chainId,
    onSuccess: handleTxSuccess,
    onError: handleTxError,
  });

  const isMining = Boolean(txHash) && Boolean(txPending);

  return useMemo(
    () => ({
      writeContract: sapienceWriteContract,
      sendCalls: sapienceSendCalls,
      isPending:
        isWritingContract || isSendingCalls || isMining || isSubmitting,
      reset: resetWrite,
      resetCalls,
    }),
    [
      sapienceWriteContract,
      sapienceSendCalls,
      isWritingContract,
      isSendingCalls,
      isMining,
      isSubmitting,
      resetWrite,
      resetCalls,
    ]
  );
}
