# 🤖 AI-Powered Market Maker for Sapience

An intelligent market maker that uses AI to analyze prediction markets and automatically bid on high-probability auctions.

## 🎯 Features

- **🤖 AI-Powered Predictions**: Uses OpenRouter API (GPT-4o-mini) to analyze market conditions
- **📊 Smart Filtering**: Only bids on markets with ≥60% probability
- **💰 Conservative Bidding**: 0.25 USDe per bid with configurable limits
- **⏱️ Flexible Deadlines**: 10-minute bid validity (configurable)
- **🔄 24/7 Operation**: Listens to auction relayer in real-time
- **⛓️ Ethereal Chain**: Native USDe support with automatic WUSDe wrapping

## 📋 Prerequisites

- Node.js ≥18.0.0
- pnpm (recommended) or npm
- OpenRouter API key ([get one here](https://openrouter.ai/))
- Ethereum private key with USDe on Ethereal chain

## 🚀 Quick Start

### 1. Install Dependencies

From the workspace root:

```bash
pnpm install
```

Or from this directory:

```bash
cd starters/market-maker
pnpm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp env.example .env
```

Edit `.env` and add your credentials:

```env
PRIVATE_KEY=0x...your_private_key
OPENROUTER_API_KEY=sk-or-v1-...your_api_key
```

### 3. Run the Market Maker

**Development mode:**

```bash
pnpm run dev:published
```

**Production mode (PM2):**

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

## ⚙️ Configuration

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `BID_AMOUNT` | `0.25` | Amount to bid per auction (USDe) |
| `MIN_MAKER_WAGER` | `0.1` | Minimum taker wager to consider (USDe) |
| `DEADLINE_SECONDS` | `600` | Bid validity period (seconds) |
| `MIN_PROBABILITY` | `60` | Minimum AI-predicted probability (0-100) |

### Chain Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `CHAIN_ID` | `5064014` | Ethereal chain ID |
| `RPC_URL` | `https://rpc.ethereal.trade` | RPC endpoint |

### Advanced Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `RELAYER_WS_URL` | `wss://relayer.sapience.xyz/auction` | WebSocket relayer |
| `VERIFYING_CONTRACT` | (from SDK) | Prediction market contract |
| `COLLATERAL_TOKEN` | (from SDK) | WUSDe token address |

## 📊 How It Works

```
┌─────────────────────────────────────────────┐
│  1. Listen to Auction Relayer (WebSocket)   │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  2. Decode Auction Details                  │
│     • Condition IDs                         │
│     • Predictions (Yes/No)                  │
│     • Taker wager amount                    │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  3. AI Analysis (OpenRouter)                │
│     • Fetch market metadata                 │
│     • Analyze with GPT-4o-mini              │
│     • Calculate probability & confidence    │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  4. Decision Filter                         │
│     ✅ Probability ≥ MIN_PROBABILITY        │
│     ✅ Wager ≥ MIN_MAKER_WAGER              │
│     ✅ Correct chain (Ethereal)             │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  5. Submit Bid                              │
│     • Sign with EIP-712                     │
│     • Send to relayer                       │
│     • Wait for acknowledgment               │
└─────────────────────────────────────────────┘
```

## 🔍 Example Output

```
🔐 Preparing collateral for trading
  - chain: Ethereal (5064014)
  - collateral: 0xB6fC…692D
  - spender: 0xAcD7…2cB4
📦 Using prepareForTrade for Ethereal (wrap USDe -> WUSDe + approve)
Ready for trading. WUSDe balance: 250000000000000000
🔌 Connected to relayer

🎯 Auction started 1d3fa29e-65f3-4af2-bed2-54b782fa3b4f
  - Will the 49ers beat the Eagles?: Yes
🤖 AI Analysis:
  - probability: 65%
  - confidence: 75%
  - reasoning: 49ers have strong recent performance and favorable matchup.
✅ Probability 65% >= 60% → Will bid!
📤 Sending bid 0.25 on 1d3fa29e-65f3-4af2-bed2-54b782fa3b4f
📨 Bid sent
✅ Bid acknowledged by relayer

🎯 Auction started 8c4769b5-fc9d-4b6e-9a16-011dc35443c9
  - Will Elon Musk post 500-519 tweets?: Yes
🤖 AI Analysis:
  - probability: 30%
  - confidence: 70%
  - reasoning: Musk's tweeting frequency varies; 500-519 is a narrow range to hit.
❌ Probability 30% < 60% → Skipping
```

## 🛠️ PM2 Management

```bash
# Status
pm2 status

# Logs (real-time)
pm2 logs market-maker

# Restart
pm2 restart market-maker

# Stop
pm2 stop market-maker

# Delete
pm2 delete market-maker
```

## 🔐 Security

- **Never commit `.env`**: Your private keys should never be pushed to Git
- **Use `.env.example`**: Template file for sharing configuration structure
- **Keep keys secure**: Store private keys in secure password managers

## 📈 Performance Tips

1. **Adjust `MIN_PROBABILITY`**: Lower = more bids, higher = safer bids
2. **Tune `DEADLINE_SECONDS`**: Longer = more matches, shorter = less risk
3. **Set `BID_AMOUNT`**: Balance between volume and risk exposure
4. **Monitor logs**: Watch AI decisions to refine strategy

## 🐛 Troubleshooting

### WebSocket Disconnects

```
🔌 WebSocket closed: 1008 idle_timeout
```

**Solution**: The market maker automatically reconnects. This is normal behavior.

### Invalid Signature Errors

**Solution**: Ensure your `PRIVATE_KEY` is correct and has the `0x` prefix.

### No Bids Submitted

**Possible causes:**
- AI predictions below `MIN_PROBABILITY` threshold
- Insufficient OpenRouter credits
- No auctions matching your criteria

**Check logs:**
```bash
pm2 logs market-maker --lines 100
```

## 🤝 Contributing

This is a fork optimized for competitive trading on Sapience prediction markets. Contributions welcome!

## 📄 License

See workspace root for license information.

## 🔗 Links

- [Sapience Documentation](https://docs.sapience.xyz/)
- [OpenRouter](https://openrouter.ai/)
- [Ethereal Explorer](https://explorer.ethereal.trade/)
