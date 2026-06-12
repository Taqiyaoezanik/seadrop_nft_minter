# SeaDrop Mint Bot

An open source, self-hosted Telegram bot that automatically mints NFTs from OpenSea SeaDrop collections on Ethereum mainnet. Supports up to 100 concurrent burner wallets, per-user settings, and full risk validation before every mint.

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
git clone https://gitlab.com/idcrypto-group/idcrypto-project.git
cd idcrypto-project

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
| `DEFAULT_MAX_GAS_ETH` | — | Default max gas fee in ETH (default: 0.02) |
| `DEFAULT_QUANTITY` | — | Default mint quantity per job (default: 1) |
| `LOW_BALANCE_THRESHOLD_ETH` | — | Warn when wallet balance below this (default: 0.05) |
| `MAX_PRIORITY_FEE_GWEI` | — | EIP-1559 priority fee in gwei (default: 2) |
| `TX_TIMEOUT_SECONDS` | — | Transaction timeout in seconds (default: 300) |
| `QUEUE_CONCURRENCY` | — | Max concurrent mint jobs (default: 10) |
| `GOPLUS_STRICT_MODE` | — | Block mints if GoPlus API fails (default: false) |
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

## Command Reference

| Command | Description |
|---|---|
| `/start` | Welcome message and wallet pool status |
| `/help` | Show all available commands |
| `/mint <url>` | Start a mint job for an OpenSea collection URL |
| `/status` | Show your active mint jobs |
| `/history` | Show your last 20 mint transactions |
| `/cancel <job_id>` | Cancel a pending mint job |
| `/wallets` | Show wallet pool: address, balance, status |
| `/settings` | Show your current settings |
| `/set_maxprice <eth>` | Set max mint price (e.g. `/set_maxprice 0.05`) |
| `/set_maxgas <eth>` | Set max gas fee (e.g. `/set_maxgas 0.01`) |
| `/set_quantity <n>` | Set mint quantity per job (e.g. `/set_quantity 2`) |
| `/blacklist <contract>` | Add contract to local blacklist (admin only) |
| `/whitelist <contract>` | Remove contract from blacklist (admin only) |
| `/admin_stats` | Total mints, success rate, wallet balances (admin only) |
| `/admin_reload` | Reload wallet pool from .env without restart (admin only) |
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
