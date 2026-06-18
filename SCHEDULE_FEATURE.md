# 🕐 Scheduled Mint Feature

## Overview

Fitur scheduling memungkinkan Anda menjadwalkan mint NFT di waktu tertentu tanpa perlu online. Perfect untuk:
- **Allowlist/WL mints** yang buka di jam tertentu
- **Public mint** yang start di waktu spesifik
- **Multi-timezone** mint schedules

## Commands

### 1. `/schedule_mint <url> <time> [wallet_from] [wallet_to]`

Jadwalkan mint untuk waktu tertentu.

**Time Formats:**
- `22:00` - 24-hour format (10 PM hari ini/besok)
- `10:00 PM` - 12-hour format dengan AM/PM (untuk hari ini/besok saja)
- `"2024-06-13 22:00"` - Full date time (YYYY-MM-DD HH:MM) - **WAJIB pakai tanda kutip!**

**Examples:**
```
/schedule_mint https://opensea.io/collection/azuki 22:00
/schedule_mint https://opensea.io/collection/azuki 10:00 PM
/schedule_mint https://opensea.io/collection/azuki 22:00 1 5
/schedule_mint https://opensea.io/collection/azuki "2026-06-19 00:30"
/schedule_mint https://opensea.io/collection/azuki "2026-06-19 10:00 PM" 1 5
```

> ⚠️ **Penting:** Kalau pakai format full date (YYYY-MM-DD HH:MM), **WAJIB pakai tanda kutip** (`"..."`). Bot sudah support smart quotes dari mobile (" ") juga.

**Wallet Range (Optional):**
- `1` - hanya wallet #1
- `1 5` - wallet #1 sampai #5

### 2. `/list_schedules`

Lihat semua scheduled mints Anda.

**Status:**
- ⏳ Pending - menunggu waktu execute
- ✅ Executed - sudah dijalankan
- ❌ Cancelled - dibatalkan
- ⚠️ Failed - gagal execute

### 3. `/cancel_schedule <schedule_id>`

Batalkan scheduled mint (hanya bisa cancel yang PENDING).

**Example:**
```
/cancel_schedule a1b2c3d4-e5f6-7890-1234-567890abcdef
```

## How It Works

1. **Create Schedule**: Bot menyimpan schedule ke database
2. **Background Checker**: Setiap 30 detik, bot cek schedule yang sudah waktunya
3. **Auto Execute**: Schedule yang due akan otomatis diqueue ke mint worker
4. **Status Update**: Status berubah dari PENDING → EXECUTED/FAILED

## Technical Details

### Database Schema

```sql
CREATE TABLE scheduled_mints (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  url TEXT NOT NULL,
  scheduled_time DATETIME NOT NULL,
  quantity INTEGER DEFAULT 1,
  wallet_from INTEGER,
  wallet_to INTEGER,
  status TEXT DEFAULT 'PENDING',
  job_id TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  executed_at DATETIME
);
```

### Scheduler Interval

- **Check interval**: 30 seconds
- **Precision**: ±30 seconds dari scheduled time
- **Auto-start**: Scheduler starts with bot

### Time Parsing

Bot support multiple time formats:

1. **24-hour**: `22:00` → Today/tomorrow 22:00
2. **12-hour**: `10:00 PM` → Today/tomorrow 22:00
3. **Full datetime**: `"2026-06-13 22:00"` → Exact date & time (quotes required!)
4. **ISO string**: `"2024-06-13T22:00:00Z"` → UTC time (quotes required!)

If time has passed today, automatically schedules for tomorrow.

**Note:** Parser supports both regular quotes (`"`) and smart quotes (`"` `"`) from mobile keyboards.

## Usage Tips

### For Allowlist Mints

```bash
# WL mint opens at 10 PM
/schedule_mint https://opensea.io/collection/cool-nft 22:00

# Sleep, bot will mint automatically!
```

### Multiple Wallets Strategy

```bash
# Schedule wallet 1-5 untuk 10 PM
/schedule_mint https://opensea.io/collection/nft 22:00 1 5

# Schedule wallet 6-10 untuk 10:01 PM (1 minute later)
/schedule_mint https://opensea.io/collection/nft 22:01 6 10
```

### Verify Before Sleep

1. Create schedule: `/schedule_mint ...`
2. Verify: `/list_schedules`
3. Check status is "⏳ Pending"
4. Sleep! 😴

## Troubleshooting

**Q: Schedule tidak execute?**
- Check bot masih running
- Verify waktu dengan `/list_schedules`
- Check logs: `logs/combined.log`

**Q: Bisa schedule berapa mint?**
- Unlimited! Tapi realistic: 1-10 per time slot

**Q: Timezone apa yang dipakai?**
- Server timezone (check dengan `date` command)
- Untuk safety, gunakan full datetime format

**Q: Bot mati, schedule ilang?**
- No! Schedule tersimpan di database
- Ketika bot restart, scheduler akan resume

## Files Changed

1. `src/db/schema.ts` - New scheduled_mints table
2. `src/db/scheduledMints.ts` - Database operations
3. `src/scheduler/index.ts` - Background scheduler
4. `src/bot/commands/schedule.ts` - Telegram commands
5. `src/index.ts` - Start scheduler on boot

## Example Workflow

```bash
# 1. Set your preferences
/set_maxgas 0.005
/set_maxprice 0.1

# 2. Schedule WL mint for 10 PM tonight
/schedule_mint https://opensea.io/collection/azuki 22:00

# Response:
# ✅ Mint scheduled!
# ⏰ Time: 2024-06-13 22:00:00
# 🔗 URL: https://opensea.io/collection/azuki
# ID: a1b2c3d4-...

# 3. Verify
/list_schedules

# 4. Go to sleep 😴

# 5. Wake up, check result
/history
```

## Notes

- Bot harus tetap running untuk execute schedules
- Gunakan screen/tmux/pm2 untuk keep bot alive
- Database persists schedules across restarts
- Old schedules (7+ days) auto-deleted
