import { db } from './index';

export interface UserSettings {
  max_mint_price_eth: string;
  max_gas_eth: string;
  quantity: number;
}

export interface User {
  id: number;
  telegram_id: string;
  username: string | null;
  settings_json: string;
  created_at: string;
}

export function getOrCreateUser(telegramId: string, username?: string): User {
  const existing = db
    .prepare('SELECT * FROM users WHERE telegram_id = ?')
    .get(telegramId) as User | undefined;

  if (existing) {
    if (username && existing.username !== username) {
      db.prepare('UPDATE users SET username = ? WHERE telegram_id = ?').run(username, telegramId);
      existing.username = username;
    }
    return existing;
  }

  db.prepare(
    'INSERT INTO users (telegram_id, username, settings_json) VALUES (?, ?, ?)'
  ).run(telegramId, username ?? null, '{}');

  return db
    .prepare('SELECT * FROM users WHERE telegram_id = ?')
    .get(telegramId) as User;
}

export function getUserSettings(telegramId: string, defaults: UserSettings): UserSettings {
  const user = db
    .prepare('SELECT settings_json FROM users WHERE telegram_id = ?')
    .get(telegramId) as { settings_json: string } | undefined;

  if (!user) return defaults;

  try {
    const parsed = JSON.parse(user.settings_json) as Partial<UserSettings>;
    return {
      max_mint_price_eth: parsed.max_mint_price_eth ?? defaults.max_mint_price_eth,
      max_gas_eth: parsed.max_gas_eth ?? defaults.max_gas_eth,
      quantity: parsed.quantity ?? defaults.quantity,
    };
  } catch {
    return defaults;
  }
}

export function updateUserSettings(
  telegramId: string,
  updates: Partial<UserSettings>,
  defaults: UserSettings
): UserSettings {
  const current = getUserSettings(telegramId, defaults);
  const merged = { ...current, ...updates };
  db.prepare('UPDATE users SET settings_json = ? WHERE telegram_id = ?').run(
    JSON.stringify(merged),
    telegramId
  );
  return merged;
}
