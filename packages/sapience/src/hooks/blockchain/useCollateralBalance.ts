import { useMemo } from 'react';
import { useReadContract, useBalance } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import {
  COLLATERAL_SYMBOLS,
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import { DEFAULT_COLLATERAL_ASSET } from '~/components/admin/constants';

// wUSDe address for Ethereal chains (wrapped version of native USDe)
const WUSDE_ADDRESS = '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';

// Gas reserve to subtract from balance on ALL chains
const GAS_RESERVE = 0.5;

interface UseCollateralBalanceProps {
  address?: `0x${string}`;
  chainId?: number;
  enabled?: boolean;
}

interface UseCollateralBalanceResult {
  rawBalance: bigint | undefined;

  balance: number;

  formattedBalance: string;
  /** Token decimals */
  decimals: number;

  symbol: string;

  isEtherealChain: boolean;

  isLoading: boolean;

  refetch: () => void;
}

export function useCollateralBalance({
  address,
  chainId,
  enabled = true,
}: UseCollateralBalanceProps): UseCollateralBalanceResult {
  const isEtherealChain =
    chainId === CHAIN_ID_ETHEREAL || chainId === CHAIN_ID_ETHEREAL_TESTNET;
  const collateralSymbol = chainId
    ? COLLATERAL_SYMBOLS[chainId] || 'testUSDe'
    : 'testUSDe';

  const {
    data: nativeBalance,
    isLoading: isLoadingNativeBalance,
    refetch: refetchNative,
  } = useBalance({
    address,
    chainId,
    query: { enabled: enabled && Boolean(address) && isEtherealChain },
  });

  const { data: wusdeDecimals, isLoading: isLoadingWusdeDecimals } =
    useReadContract({
      abi: erc20Abi,
      address: WUSDE_ADDRESS,
      functionName: 'decimals',
      chainId,
      query: { enabled: enabled && Boolean(address) && isEtherealChain },
    });

  const {
    data: wusdeBalance,
    isLoading: isLoadingWusdeBalance,
    refetch: refetchWusde,
  } = useReadContract({
    abi: erc20Abi,
    address: WUSDE_ADDRESS,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) && isEtherealChain },
  });

  const collateralAssetAddress = DEFAULT_COLLATERAL_ASSET;

  const { data: usdeDecimals, isLoading: isLoadingUsdeDecimals } =
    useReadContract({
      abi: erc20Abi,
      address: collateralAssetAddress,
      functionName: 'decimals',
      chainId,
      query: { enabled: enabled && Boolean(address) && !isEtherealChain },
    });

  const {
    data: usdeBalance,
    isLoading: isLoadingUsdeBalance,
    refetch: refetchUsde,
  } = useReadContract({
    abi: erc20Abi,
    address: collateralAssetAddress,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: enabled && Boolean(address) && !isEtherealChain },
  });

  const isLoading = isEtherealChain
    ? isLoadingNativeBalance || isLoadingWusdeDecimals || isLoadingWusdeBalance
    : isLoadingUsdeDecimals || isLoadingUsdeBalance;

  const refetch = () => {
    if (isEtherealChain) {
      refetchNative();
      refetchWusde();
    } else {
      refetchUsde();
    }
  };

  const result = useMemo(() => {
    try {
      if (isEtherealChain) {
        let totalBalance = 0;
        let rawNative = 0n;
        let rawWrapped = 0n;

        if (nativeBalance) {
          const nativeNum = Number(nativeBalance.formatted);
          if (!Number.isNaN(nativeNum)) {
            totalBalance += nativeNum;
            rawNative = nativeBalance.value;
          }
        }

        if (wusdeBalance) {
          const dec =
            typeof wusdeDecimals === 'number'
              ? wusdeDecimals
              : Number(wusdeDecimals ?? 18);
          const wusdeFormatted = formatUnits(wusdeBalance, dec);
          const wusdeNum = Number(wusdeFormatted);
          if (!Number.isNaN(wusdeNum)) {
            totalBalance += wusdeNum;
            rawWrapped = wusdeBalance;
          }
        }

        const effectiveBalance = Math.max(0, totalBalance - GAS_RESERVE);

        return {
          rawBalance: rawNative + rawWrapped,
          balance: effectiveBalance,
          decimals: nativeBalance?.decimals || 18,
        };
      } else {
        const dec =
          typeof usdeDecimals === 'number'
            ? usdeDecimals
            : Number(usdeDecimals ?? 18);
        if (!usdeBalance) {
          return {
            rawBalance: undefined,
            balance: 0,
            decimals: dec,
          };
        }
        const human = formatUnits(usdeBalance, dec);
        const num = Number(human);
        const adjustedNum = Number.isNaN(num)
          ? 0
          : Math.max(0, num - GAS_RESERVE);
        return {
          rawBalance: usdeBalance,
          balance: adjustedNum,
          decimals: dec,
        };
      }
    } catch {
      return {
        rawBalance: undefined,
        balance: 0,
        decimals: 18,
      };
    }
  }, [
    isEtherealChain,
    nativeBalance,
    wusdeBalance,
    wusdeDecimals,
    usdeBalance,
    usdeDecimals,
  ]);

  return {
    rawBalance: result.rawBalance,
    balance: result.balance,
    formattedBalance: `${result.balance} ${collateralSymbol}`,
    decimals: result.decimals,
    symbol: collateralSymbol,
    isEtherealChain,
    isLoading,
    refetch,
  };
}
