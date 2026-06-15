import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import { createClient } from '@libsql/client';

loadEnvConfig(process.cwd());

async function runMigration() {
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const dbToken = process.env.TURSO_AUTH_TOKEN;

  let db;
  const isProduction = !!dbUrl;

  console.log(`🚀 Bắt đầu quá trình Migration cơ sở dữ liệu V4...`);
  console.log(`Môi trường: ${isProduction ? 'PRODUCTION (Turso DB)' : 'DEVELOPMENT (SQLite cục bộ)'}`);

  if (isProduction) {
    console.log(`Kết nối tới Turso DB: ${dbUrl}`);
    const client = createClient({
      url: dbUrl,
      authToken: dbToken
    });

    db = {
      exec: async (sql) => {
        await client.executeMultiple(sql);
      },
      run: async (sql, args = []) => {
        return await client.execute({ sql, args });
      }
    };
  } else {
    const sqlite3 = (await import('sqlite3')).default;
    const { open } = await import('sqlite');
    const path = (await import('path')).default;

    const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
  }

  console.log('Khởi tạo bảng chat_sessions...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('Bổ sung cột session_id vào assistant_chats...');
  try {
    await db.exec(`ALTER TABLE assistant_chats ADD COLUMN session_id TEXT DEFAULT NULL;`);
    console.log('✅ Đã thêm cột session_id thành công.');
  } catch (err) {
    if (err.message && (err.message.includes('duplicate column name') || err.message.includes('already exists'))) {
      console.log('ℹ️ Cột session_id đã tồn tại.');
    } else {
      console.warn('⚠️ Lỗi bổ sung cột session_id:', err.message);
    }
  }

  console.log('✅ Migration V4 thành công!');
}

runMigration().catch(err => {
  console.error('❌ Migration V4 thất bại:', err);
  process.exit(1);
});
