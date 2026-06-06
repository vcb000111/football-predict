import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

let dbInstance = null;

export async function getDB() {
  if (dbInstance) return dbInstance;
  
  // Khởi tạo file database trong thư mục gốc của dự án
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  
  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  
  // Tạo bảng lưu trữ lịch sử dự đoán nếu chưa tồn tại
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT,
      home_team TEXT,
      away_team TEXT,
      predicted_home_score INTEGER,
      predicted_away_score INTEGER,
      win_prob_home INTEGER,
      win_prob_draw INTEGER,
      win_prob_away INTEGER,
      recommendation_1x2 TEXT,
      recommendation_ou TEXT,
      recommendation_handicap TEXT,
      actual_home_score INTEGER DEFAULT NULL,
      actual_away_score INTEGER DEFAULT NULL,
      is_correct INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Thực hiện migration bổ sung các cột đánh giá kèo nếu chưa tồn tại
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN is_correct_ou INTEGER DEFAULT NULL`);
  } catch (e) {
    // Cột đã tồn tại, bỏ qua lỗi
  }
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN is_correct_handicap INTEGER DEFAULT NULL`);
  } catch (e) {
    // Cột đã tồn tại, bỏ qua lỗi
  }
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN bet_evaluation_details TEXT DEFAULT NULL`);
  } catch (e) {
    // Cột đã tồn tại, bỏ qua lỗi
  }
  
  // Migrations cho các kèo phụ dễ ăn
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN recommendation_btts TEXT DEFAULT NULL`);
  } catch (e) {}
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN recommendation_corners TEXT DEFAULT NULL`);
  } catch (e) {}
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN recommendation_cards TEXT DEFAULT NULL`);
  } catch (e) {}
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN is_correct_btts INTEGER DEFAULT NULL`);
  } catch (e) {}
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN is_correct_corners INTEGER DEFAULT NULL`);
  } catch (e) {}
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN is_correct_cards INTEGER DEFAULT NULL`);
  } catch (e) {}
  
  try {
    await dbInstance.exec(`ALTER TABLE predictions ADD COLUMN raw_prediction_json TEXT DEFAULT NULL`);
  } catch (e) {}
  
  // Tạo bảng api_keys
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_value TEXT UNIQUE,
      status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tạo bảng ai_models
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS ai_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_name TEXT UNIQUE,
      priority INTEGER DEFAULT 1,
      status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed dữ liệu mặc định cho ai_models nếu bảng trống
  const modelsCount = await dbInstance.get(`SELECT COUNT(*) as count FROM ai_models`);
  if (modelsCount.count === 0) {
    const defaultModels = [
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite'
    ];
    for (let i = 0; i < defaultModels.length; i++) {
      await dbInstance.run(
        `INSERT OR IGNORE INTO ai_models (model_name, priority, status) VALUES (?, ?, 1)`,
        [defaultModels[i], i + 1]
      );
    }
    console.log('🌱 Seeded default AI models successfully.');
  }

  // Seed dữ liệu mặc định cho api_keys từ biến môi trường nếu bảng trống
  const keysCount = await dbInstance.get(`SELECT COUNT(*) as count FROM api_keys`);
  if (keysCount.count === 0) {
    const apiKeysList = [];
    if (process.env.GEMINI_API_KEY) {
      apiKeysList.push(process.env.GEMINI_API_KEY.trim());
    }
    if (process.env.GEMINI_API_KEYS) {
      const splitKeys = process.env.GEMINI_API_KEYS.split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      apiKeysList.push(...splitKeys);
    }
    const numberedKeys = Object.keys(process.env)
      .filter((key) => key.startsWith('GEMINI_API_KEY_'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('GEMINI_API_KEY_', ''), 10);
        const numB = parseInt(b.replace('GEMINI_API_KEY_', ''), 10);
        return numA - numB;
      });
    numberedKeys.forEach((key) => {
      if (process.env[key]) {
        apiKeysList.push(process.env[key].trim());
      }
    });

    const uniqueKeys = Array.from(new Set(apiKeysList));
    for (const key of uniqueKeys) {
      await dbInstance.run(
        `INSERT OR IGNORE INTO api_keys (key_value, status) VALUES (?, 1)`,
        [key]
      );
    }
    if (uniqueKeys.length > 0) {
      console.log(`🌱 Imported ${uniqueKeys.length} API keys from environment variables successfully.`);
    }
  }

  // Tạo bảng search_providers
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS search_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_name TEXT UNIQUE,
      priority INTEGER DEFAULT 1,
      status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tạo bảng search_api_keys
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS search_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_name TEXT,
      key_value TEXT,
      status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider_name, key_value)
    )
  `);

  // Seed dữ liệu mặc định cho search_providers nếu bảng trống
  const providersCount = await dbInstance.get(`SELECT COUNT(*) as count FROM search_providers`);
  if (providersCount.count === 0) {
    const defaultProviders = [
      { name: 'tavily', priority: 1 },
      { name: 'brave', priority: 2 },
      { name: 'serper', priority: 3 }
    ];
    for (const provider of defaultProviders) {
      await dbInstance.run(
        `INSERT OR IGNORE INTO search_providers (provider_name, priority, status) VALUES (?, ?, 1)`,
        [provider.name, provider.priority]
      );
    }
    console.log('🌱 Seeded default search providers successfully.');
  }

  // Seed dữ liệu mặc định cho search_api_keys từ biến môi trường nếu bảng trống
  const searchKeysCount = await dbInstance.get(`SELECT COUNT(*) as count FROM search_api_keys`);
  if (searchKeysCount.count === 0) {
    const defaultKeys = [
      { provider: 'tavily', envVar: 'TAVILY_API_KEY' },
      { provider: 'brave', envVar: 'BRAVE_SEARCH_API_KEY' },
      { provider: 'serper', envVar: 'SERPER_API_KEY' }
    ];
    for (const item of defaultKeys) {
      const keyValue = process.env[item.envVar];
      if (keyValue && keyValue.trim()) {
        await dbInstance.run(
          `INSERT OR IGNORE INTO search_api_keys (provider_name, key_value, status) VALUES (?, ?, 1)`,
          [item.provider, keyValue.trim()]
        );
        console.log(`🌱 Imported ${item.provider} API key from environment variable.`);
      }
    }
  }

  return dbInstance;
}
