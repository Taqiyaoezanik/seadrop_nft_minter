# SeaDrop Mint Bot

An open source, self-hosted Telegram bot that automatically mints NFTs from OpenSea SeaDrop collections on Ethereum mainnet. Supports up to 100 concurrent burner wallets, per-user settings, scheduled mints, and full risk validation before every mint.

## ✨ Features

- 🤖 **Automated Minting** - Queue multiple mints, bot handles everything
- 🎫 **Whitelist/Allowlist Support** - Automatic WL mint via OpenSea Drops API (signature-based)
- ⏰ **Scheduled Mints** - Schedule mints for specific times (perfect for WL/allowlist drops at 10 PM)
- ⚡ **Optimized Gas** - Dynamic priority fee from network, minimal buffers (~0.00002-0.00003 ETH per mint)
- 🚀 **Fast Execution** - 2-second polling, optimized API timeouts (~12-15 seconds total)
- 💰 **Multi-Wallet Support** - Up to 100 concurrent wallets with automatic rotation
- 🛡️ **Risk Validation** - Blacklist, Etherscan, GoPlus security checks before every mint
- 🧪 **Dry-Run Mode** - Test mints with `eth_call` simulation (no transaction sent)
- 📊 **Per-User Settings** - Each user can configure their own limits and preferences
- 🔄 **Queue Management** - View status, history, cancel pending jobs

---

## Prerequisites

- **Node.js** v20 or higher
- **npm** v9 or higher
- **Redis** (optional — enables persistent job queue across restarts)
- API keys: Telegram Bot, Alchemy, OpenSea v2, Etherscan

---

## Installation

```bash
# 1. Clone the repository
git clone https://gitlab.com/oezank/seadrop_nft_minter.git
cd seadrop_nft_minter

# 2. Install dependencies
npm install

# 3. Copy environment file
cp .env.example .env

# 4. Edit .env with your values
nano .env

# 5. Build TypeScript
npm run build

# 6. Start the bot
npm start
```

---

## .env Configuration Guide

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | From [@BotFather](https://t.me/BotFather) |
| `ADMIN_TELEGRAM_ID` | ✅ | Your Telegram numeric user ID |
| `ALCHEMY_API_KEY` | ✅ | From [alchemy.com](https://alchemy.com) |
| `BACKUP_RPC_URL` | ✅ | Fallback RPC (default: cloudflare-eth.com) |
| `OPENSEA_API_KEY` | ✅ | From [OpenSea Developer Portal](https://docs.opensea.io) |
| `ETHERSCAN_API_KEY` | ✅ | From [etherscan.io/apis](https://etherscan.io/apis) |
| `DEFAULT_MAX_MINT_PRICE_ETH` | — | Default max mint price in ETH (default: 0.1) |
| `DEFAULT_MAX_GAS_ETH` | — | Default max gas fee in ETH (**optimized: 0.005**) |
| `DEFAULT_QUANTITY` | — | Default mint quantity per job (default: 1) |
| `LOW_BALANCE_THRESHOLD_ETH` | — | Warn when wallet balance below this (default: 0.0001) |
| `MAX_PRIORITY_FEE_GWEI` | — | EIP-1559 priority fee in gwei (**optimized: 0.01**, supports decimals) |
| `TX_TIMEOUT_SECONDS` | — | Transaction timeout in seconds (**optimized: 120**) |
| `QUEUE_CONCURRENCY` | — | Max concurrent mint jobs (default: 10) |
| `GOPLUS_STRICT_MODE` | — | Block mints if GoPlus API fails (default: false) |
| `DRY_RUN_MODE` | — | Force all `/mint` commands to simulate only — no transactions sent (default: false) |
| `REDIS_URL` | — | Redis URL for persistent queue (optional) |

---

## Adding Burner Wallets

Add wallet private keys to your `.env` file:

```env
WALLET_1_KEY=0xabc123...
WALLET_2_KEY=0xdef456...
WALLET_3_KEY=0x789abc...
```

- Supports up to **100 wallets** (`WALLET_1_KEY` to `WALLET_100_KEY`)
- Each wallet is assigned exclusively to one mint job at a time
- Use `/wallets` command to check balances and status
- Use `/admin_reload` to reload wallets without restarting the bot

> ⚠️ **Use burner wallets only.** Never add wallets containing significant funds.

---

## Running the Bot

### Development

```bash
npm run dev
```

### Production (Node.js)

```bash
npm run build
npm start
```

### Production (Docker — without Redis)

```bash
docker compose up -d bot
```

### Production (Docker — with Redis persistent queue)

```bash
docker compose --profile redis up -d
```

---

## Whitelist/Allowlist Mint Support

Bot **automatically detects and handles WL mints** via OpenSea Drops API:

- ✅ **Public Sale** - Anyone can mint (already supported)
- ✅ **Signed Presale (WL)** - Wallet must be in whitelist (NEW!)
- ✅ **Auto-detection** - Bot automatically selects eligible stage
- ✅ **No manual signature extraction** - OpenSea API handles everything

**How it works:**
1. User `/mint` or `/schedule_mint` a Drop collection
2. Bot calls OpenSea API to check eligibility
3. If wallet in WL → API returns transaction with signature
4. Bot executes mint automatically

**Error handling:**
- `Not eligible` - Wallet not in whitelist
- `Drop inactive` - WL stage not started/ended
- `API unavailable` - Falls back to manual on-chain detection

---

## Scheduled Mints (Perfect for Timed WL Drops!)

Schedule mints to execute automatically at a specific time - perfect for allowlist drops when you want to sleep!

**Example Usage:**
```bash
# Schedule a mint for 10 PM tonight
/schedule_mint https://opensea.io/collection/azuki 22:00

# Schedule with wallet range (wallets 1-5)
/schedule_mint https://opensea.io/collection/azuki 22:00 1 5

# Use 12-hour format
/schedule_mint https://opensea.io/collection/azuki 10:00 PM

# Full datetime
/schedule_mint https://opensea.io/collection/azuki "2024-06-13 22:00"

# View all schedules
/list_schedules

# Cancel a schedule
/cancel_schedule <schedule_id>
```

**How it works:**
- Bot checks every 30 seconds for due schedules
- Automatically queues the mint job at scheduled time
- Status updates: PENDING → EXECUTED/FAILED
- Perfect for timed WL/allowlist mints

**See [SCHEDULE_FEATURE.md](SCHEDULE_FEATURE.md) for complete documentation.**

---

## Command Reference

| Command | Description |
|---|---|
| `/start` | Welcome message and wallet pool status |
| `/help` | Show all available commands |
| `/mint <url>` | Start a mint job for an OpenSea collection URL |
| `/mint_max <url> [from] [to]` | Mint maximum quantity, optionally specify wallet range |
| `/status` | Show your active mint jobs |
| `/history` | Show your last 20 mint transactions |
| `/cancel <job_id>` | Cancel a pending mint job |
| **Scheduled Mints** | |
| `/schedule_mint <url> <time> [from] [to]` | Schedule a mint for later (e.g. `22:00` or `10:00 PM`) |
| `/list_schedules` | Show all your scheduled mints |
| `/cancel_schedule <id>` | Cancel a scheduled mint |
| **Wallet Management** | |
| `/wallets` | Show wallet pool: address, balance, status |
| **Settings** | |
| `/settings` | Show your current settings |
| `/set_maxprice <eth>` | Set max mint price (e.g. `/set_maxprice 0.05`) |
| `/set_maxgas <eth>` | Set max gas fee (e.g. `/set_maxgas 0.005`) |
| `/set_quantity <n>` | Set mint quantity per job (e.g. `/set_quantity 2`) |
| `/set_priorityfee <gwei>` | Set EIP-1559 priority fee (e.g. `/set_priorityfee 0.01`) |
| **Admin Commands** | |
| `/blacklist <contract>` | Add contract to local blacklist (admin only) |
| `/whitelist <contract>` | Remove contract from blacklist (admin only) |
| `/admin_stats` | Total mints, success rate, wallet balances (admin only) |
| `/admin_reload` | Reload wallet pool from .env without restart (admin only) |
| `/dryrun <url>` | Simulate a mint without sending a transaction |
| `/admin_blacklist` | Show full blacklist (admin only) |

---

## Architecture Overview

```
Telegram User
      │
      ▼
┌─────────────────────────────────────┐
│           TELEGRAF BOT LAYER        │
│  middleware: auth, rateLimit        │
│  commands: start, mint, wallet,     │
│            settings, history, admin │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│            QUEUE LAYER              │
│  p-queue (primary, in-memory)       │
│  BullMQ + Redis (optional)          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│           MINT ENGINE               │
│  urlParser → collectionResolver     │
│  → seadropDetector                  │
│  → mintConfigReader                 │
│  → calldataBuilder                  │
│  → gasEstimator                     │
│  → dryRun (simulation / eth_call)   │
│  → transactionSender                │
│  → txMonitor                        │
└──────┬──────────────┬───────────────┘
       │              │
       ▼              ▼
┌────────────┐  ┌─────────────────────┐
│   WALLET   │  │    RISK LAYER       │
│   LAYER    │  │  validator          │
│  pool      │  │  blacklist          │
│  balance   │  │  etherscanCheck     │
│  checker   │  │  goplusCheck        │
└────────────┘  └─────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│         INFRASTRUCTURE              │
│  rpc/client (Viem + Alchemy)        │
│  db (SQLite + better-sqlite3)       │
│  config (Zod + dotenv)              │
└─────────────────────────────────────┘
```

### SeaDrop Mint Flow

```
tx.to = SeaDrop contract (0x00005EA00Ac477B1030CE78506496e8C2dE24bf5)
mintPublic(nftContract, feeRecipient, address(0), quantity)
    │
    └── SeaDrop validates → calls ERC721SeaDrop.mintSeaDrop()
                                        │
                                        └── NFT minted to wallet
```

---

## Security Warnings

> ⚠️ **This bot is designed for self-hosted deployment only.**

1. **Protect your `.env` file.** It contains private keys and API keys. Set file permissions: `chmod 600 .env`
2. **Use burner wallets only.** Never load wallets containing significant ETH or valuable NFTs.
3. **Never share your `.env` file** or commit it to version control. The `.gitignore` excludes it by default.
4. **Private keys are never logged, displayed, or transmitted** by this bot. Verify this yourself before deploying.
5. **Run on a trusted server.** Anyone with server access can read your `.env` file.
6. **No warranty.** This is open source software. Use at your own risk.

---

## Gas Optimization

This bot is **heavily optimized for minimal gas costs**:

### Default Settings (Optimized)
- `MAX_PRIORITY_FEE_GWEI=0.01` - Very low priority fee
- `DEFAULT_MAX_GAS_ETH=0.005` - Reasonable gas limit
- Gas limit buffer: 10% (reduced from 20%)
- Base fee buffer: 0% (no buffer, use raw baseFee)
- Dynamic priority fee from network with safety cap

### Typical Gas Costs
- **Free mints**: ~0.00002-0.00003 ETH (~$0.05-0.08 at $2500 ETH)
- **Paid mints**: mint price + gas fee above

### How Gas is Calculated
```
maxFeePerGas = baseFee + maxPriorityFeePerGas
gasLimit = estimateGas * 1.10 (10% buffer)
totalGasCost = gasLimit * maxFeePerGas
```

### Dynamic Priority Fee
Bot automatically fetches network priority fee from last 4 blocks (median of 50th percentile), capped at `MAX_PRIORITY_FEE_GWEI` config for safety.

### Comparison with Manual Wallet Mint
Bot achieves **similar gas costs** to manual MetaMask/wallet minting when properly configured (~0.00002 ETH).

### Tuning for Your Needs
- **Cheaper gas, slower confirm**: Lower `MAX_PRIORITY_FEE_GWEI` to 0.001
- **Faster confirm, higher gas**: Increase to 0.1-1.0
- **Emergency fast mint**: Use `/set_priorityfee 2` for individual mint

---

## Risk Controls

Before every mint, the bot automatically checks:

1. URL is valid and from opensea.io
2. Collection is on Ethereum mainnet
3. Contract is not in local blacklist
4. Contract is verified on Etherscan
5. Contract is older than 1 hour
6. GoPlus Security scan (honeypot + malicious behavior detection)
7. SeaDrop interface detected
8. Mint is currently active
9. Supply is available
10. Mint price is within your configured limit
11. Gas estimate is within your configured limit
12. An idle wallet is available

---

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Merge Request

Please follow the existing code style (TypeScript strict mode, no `any` types, explicit return types on all functions).

---

## License

MIT License — see [LICENSE](LICENSE) for details.

This project is not affiliated with or endorsed by OpenSea, Alchemy, or any other third-party service mentioned in this documentation.
