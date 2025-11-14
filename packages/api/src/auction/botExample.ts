import WebSocket, { RawData } from 'ws';
import {
  createWalletClient,
  createPublicClient,
  http,
  erc20Abi,
  getAddress,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildMakerBidTypedData,
  signMakerBid,
} from '@sapience/sdk/auction/signing';
import type { AuctionRequestPayload } from './types';

const API_BASE = process.env.FOIL_API_BASE || 'http://localhost:3001';
const WS_URL =
  API_BASE.replace('https://', 'wss://')
    .replace('http://', 'ws://')
    .replace(/\/$/, '') + '/auction';

console.log('[BOT] Env FOIL_API_BASE =', process.env.FOIL_API_BASE);
console.log('[BOT] Connecting to', WS_URL);
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('[BOT] Connected. readyState=', ws.readyState);
});

async function ensureApprovalIfConfigured(amount: bigint) {
  try {
    const rpcUrl = process.env.BOT_RPC_URL;
    const pk = process.env.BOT_PRIVATE_KEY;
    const collateralToken = process.env.BOT_COLLATERAL_TOKEN;
    const spender = process.env.BOT_PARLAY_CONTRACT; // contract that will pull taker collateral
    const chainId = Number(process.env.BOT_CHAIN_ID || '8453');

    if (!rpcUrl || !pk || !collateralToken || !spender) {
      console.log(
        '[BOT] Skipping approval (set BOT_RPC_URL, BOT_PRIVATE_KEY, BOT_COLLATERAL_TOKEN, BOT_PARLAY_CONTRACT to enable)'
      );
      return;
    }

    const account = privateKeyToAccount(`0x${pk.replace(/^0x/, '')}`);
    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const walletClient = createWalletClient({
      account,
      chain: {
        id: chainId,
        name: 'custom',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      },
      transport: http(rpcUrl),
    });

    const owner = getAddress(account.address);
    const token = getAddress(collateralToken as `0x${string}`);
    const spenderAddr = getAddress(spender as `0x${string}`);

    const allowance = (await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, spenderAddr],
    })) as bigint;

    if (allowance >= amount) {
      console.log(
        '[BOT] Approval sufficient, allowance=',
        allowance.toString()
      );
      return;
    }

    console.log(
      `[BOT] Sending approval tx for ${amount.toString()} to spender ${spenderAddr} on token ${token}`
    );
    const hash = await walletClient.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spenderAddr, amount],
    });
    console.log('[BOT] Approval submitted hash=', hash);
  } catch (e) {
    console.error('[BOT] Approval step failed (continuing anyway):', e);
  }
}

ws.on('message', async (data: RawData) => {
  try {
    const msg = JSON.parse(String(data));
    const type = msg?.type as string | undefined;
    switch (type) {
      case 'auction.started': {
        const auction = msg.payload || {};
        const auctionId = String(auction.auctionId || '');
        const taker = auction.taker as Address | undefined;
        const predictedOutcomes: string[] = Array.isArray(
          auction.predictedOutcomes
        )
          ? (auction.predictedOutcomes as string[])
          : [];
        const resolver = auction.resolver as Address | undefined;
        const wager = BigInt(String(auction.wager || '0'));
        console.log(
          `[BOT] auction.started auctionId=${auctionId} taker=${taker} wager=${wager.toString()} preds=${predictedOutcomes.length}`
        );

        // Maker bid: offer 50% of taker wager
        const makerWager = wager / 2n;
        const makerDeadline = Math.floor(Date.now() / 1000) + 60;
        const makerNonce = 1;

        // Ensure ERC-20 approval is set up for the maker (optional)
        void ensureApprovalIfConfigured(makerWager);

        // Sign maker bid if PRIVATE KEY is set
        const pkHex = process.env.BOT_PRIVATE_KEY
          ? (`0x${String(process.env.BOT_PRIVATE_KEY).replace(/^0x/, '')}` as Hex)
          : undefined;
        let maker: Address | undefined = undefined;
        let makerSignature: Hex = ('0x' +
          '11'.repeat(32) +
          '22'.repeat(32)) as Hex; // fallback demo sig
        try {
          if (pkHex) {
            const account = privateKeyToAccount(pkHex);
            maker = getAddress(account.address);
            const { domain, types, primaryType, message } =
              buildMakerBidTypedData({
                auction: {
                  wager: String(auction.wager || '0'),
                  predictedOutcomes: predictedOutcomes.map((outcome) => outcome as Hex),
                  resolver: getAddress(resolver as `0x${string}`),
                  taker: taker as Address,
                },
                makerWager,
                makerDeadline,
                chainId: Number(auction.chainId || 0),
                verifyingContract: getAddress(
                  auction.marketContract as `0x${string}`
                ),
                maker,
              });
            makerSignature = await signMakerBid({
              privateKey: pkHex,
              domain,
              types,
              primaryType,
              message,
            });
          } else {
            console.log(
              '[BOT] BOT_PRIVATE_KEY not set; sending demo signature'
            );
            maker = getAddress('0x0000000000000000000000000000000000000001');
          }
        } catch (e) {
          console.error('[BOT] Maker signing failed:', e);
          return;
        }

        const bid = {
          type: 'bid.submit',
          payload: {
            auctionId,
            maker,
            makerWager: makerWager.toString(),
            makerDeadline,
            makerSignature,
            makerNonce,
          },
        };
        console.log(
          `[BOT] Sending maker bid on ${auctionId} amount=${makerWager.toString()} deadline=${makerDeadline}`
        );
        ws.send(JSON.stringify(bid));
        break;
      }
      case 'bid.ack': {
        const ack = msg.payload || {};
        if (ack.error) {
          console.log('[BOT] bid.ack error=', ack.error);
        } else {
          console.log('[BOT] bid.ack ok');
        }
        break;
      }
      case 'auction.bids': {
        const payload = msg.payload || {};
        const bids = Array.isArray(payload.bids) ? payload.bids : [];
        console.log(
          `[BOT] auction.bids auctionId=${payload.auctionId} count=${bids.length}`
        );
        if (bids.length > 0) {
          const top = bids[0];
          console.log(
            `[BOT] top bid makerWager=${top?.makerWager} makerDeadline=${top?.makerDeadline}`
          );
        }
        break;
      }

      default: {
        console.log('[BOT] unhandled message type:', type);
        break;
      }
    }
  } catch (e) {
    console.error('[BOT] parse error', e);
  }
});

ws.on('error', (err: Error) => {
  console.error('[BOT] ws error', err);
});

ws.on('close', (code, reason) => {
  try {
    const r = reason ? reason.toString() : '';
    console.log(`[BOT] ws closed code=${code} reason="${r}"`);
  } catch {
    console.log(`[BOT] ws closed code=${code}`);
  }
});
