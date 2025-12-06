'use client';

import {
  DEFAULT_CHAIN_ID as SDK_DEFAULT_CHAIN_ID,
  CHAIN_ID_ARBITRUM as SDK_CHAIN_ID_ARBITRUM,
  CHAIN_ID_ETHEREAL as SDK_CHAIN_ID_ETHEREAL,
} from '@sapience/sdk/constants';
import { collateralToken } from '@sapience/sdk/contracts';

// Re-export SDK constants that are used elsewhere
export const CHAIN_ID_ARBITRUM = SDK_CHAIN_ID_ARBITRUM;
export const CHAIN_ID_ETHEREAL = SDK_CHAIN_ID_ETHEREAL;

// Default collateral asset from SDK
export const DEFAULT_COLLATERAL_ASSET =
  collateralToken[SDK_DEFAULT_CHAIN_ID]?.address;

export const GAS_RESERVE = 0.5;
