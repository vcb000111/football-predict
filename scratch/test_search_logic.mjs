import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function searchTavily(query, apiKey) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      api_key: apiKey.trim(),
      query: query,
      search_depth: 'basic',
      include_answer: false,
      max_results: 5
    })
  });
  if (!response.ok) {
    throw new Error(`Tavily HTTP error ${response.status}`);
  }
  return await response.json();
}

async function testSearchLogic() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Lấy key Tavily ID 7
  const keyRow = await db.get(
    `SELECT key_value FROM search_api_keys WHERE id = 7`
  );

  if (!keyRow) {
    console.log('❌ Không tìm thấy API Key Tavily ID 7');
    await db.close();
    return;
  }

  const apiKey = keyRow.key_value.trim();
  console.log(`🔑 Sử dụng API Key Tavily: ${apiKey.substring(0, 15)}...`);

  // Tạo 5 query khác nhau để ép Tavily ghi nhận request
  const queries = [
    'vietnam weather forecast next week',
    'world cup 2026 hosts stadiums information',
    'google deepmind latest ai models release 2026',
    'javascript es2025 new features specifications',
    'premier league transfer news rumors today'
  ];

  console.log('🏁 Bắt đầu gửi 5 request search song song đến Tavily...');
  try {
    const promises = queries.map(q => searchTavily(q, apiKey));
    const results = await Promise.all(promises);
    console.log('✅ Đã gọi thành công 5 request search.');
    
    // Gọi thử /usage ngay lập tức
    const usageRes = await fetch('https://api.tavily.com/usage', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const usageData = await usageRes.json();
    console.log('\n📊 Trạng thái usage ngay lập tức:', JSON.stringify(usageData, null, 2));

  } catch (err) {
    console.error('❌ Lỗi:', err.message);
  } finally {
    await db.close();
  }
}

testSearchLogic();
