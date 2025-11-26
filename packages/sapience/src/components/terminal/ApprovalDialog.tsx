'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  useReadContract,
  useReadContracts,
  useBalance,
  useAccount,
  useSendCalls,
} from 'wagmi';
import {
  formatUnits,
  parseUnits,
  encodeFunctionData,
  erc20Abi,
  parseAbi,
} from 'viem';
import { predictionMarket } from '@sapience/sdk/contracts';
import { predictionMarketAbi } from '@sapience/sdk';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { useRestrictedJurisdiction } from '~/hooks/useRestrictedJurisdiction';
import erc20AbiLocal from '@sapience/sdk/queries/abis/erc20abi.json';
import RestrictedJurisdictionBanner from '~/components/shared/RestrictedJurisdictionBanner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { useTokenApproval } from '~/hooks/contract/useTokenApproval';
import { formatFiveSigFigs } from '~/lib/utils/util';
import { useApprovalDialog } from './ApprovalDialogContext';
import { GAS_RESERVE } from '~/components/admin/constants';

// wUSDe configuration for Ethereal chain
const WUSDE_ADDRESS = '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';
const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function balanceOf(address account) view returns (uint256)',
]);

const ApprovalDialog: React.FC = () => {
  const { isOpen, setOpen, requiredAmount } = useApprovalDialog();
  const chainId = useChainIdFromLocalStorage();
  const { address } = useAccount();
  const { isRestricted, isPermitLoading } = useRestrictedJurisdiction();

  const isEtherealChain =
    chainId === CHAIN_ID_ETHEREAL || chainId === CHAIN_ID_ETHEREAL_TESTNET;

  const SPENDER_ADDRESS = predictionMarket[chainId]?.address as
    | `0x${string}`
    | undefined;

  // Read collateral token address from PredictionMarket contract config
  const predictionMarketConfigRead = useReadContracts({
    contracts: SPENDER_ADDRESS
      ? [
          {
            address: SPENDER_ADDRESS,
            abi: predictionMarketAbi,
            functionName: 'getConfig',
            chainId: chainId,
          },
        ]
      : [],
    query: { enabled: !!SPENDER_ADDRESS },
  });

  const COLLATERAL_ADDRESS: `0x${string}` | undefined = useMemo(() => {
    const item = predictionMarketConfigRead.data?.[0];
    if (item && item.status === 'success') {
      const cfg = item.result as { collateralToken: `0x${string}` };
      return cfg?.collateralToken;
    }
    return undefined;
  }, [predictionMarketConfigRead.data]);

  const { data: decimals } = useReadContract({
    abi: erc20AbiLocal,
    address: COLLATERAL_ADDRESS,
    functionName: 'decimals',
    chainId: chainId,
    query: { enabled: Boolean(COLLATERAL_ADDRESS) },
  });

  // Read native USDe balance (for Ethereal chain)
  const { data: nativeBalance, refetch: refetchNative } = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(address) && isEtherealChain },
  });

  // Read wUSDe balance (for Ethereal chain)
  const { data: wusdeBalance, refetch: refetchWusde } = useReadContract({
    abi: erc20Abi,
    address: WUSDE_ADDRESS,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(address) && isEtherealChain },
  });

  // Read ERC20 collateral balance (for non-Ethereal chains)
  const { data: erc20Balance, refetch: refetchErc20 } = useReadContract({
    abi: erc20Abi,
    address: COLLATERAL_ADDRESS,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: Boolean(address && COLLATERAL_ADDRESS) && !isEtherealChain,
    },
  });

  const [approveAmount, setApproveAmount] = useState<string>('');

  useEffect(() => {
    if (
      requiredAmount &&
      (!approveAmount || Number(approveAmount) < Number(requiredAmount))
    ) {
      setApproveAmount(requiredAmount);
    }
  }, [requiredAmount]);

  const tokenDecimals = useMemo(() => {
    try {
      return typeof decimals === 'number' ? decimals : Number(decimals ?? 18);
    } catch {
      return 18;
    }
  }, [decimals]);

  // Calculate effective balance (native + wrapped - gas reserve for Ethereal)
  const { effectiveBalance, nativeValue, wusdeValue } = useMemo(() => {
    if (isEtherealChain) {
      const nativeNum = nativeBalance ? Number(nativeBalance.formatted) : 0;
      const wusdeNum = wusdeBalance
        ? Number(formatUnits(wusdeBalance, tokenDecimals))
        : 0;
      const total = nativeNum + wusdeNum;
      const effective = Math.max(0, total - GAS_RESERVE);
      return {
        effectiveBalance: effective,
        nativeValue: nativeNum,
        wusdeValue: wusdeNum,
      };
    } else {
      const balance = erc20Balance
        ? Number(formatUnits(erc20Balance, tokenDecimals))
        : 0;
      const effective = Math.max(0, balance - GAS_RESERVE);
      return {
        effectiveBalance: effective,
        nativeValue: 0,
        wusdeValue: balance,
      };
    }
  }, [
    isEtherealChain,
    nativeBalance,
    wusdeBalance,
    erc20Balance,
    tokenDecimals,
  ]);

  const effectiveBalanceDisplay = useMemo(() => {
    return formatFiveSigFigs(effectiveBalance);
  }, [effectiveBalance]);

  const {
    allowance,
    isLoadingAllowance,
    approve,
    isApproving,
    refetchAllowance,
  } = useTokenApproval({
    tokenAddress: COLLATERAL_ADDRESS,
    spenderAddress: SPENDER_ADDRESS,
    amount: approveAmount,
    chainId: chainId,
    decimals: tokenDecimals,
    enabled: Boolean(COLLATERAL_ADDRESS && SPENDER_ADDRESS),
  });

  const allowanceDisplay = useMemo(() => {
    try {
      if (allowance == null) return '0';
      const human = Number(
        formatUnits(allowance as unknown as bigint, tokenDecimals)
      );
      return formatFiveSigFigs(human);
    } catch {
      return '0';
    }
  }, [allowance, tokenDecimals]);

  // Calculate how much wrapping is needed
  const { needsWrapping, wrapAmount } = useMemo(() => {
    if (!isEtherealChain) {
      return { needsWrapping: false, wrapAmount: 0n };
    }

    const approveNum = Number(approveAmount || '0');
    if (!Number.isFinite(approveNum) || approveNum <= 0) {
      return { needsWrapping: false, wrapAmount: 0n };
    }

    // How much more wUSDe do we need beyond current wUSDe balance?
    const neededWusde = approveNum - wusdeValue;
    if (neededWusde <= 0) {
      return { needsWrapping: false, wrapAmount: 0n };
    }

    // Check if we have enough native balance to wrap (leaving gas reserve)
    const availableNative = Math.max(0, nativeValue - GAS_RESERVE);
    if (availableNative <= 0) {
      return { needsWrapping: false, wrapAmount: 0n };
    }

    // Wrap the minimum needed or max available
    const toWrap = Math.min(neededWusde, availableNative);
    const wrapAmountWei = parseUnits(String(toWrap), tokenDecimals);

    return {
      needsWrapping: toWrap > 0,
      wrapAmount: wrapAmountWei,
    };
  }, [isEtherealChain, approveAmount, wusdeValue, nativeValue, tokenDecimals]);

  // useSendCalls for batching wrap + approve
  const { sendCallsAsync, isPending: isSendingCalls } = useSendCalls();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!COLLATERAL_ADDRESS || !SPENDER_ADDRESS || !approveAmount) return;

    try {
      setIsSubmitting(true);
      const approveAmountWei = parseUnits(approveAmount, tokenDecimals);

      if (isEtherealChain && needsWrapping && wrapAmount > 0n) {
        // Batch: wrap USDe to wUSDe, then approve
        const wrapCalldata = encodeFunctionData({
          abi: WUSDE_ABI,
          functionName: 'deposit',
        });

        const approveCalldata = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [SPENDER_ADDRESS, approveAmountWei],
        });

        await sendCallsAsync({
          chainId,
          calls: [
            {
              to: WUSDE_ADDRESS,
              data: wrapCalldata,
              value: wrapAmount,
            },
            {
              to: COLLATERAL_ADDRESS,
              data: approveCalldata,
              value: 0n,
            },
          ],
        });
      } else {
        // Just approve
        await approve();
      }

      // Close the dialog after successful submission
      setOpen(false);

      // Refetch balances and allowance
      setTimeout(() => {
        refetchAllowance();
        if (isEtherealChain) {
          refetchNative();
          refetchWusde();
        } else {
          refetchErc20();
        }
      }, 2000);
    } catch {
      // Error handled by toast in approve()
    } finally {
      setIsSubmitting(false);
    }
  }, [
    COLLATERAL_ADDRESS,
    SPENDER_ADDRESS,
    approveAmount,
    tokenDecimals,
    isEtherealChain,
    needsWrapping,
    wrapAmount,
    chainId,
    sendCallsAsync,
    approve,
    setOpen,
    refetchAllowance,
    refetchNative,
    refetchWusde,
    refetchErc20,
  ]);

  const isProcessing = isApproving || isSendingCalls || isSubmitting;

  useEffect(() => {
    if (!approveAmount && allowance != null) setApproveAmount(allowanceDisplay);
  }, [allowance, allowanceDisplay]);

  // Check if user has enough balance for the requested amount
  const hasInsufficientBalance = useMemo(() => {
    const approveNum = Number(approveAmount || '0');
    return Number.isFinite(approveNum) && approveNum > effectiveBalance;
  }, [approveAmount, effectiveBalance]);

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[380px] pt-6">
        <DialogHeader>
          <DialogTitle>Approved Spend</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={approveAmount}
              onChange={(e) => setApproveAmount(e.target.value.trim())}
              className="h-10 pr-20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              USDe
            </span>
          </div>

          {/* Account Balance Display */}
          <div className="text-xs text-muted-foreground !mt-2">
            <span>Account Balance: </span>
            <span className="text-brand-white font-mono">
              {effectiveBalanceDisplay} USDe
            </span>
          </div>

          <Button
            className="w-full h-10"
            onClick={handleSubmit}
            disabled={
              !approveAmount ||
              isProcessing ||
              !COLLATERAL_ADDRESS ||
              hasInsufficientBalance ||
              isPermitLoading ||
              isRestricted ||
              (requiredAmount != null &&
                Number(approveAmount || '0') < Number(requiredAmount))
            }
          >
            {isProcessing
              ? 'Submitting…'
              : hasInsufficientBalance
                ? 'Insufficient Balance'
                : 'Submit'}
          </Button>

          <RestrictedJurisdictionBanner
            show={!isPermitLoading && isRestricted}
            iconClassName="h-4 w-4"
          />

          {requiredAmount &&
          !hasInsufficientBalance &&
          Number(approveAmount || '0') < Number(requiredAmount) ? (
            <div className="text-[11px] text-amber-500">
              Enter at least {requiredAmount} USDe
            </div>
          ) : null}

          {isLoadingAllowance ? (
            <div className="text-xs text-muted-foreground">
              Refreshing allowance…
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ApprovalDialog;
