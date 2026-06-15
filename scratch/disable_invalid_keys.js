import pkg from '@next/env';
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import { getDB } from '../src/lib/db.js';

async function main() {
  const db = await getDB();
  const invalidIds = [47, 48, 53, 54, 125, 126];
  
  console.log('🔄 Đang vô hiệu hóa các API keys lỗi (401) trong database...');
  for (const id of invalidIds) {
    await db.run("UPDATE api_keys SET status = 0 WHERE id = ?", [id]);
    console.log(`✅ Đã tắt Key ID: ${id}`);
  }
  
  const remaining = await db.all("SELECT id, status, provider FROM api_keys WHERE status = 1");
  console.log('Các API keys còn hoạt động trong DB:', remaining);
}

main().catch(err => console.error(err));
