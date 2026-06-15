import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';

// Đọc file .env.local thủ công để lấy credentials
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.trim().split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    env[key] = value;
  }
});

const url = env.TURSO_DATABASE_URL;
const authToken = env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('Không tìm thấy TURSO_DATABASE_URL trong .env.local');
  process.exit(1);
}

console.log('🔗 Đang kết nối tới Turso DB:', url);
const client = createClient({ url, authToken });

async function main() {
  try {
    const res = await client.execute('SELECT * FROM system_prompts');
    const rows = res.rows;
    console.log(`📥 Đã tải ${rows.length} bản ghi cấu hình prompts.`);
    
    // Đường dẫn backup
    const backupDir = path.join(process.cwd(), 'scratch');
    const backupPath = path.join(backupDir, 'system_prompts_backup.json');
    
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2), 'utf8');
    console.log('💾 Đã lưu file backup an toàn tại:', backupPath);
  } catch (err) {
    console.error('❌ Lỗi khi thực hiện backup:', err.message);
    process.exit(1);
  } finally {
    // Đóng client
    if (client.close) client.close();
  }
}

main();
