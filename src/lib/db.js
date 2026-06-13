import { createClient } from '@libsql/client';
import crypto from 'crypto';

let dbInstance = null;

// --- CƠ CHẾ BẢO MẬT & MÃ HÓA API KEYS (AES-256-GCM) ---
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

// Cấu trúc Obfuscate cũ để tương thích ngược
const OBFUSCATE_PREFIX = "f_p_";
const OBFUSCATE_SUFFIX = "_c_t";

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_SECRET || 'default_encryption_secret_football_predict_2026';
  // Sử dụng scryptSync để tạo khóa 32 bytes từ secret
  return crypto.scryptSync(secret, 'salt_football_predict', 32);
}

function obfuscateKey(key) {
  if (!key) return key;
  try {
    // Nếu khóa đã ở định dạng mã hóa AES-256-GCM mới, không mã hóa lại
    if (typeof key === 'string' && key.split(':').length === 3) {
      return key;
    }
    const keyBuffer = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
    
    let encrypted = cipher.update(key, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Trả về định dạng: iv_hex:encrypted_hex:authTag_hex
    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
  } catch (err) {
    console.error('Lỗi mã hóa API key:', err);
    return key;
  }
}

// Export hàm giải mã để các endpoint bảo mật khác (như API decrypt) có thể sử dụng trực tiếp
export function deobfuscateKey(obfuscatedKey) {
  if (!obfuscatedKey) return obfuscatedKey;
  try {
    const parts = obfuscatedKey.split(':');
    if (parts.length !== 3) {
      // Nếu không phải định dạng iv:encrypted:authTag, thử giải mã theo Base64 cũ
      return deobfuscateOldKey(obfuscatedKey);
    }
    
    const [ivHex, encryptedHex, authTagHex] = parts;
    const keyBuffer = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.warn('⚠️ Lỗi giải mã AES (có thể do xoay vòng khóa ENCRYPTION_SECRET). Fallback về key thô:', err.message);
    return deobfuscateOldKey(obfuscatedKey);
  }
}

function deobfuscateOldKey(obfuscatedKey) {
  try {
    const decoded = Buffer.from(obfuscatedKey, 'base64').toString('utf-8');
    if (decoded.startsWith(OBFUSCATE_PREFIX) && decoded.endsWith(OBFUSCATE_SUFFIX)) {
      return decoded.slice(OBFUSCATE_PREFIX.length, -OBFUSCATE_SUFFIX.length);
    }
  } catch (e) {
    // Không giải mã được Base64 cũ, coi như key thô
  }
  return obfuscatedKey;
}

function obfuscateParams(sql, args) {
  if (!args || args.length === 0) return args;
  const cleanSql = sql.toLowerCase();
  
  // Chỉ can thiệp khi ghi (INSERT/UPDATE) vào các bảng chứa API keys
  if (cleanSql.includes('api_keys') || cleanSql.includes('search_api_keys')) {
    if (cleanSql.includes('insert') || cleanSql.includes('update')) {
      const newArgs = [...args];
      
      // Đối với search_api_keys INSERT: args[1] (key_value) là khóa cần mã hóa
      if (cleanSql.includes('search_api_keys') && cleanSql.includes('insert')) {
        if (typeof newArgs[1] === 'string') newArgs[1] = obfuscateKey(newArgs[1]);
      } else {
        // Đối với api_keys INSERT/UPDATE và search_api_keys UPDATE: args[0] (key_value) là khóa cần mã hóa
        if (typeof newArgs[0] === 'string') newArgs[0] = obfuscateKey(newArgs[0]);
      }
      return newArgs;
    }
  }
  return args;
}

function deobfuscateRow(row) {
  if (!row) return row;
  if (typeof row === 'object') {
    if ('key_value' in row && typeof row.key_value === 'string') {
      row.key_value = deobfuscateKey(row.key_value);
    }
  }
  return row;
}

function deobfuscateRows(rows) {
  if (!rows) return rows;
  if (Array.isArray(rows)) {
    return rows.map(deobfuscateRow);
  }
  return deobfuscateRow(rows);
}

// Hàm bọc (Wrapper) để tự động hóa quá trình mã hóa/giải mã API Keys
function wrapDbWithObfuscation(db) {
  const originalGet = db.get.bind(db);
  const originalAll = db.all.bind(db);
  const originalRun = db.run.bind(db);

  db.get = async (sql, params = [], options = {}) => {
    let actualParams = params;
    let actualOptions = options;
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      actualOptions = params;
      actualParams = [];
    }

    const res = await originalGet(sql, actualParams);
    if (actualOptions.raw) {
      return res;
    }
    return deobfuscateRow(res);
  };

  db.all = async (sql, params = [], options = {}) => {
    let actualParams = params;
    let actualOptions = options;
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      actualOptions = params;
      actualParams = [];
    }

    const res = await originalAll(sql, actualParams);
    if (actualOptions.raw) {
      return res;
    }
    return deobfuscateRows(res);
  };

  db.run = async (sql, params = []) => {
    const interceptedParams = obfuscateParams(sql, params);
    return await originalRun(sql, interceptedParams);
  };


  if (db.batch) {
    const originalBatch = db.batch.bind(db);
    db.batch = async (statements) => {
      const interceptedStatements = statements.map(stmt => {
        let sqlStr = typeof stmt === 'string' ? stmt : stmt.sql;
        let sqlArgs = typeof stmt === 'string' ? [] : (stmt.args || []);
        return {
          sql: sqlStr,
          args: obfuscateParams(sqlStr, sqlArgs)
        };
      });
      return await originalBatch(interceptedStatements);
    };
  }

  return db;
}

// --- KHỞI TẠO KẾT NỐI DATABASE ---
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

    const rawAdapter = {
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

    dbInstance = wrapDbWithObfuscation(rawAdapter);
  } else {
    console.log('💻 [DB INITIALIZATION] Sử dụng SQLite cục bộ (Dynamic Import)...');
    
    const sqlite3 = (await import('sqlite3')).default;
    const { open } = (await import('sqlite'));
    const path = (await import('path')).default;

    const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
    
    const localDb = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Tạo bảng nếu chưa tồn tại
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

    // Thực hiện migrations bổ sung cột
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
    
    await localDb.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_value TEXT UNIQUE,
        status INTEGER DEFAULT 1,
        provider TEXT DEFAULT 'gemini',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await localDb.exec(`
      CREATE TABLE IF NOT EXISTS ai_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name TEXT UNIQUE,
        priority INTEGER DEFAULT 1,
        status INTEGER DEFAULT 1,
        provider TEXT DEFAULT 'gemini',
        supports_image INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      await localDb.exec(`ALTER TABLE api_keys ADD COLUMN provider TEXT DEFAULT 'gemini'`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE ai_models ADD COLUMN provider TEXT DEFAULT 'gemini'`);
    } catch (e) {}
    try {
      await localDb.exec(`ALTER TABLE ai_models ADD COLUMN supports_image INTEGER DEFAULT 0`);
    } catch (e) {}

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

    await localDb.exec(`
      CREATE TABLE IF NOT EXISTS search_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_name TEXT UNIQUE,
        priority INTEGER DEFAULT 1,
        status INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    // Seed search_providers
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

    await localDb.exec(`
      CREATE TABLE IF NOT EXISTS system_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt_key TEXT UNIQUE,
        prompt_content TEXT,
        description TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await localDb.exec(`
      CREATE TABLE IF NOT EXISTS tournament_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament TEXT,
        season TEXT,
        group_name TEXT,
        team_name TEXT,
        UNIQUE(tournament, season, group_name, team_name)
      )
    `);

    await localDb.exec(`
      CREATE TABLE IF NOT EXISTS fixtures (
        id TEXT PRIMARY KEY,
        home_team TEXT,
        away_team TEXT,
        match_date TEXT,
        match_time TEXT,
        group_name TEXT,
        venue TEXT,
        tournament TEXT,
        season TEXT,
        actual_home_score INTEGER DEFAULT NULL,
        actual_away_score INTEGER DEFAULT NULL,
        actual_first_half_home_score INTEGER DEFAULT NULL,
        actual_first_half_away_score INTEGER DEFAULT NULL,
        is_test INTEGER DEFAULT 0
      )
    `);

    try {
      await localDb.exec(`ALTER TABLE fixtures ADD COLUMN is_test INTEGER DEFAULT 0`);
    } catch (e) {}

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

    dbInstance = wrapDbWithObfuscation(localDb);
  }

  return dbInstance;
}
