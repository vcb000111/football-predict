import pkg from '@next/env';
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import { getDB } from '../src/lib/db.js';
import { GoogleGenAI } from '@google/genai';

async function main() {
  const db = await getDB();
  const apiKeys = await db.all("SELECT id, status, provider, key_value FROM api_keys WHERE status = 1 AND (provider = 'gemini' OR provider IS NULL)");
  console.log(`Tìm thấy ${apiKeys.length} keys active trong DB.`);

  for (const k of apiKeys) {
    const key = k.key_value;
    let nonStreamOk = false;
    let streamOk = false;

    // Test non-stream
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'Ping' }] }]
      });
      if (response.text) {
        nonStreamOk = true;
      }
    } catch (err) {
      console.log(`  ID ${k.id} test non-stream lỗi:`, err.message);
    }

    // Test stream
    if (nonStreamOk) {
      try {
        const ai = new GoogleGenAI({ apiKey: key });
        const responseStream = await ai.models.generateContentStream({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: 'Ping' }] }]
        });
        for await (const chunk of responseStream) {
          if (chunk.text) {
            streamOk = true;
            break;
          }
        }
      } catch (err) {
        // Chỉ ghi nhận lỗi stream
      }
    }

    console.log(`Key ID ${k.id}: Non-Stream = ${nonStreamOk ? 'OK' : 'FAIL'}, Stream = ${streamOk ? 'OK' : 'FAIL'}`);

    if (!nonStreamOk) {
      console.log(`❌ Vô hiệu hóa Key ID ${k.id} vì lỗi hoàn toàn...`);
      await db.run("UPDATE api_keys SET status = 0 WHERE id = ?", [k.id]);
    }
  }

  const remaining = await db.all("SELECT id, provider FROM api_keys WHERE status = 1 AND (provider = 'gemini' OR provider IS NULL)");
  console.log('Các API keys Gemini còn hoạt động:', remaining);
}

main().catch(err => console.error(err));
