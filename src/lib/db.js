import { createClient } from '@libsql/client';

let dbInstance = null;

export async function getDB() {
  if (dbInstance) return dbInstance;

  const isProduction = process.env.NODE_ENV === 'production' || process.env.TURSO_DATABASE_URL;

  if (isProduction) {
    console.log('⚡ [DB INITIALIZATION] Sử dụng Turso DB (libSQL HTTP)...');
    
    if (!process.env.TURSO_DATABASE_URL) {
      throw new Error('Thiếu biến môi trường TURSO_DATABASE_URL cho kết nối database production.');
    }

    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN || ''
    });

    // Đối tượng adapter tương thích ngược với API sqlite hiện tại
    dbInstance = {
      get: async (sql, params = []) => {
        const res = await client.execute({ sql, args: params });
        return res.rows[0];
      },
      all: async (sql, params = []) => {
        const res = await client.execute({ sql, args: params });
        return res.rows;
      },
      run: async (sql, params = []) => {
        if (sql.toUpperCase().includes('TRANSACTION') || sql.toUpperCase().includes('COMMIT') || sql.toUpperCase().includes('ROLLBACK')) {
          console.warn('⚠️ Giao dịch thô qua db.run() không hoạt động trên HTTP Client. Sử dụng db.batch() thay thế.');
        }
        const res = await client.execute({ sql, args: params });
        return {
          lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : null,
          changes: res.rowsAffected
        };
      },
      exec: async (sql) => {
        await client.executeMultiple(sql);
      },
      batch: async (statements) => {
        const formattedStatements = statements.map(stmt => {
          if (typeof stmt === 'string') {
            return { sql: stmt, args: [] };
          }
          return { sql: stmt.sql, args: stmt.args || [] };
        });
        return await client.batch(formattedStatements, 'write');
      }
    };
  } else {
    console.log('💻 [DB INITIALIZATION] Sử dụng SQLite cục bộ (Dynamic Import)...');
    
    // Dynamic import các gói native SQLite để tránh Vercel cố gắng bundle chúng khi chạy build
    const sqlite3 = (await import('sqlite3')).default;
    const { open } = (await import('sqlite'));
    const path = (await import('path')).default;

    const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
    
    const localDb = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Tạo bảng lưu trữ lịch sử dự đoán nếu chưa tồn tại
    await localDb.exec(`
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
        tournament TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Thực hiện migration bổ sung các cột đánh giá kèo nếu chưa tồn tại
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN is_correct_ou INTEGER DEFAULT NULL`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN is_correct_handicap INTEGER DEFAULT NULL`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN bet_evaluation_details TEXT DEFAULT NULL`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN recommendation_btts TEXT DEFAULT NULL`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN recommendation_corners TEXT DEFAULT NULL`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN recommendation_cards TEXT DEFAULT NULL`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN is_correct_btts INTEGER DEFAULT NULL`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN is_correct_corners INTEGER DEFAULT NULL`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN is_correct_cards INTEGER DEFAULT NULL`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN raw_prediction_json TEXT DEFAULT NULL`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN ou_line REAL DEFAULT 2.5`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN corners_line REAL DEFAULT 8.5`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN cards_line REAL DEFAULT 3.5`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE predictions ADD COLUMN handicap_line REAL DEFAULT 0.0`);
    } catch (e) {}
    
    // Tạo bảng api_keys
    await localDb.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_value TEXT UNIQUE,
        status INTEGER DEFAULT 1,
        provider TEXT DEFAULT 'gemini',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tạo bảng ai_models
    await localDb.exec(`
      CREATE TABLE IF NOT EXISTS ai_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name TEXT UNIQUE,
        priority INTEGER DEFAULT 1,
        status INTEGER DEFAULT 1,
        provider TEXT DEFAULT 'gemini',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      await localDb.exec(`ALTER TABLE api_keys ADD COLUMN provider TEXT DEFAULT 'gemini'`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE ai_models ADD COLUMN provider TEXT DEFAULT 'gemini'`);
    } catch (e) {}

    // Tạo bảng ai_lessons lưu trữ bài học rút kinh nghiệm
    await localDb.exec(`
      CREATE TABLE IF NOT EXISTS ai_lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT,
        team_name TEXT,
        bet_type TEXT,
        lesson_content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed dữ liệu mặc định cho ai_models nếu bảng trống
    const modelsCount = await localDb.get(`SELECT COUNT(*) as count FROM ai_models`);
    if (modelsCount.count === 0) {
      const defaultModels = [
        { name: 'gemini-3.5-flash', provider: 'gemini' },
        { name: 'gemini-3-flash-preview', provider: 'gemini' },
        { name: 'gemini-3.1-flash-lite', provider: 'gemini' },
        { name: 'gemini-2.5-flash', provider: 'gemini' },
        { name: 'gemini-2.5-flash-lite', provider: 'gemini' },
        { name: 'llama-3.1-8b-instant', provider: 'groq' },
        { name: 'gemma2-9b-it', provider: 'groq' },
        { name: 'llama-3.3-70b-specdec', provider: 'groq' }
      ];
      for (let i = 0; i < defaultModels.length; i++) {
        await localDb.run(
          `INSERT OR IGNORE INTO ai_models (model_name, priority, status, provider) VALUES (?, ?, 1, ?)`,
          [defaultModels[i].name, i + 1, defaultModels[i].provider]
        );
      }
    }

    // Seed dữ liệu mặc định cho api_keys từ biến môi trường nếu bảng trống
    const keysCount = await localDb.get(`SELECT COUNT(*) as count FROM api_keys`);
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
        await localDb.run(
          `INSERT OR IGNORE INTO api_keys (key_value, status) VALUES (?, 1)`,
          [key]
        );
      }
    }

    // Tạo bảng search_providers
    await localDb.exec(`
      CREATE TABLE IF NOT EXISTS search_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_name TEXT UNIQUE,
        priority INTEGER DEFAULT 1,
        status INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tạo bảng search_api_keys
    await localDb.exec(`
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
    const providersCount = await localDb.get(`SELECT COUNT(*) as count FROM search_providers`);
    if (providersCount.count === 0) {
      const defaultProviders = [
        { name: 'tavily', priority: 1 },
        { name: 'brave', priority: 2 },
        { name: 'serper', priority: 3 }
      ];
      for (const provider of defaultProviders) {
        await localDb.run(
          `INSERT OR IGNORE INTO search_providers (provider_name, priority, status) VALUES (?, ?, 1)`,
          [provider.name, provider.priority]
        );
      }
    }

    // Seed dữ liệu mặc định cho search_api_keys từ biến môi trường nếu bảng trống
    const searchKeysCount = await localDb.get(`SELECT COUNT(*) as count FROM search_api_keys`);
    if (searchKeysCount.count === 0) {
      const defaultKeys = [
        { provider: 'tavily', envVar: 'TAVILY_API_KEY' },
        { provider: 'brave', envVar: 'BRAVE_SEARCH_API_KEY' },
        { provider: 'serper', envVar: 'SERPER_API_KEY' }
      ];
      for (const item of defaultKeys) {
        const keyValue = process.env[item.envVar];
        if (keyValue && keyValue.trim()) {
          await localDb.run(
            `INSERT OR IGNORE INTO search_api_keys (provider_name, key_value, status) VALUES (?, ?, 1)`,
            [item.provider, keyValue.trim()]
          );
        }
      }
    }

    // Tạo bảng teams
    await localDb.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_name TEXT UNIQUE,
        fifa_rank INTEGER,
        elo_rating INTEGER,
        recent_form TEXT,
        avg_goals_scored REAL,
        avg_goals_conceded REAL,
        avg_corners_won REAL DEFAULT 4.5,
        avg_corners_conceded REAL DEFAULT 4.5,
        avg_cards_received REAL DEFAULT 1.8,
        style_of_play TEXT DEFAULT 'Cân bằng',
        key_players TEXT,
        tactical_analysis TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migrations cho bảng teams nếu đã tồn tại trước đó
    try {
      await localDb.exec(`ALTER TABLE teams ADD COLUMN avg_corners_won REAL DEFAULT 4.5`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE teams ADD COLUMN avg_corners_conceded REAL DEFAULT 4.5`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE teams ADD COLUMN avg_cards_received REAL DEFAULT 1.8`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE teams ADD COLUMN style_of_play TEXT DEFAULT 'Cân bằng'`);
    } catch (e) {}

    // Tạo bảng system_prompts
    await localDb.exec(`
      CREATE TABLE IF NOT EXISTS system_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt_key TEXT UNIQUE,
        prompt_content TEXT,
        description TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Thêm hàm batch thích ứng cho SQLite cục bộ
    localDb.batch = async function(statements) {
      await this.run('BEGIN TRANSACTION');
      try {
        for (const stmt of statements) {
          if (typeof stmt === 'string') {
            await this.run(stmt);
          } else {
            await this.run(stmt.sql, stmt.args || []);
          }
        }
        await this.run('COMMIT');
      } catch (err) {
        await this.run('ROLLBACK');
        throw err;
      }
    };

    dbInstance = localDb;
  }

  return dbInstance;
}
