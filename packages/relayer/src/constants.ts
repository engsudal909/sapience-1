// PredictionMarket deployed addresses
import { predictionMarket } from '@sapience/sdk';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

export const PREDICTION_MARKET_ADDRESS_ARB1 = predictionMarket[DEFAULT_CHAIN_ID]
  ?.address as `0x${string}`;
export const PREDICTION_MARKET_CHAIN_ID_ARB1 = DEFAULT_CHAIN_ID;

