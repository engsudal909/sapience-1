import type { AttestationCalldata } from './eas';
import { buildAttestationCalldata } from './eas';
import { submitTransaction } from './tx';

type Hex = `0x${string}`;

export async function postForecastAttestation(args: {
  prediction: { probability: number; reasoning: string; confidence: number };
  chainId: number;
  rpc: string;
  privateKey?: Hex;
  account?: any;
  conditionId?: Hex;
}): Promise<{ hash: Hex; calldata: AttestationCalldata }>
{
  const calldata = await buildAttestationCalldata(
    args.prediction,
    args.chainId,
    args.conditionId,
  );
  if (!calldata) throw new Error('Failed to build attestation calldata');

  const { hash } = await submitTransaction({
    rpc: args.rpc,
    privateKey: args.privateKey,
    account: args.account,
    tx: { to: calldata.to, data: calldata.data, value: calldata.value },
  });

  return { hash, calldata };
}


