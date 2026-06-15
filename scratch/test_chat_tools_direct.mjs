import pkg from '@next/env';
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import { getDB } from '../src/lib/db.js';
import { GoogleGenAI } from '@google/genai';
import { chatboxToolsDeclarations } from '../src/lib/chat-tools.js';

async function test() {
  const db = await getDB();
  const apiKeys = await db.all("SELECT id, status, provider, key_value FROM api_keys WHERE status = 1 AND provider = 'gemini' LIMIT 1");
  if (apiKeys.length === 0) {
    console.error('Không tìm thấy Gemini key nào.');
    return;
  }
  const key = apiKeys[0].key_value;
  const activeModelsRows = await db.all(
    "SELECT model_name FROM ai_models WHERE status = 1 AND provider = 'gemini' ORDER BY priority ASC"
  );
  const activeModel = activeModelsRows[0]?.model_name || 'gemini-2.5-flash';

  console.log(`Kiểm thử với Key ID: ${apiKeys[0].id}, Model: ${activeModel}`);

  const ai = new GoogleGenAI({ apiKey: key });

  try {
    const response = await ai.models.generateContent({
      model: activeModel,
      contents: [{ role: 'user', parts: [{ text: 'Đức đá trận tiếp theo khi nào?' }] }],
      config: {
        tools: chatboxToolsDeclarations
      }
    });
    console.log('✅ Kết quả gọi API với Tools thành công!');
    console.log('Phản hồi text:', response.text);
    console.log('Function Calls:', JSON.stringify(response.functionCalls, null, 2));
  } catch (err) {
    console.error('❌ Lỗi gọi API với Tools:', err);
  }
}

test().catch(err => console.error(err));
