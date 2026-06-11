import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function POST(request) {
  try {
    const db = await getDB();
    
    // 1. Đọc các keys thô hiện tại trong database (được giải mã tự động)
    const existingApiKeysRows = await db.all("SELECT key_value FROM api_keys WHERE status = 1");
    const existingSearchKeysRows = await db.all("SELECT key_value, provider_name FROM search_api_keys WHERE status = 1");
    
    const existingGeminiKeys = new Set(existingApiKeysRows.map(row => row.key_value ? row.key_value.trim() : ''));
    const existingSearchKeys = new Set(existingSearchKeysRows.map(row => `${row.provider_name.trim()}:${row.key_value ? row.key_value.trim() : ''}`));

    const statements = [];
    let syncedGeminiCount = 0;
    let syncedSearchCount = 0;

    // 2. Quét Gemini API Keys từ biến môi trường
    const geminiKeysList = [];
    if (process.env.GEMINI_API_KEY) {
      geminiKeysList.push(process.env.GEMINI_API_KEY.trim());
    }
    const numberedKeys = Object.keys(process.env)
      .filter(key => key.startsWith('GEMINI_API_KEY_'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('GEMINI_API_KEY_', ''), 10);
        const numB = parseInt(b.replace('GEMINI_API_KEY_', ''), 10);
        return numA - numB;
      });
    numberedKeys.forEach(key => {
      if (process.env[key]) {
        geminiKeysList.push(process.env[key].trim());
      }
    });

    const uniqueGeminiKeys = Array.from(new Set(geminiKeysList));
    for (const key of uniqueGeminiKeys) {
      // Chỉ thêm nếu key thô chưa tồn tại trong database
      if (!existingGeminiKeys.has(key)) {
        statements.push({
          sql: `INSERT OR IGNORE INTO api_keys (key_value, status, provider) VALUES (?, 1, 'gemini')`,
          args: [key]
        });
        syncedGeminiCount++;
      }
    }

    // 3. Quét Search API Keys từ biến môi trường
    const searchKeys = [
      { provider: 'tavily', envVar: 'TAVILY_API_KEY' },
      { provider: 'brave', envVar: 'BRAVE_SEARCH_API_KEY' },
      { provider: 'serper', envVar: 'SERPER_API_KEY' }
    ];
    for (const item of searchKeys) {
      const keyValue = process.env[item.envVar];
      if (keyValue && keyValue.trim()) {
        const key = keyValue.trim();
        const searchKeyCombo = `${item.provider}:${key}`;
        
        // Chỉ thêm nếu cặp (provider, key thô) chưa tồn tại trong database
        if (!existingSearchKeys.has(searchKeyCombo)) {
          statements.push({
            sql: `INSERT OR IGNORE INTO search_api_keys (provider_name, key_value, status) VALUES (?, ?, 1)`,
            args: [item.provider, key]
          });
          syncedSearchCount++;
        }
      }
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    return NextResponse.json({
      success: true,
      message: `Đồng bộ thành công. Đã thêm ${syncedGeminiCount} Gemini keys mới và ${syncedSearchCount} Search API keys mới. Các keys trùng lặp đã được bỏ qua.`
    });
  } catch (error) {
    console.error('Lỗi khi đồng bộ API keys từ biến môi trường:', error);
    return NextResponse.json(
      { error: 'Đồng bộ thất bại', details: error.message },
      { status: 500 }
    );
  }
}
