import { Request, Response, Router } from 'express';
import prisma from '../db';
import { hashReferralCode } from '../helpers';
import { recoverMessageAddress } from 'viem';

const router = Router();

type SetReferralCodeBody = {
  walletAddress?: string;
  codePlaintext?: string;
  signature?: `0x${string}`;
  maxReferrals?: number;
  chainId?: number;
  nonce?: string;
};

type ClaimReferralBody = {
  walletAddress?: string;
  codePlaintext?: string;
  signature?: `0x${string}`;
  chainId?: number;
  nonce?: string;
};

const MESSAGE_PREFIX = 'Sapience Referral';

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function buildSignedMessagePayload(params: {
  walletAddress: string;
  codeHash: `0x${string}`;
  chainId?: number;
  nonce?: string;
}): string {
  const { walletAddress, codeHash, chainId, nonce } = params;
  return JSON.stringify({
    prefix: MESSAGE_PREFIX,
    walletAddress: normalizeAddress(walletAddress),
    codeHash,
    chainId: chainId ?? null,
    nonce: nonce ?? null,
  });
}

async function verifyWalletSignature(params: {
  walletAddress: string;
  codeHash: `0x${string}`;
  signature: `0x${string}`;
  chainId?: number;
  nonce?: string;
}): Promise<boolean> {
  const { walletAddress, signature, chainId, nonce, codeHash } = params;
  const message = buildSignedMessagePayload({
    walletAddress,
    codeHash,
    chainId,
    nonce,
  });

  const recovered = await recoverMessageAddress({ message, signature });

  return normalizeAddress(recovered) === normalizeAddress(walletAddress);
}

router.post('/code', async (req: Request, res: Response) => {
  const {
    walletAddress,
    codePlaintext,
    signature,
    maxReferrals,
    chainId,
    nonce,
  } = req.body as SetReferralCodeBody;

  if (!walletAddress || !codePlaintext || !signature) {
    return res
      .status(400)
      .json({
        message: 'walletAddress, codePlaintext, and signature are required',
      });
  }

  let codeHash: `0x${string}`;
  try {
    codeHash = hashReferralCode(codePlaintext);
  } catch {
    return res.status(400).json({ message: 'Invalid referral code' });
  }

  try {
    const validSignature = await verifyWalletSignature({
      walletAddress,
      codeHash,
      signature,
      chainId,
      nonce,
    });

    if (!validSignature) {
      return res.status(401).json({ message: 'Invalid signature' });
    }
  } catch (e) {
    console.error('Error verifying referral code signature', e);
    return res.status(400).json({ message: 'Failed to verify signature' });
  }

  try {
    const updated = await prisma.user.upsert({
      where: { address: normalizeAddress(walletAddress) },
      update: {
        refCodeHash: codeHash,
        maxReferrals:
          typeof maxReferrals === 'number' && maxReferrals >= 0
            ? maxReferrals
            : 0,
      },
      create: {
        address: normalizeAddress(walletAddress),
        refCodeHash: codeHash,
        maxReferrals:
          typeof maxReferrals === 'number' && maxReferrals >= 0
            ? maxReferrals
            : 0,
      },
    });

    return res.status(200).json({
      address: updated.address,
      refCodeHash: updated.refCodeHash,
      maxReferrals: updated.maxReferrals,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (
      message.includes('Unique constraint failed') ||
      message.includes('Unique constraint')
    ) {
      return res.status(409).json({
        message: 'Referral code is already in use',
      });
    }
    console.error('Error setting referral code:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.post('/claim', async (req: Request, res: Response) => {
  const { walletAddress, codePlaintext, signature, chainId, nonce } =
    req.body as ClaimReferralBody;

  if (!walletAddress || !codePlaintext || !signature) {
    return res
      .status(400)
      .json({
        message: 'walletAddress, codePlaintext, and signature are required',
      });
  }

  let codeHash: `0x${string}`;
  try {
    codeHash = hashReferralCode(codePlaintext);
  } catch {
    return res.status(400).json({ message: 'Invalid referral code' });
  }

  try {
    const validSignature = await verifyWalletSignature({
      walletAddress,
      codeHash,
      signature,
      chainId,
      nonce,
    });

    if (!validSignature) {
      return res.status(401).json({ message: 'Invalid signature' });
    }
  } catch (e) {
    console.error('Error verifying referral claim signature', e);
    return res.status(400).json({ message: 'Failed to verify signature' });
  }

  try {
    const referrer = await prisma.user.findFirst({
      where: { refCodeHash: codeHash },
    });

    if (!referrer) {
      return res.status(404).json({ message: 'Invalid referral code' });
    }

    const referee = await prisma.user.upsert({
      where: { address: normalizeAddress(walletAddress) },
      create: {
        address: normalizeAddress(walletAddress),
        referredById: referrer.id,
      },
      update: {
        // Enforce idempotency: do not overwrite an existing referredById
        referredById: undefined,
      },
    });

    // If the user was already referred, respect existing relationship
    const effectiveReferee = referee.referredById
      ? referee
      : await prisma.user.update({
          where: { id: referee.id },
          data: { referredById: referrer.id },
        });

    const referrals = await prisma.user.findMany({
      where: { referredById: referrer.id },
      orderBy: { createdAt: 'asc' },
    });

    const index = referrals.findIndex((u) => u.id === effectiveReferee.id);
    const position = index === -1 ? null : index + 1;
    const max = referrer.maxReferrals ?? 0;
    const allowed = position !== null && position <= max;

    return res.status(200).json({
      allowed,
      index: position,
      maxReferrals: max,
    });
  } catch (e) {
    console.error('Error claiming referral code:', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

export { router };
