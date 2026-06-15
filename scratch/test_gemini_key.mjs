import pkg from '@next/env';
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import { GoogleGenAI } from '@google/genai';

async function testKey() {
  const key = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_1;
  console.log('🔑 Sử dụng Key:', key ? key.substring(0, 15) + '...' : 'KHÔNG CÓ KEY');
  if (!key) return;

  try {
    console.log('🔄 Đang gửi request kiểm thử tới Gemini...');
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
    });
    console.log('✅ Kết nối thành công! Phản hồi từ Gemini:', response.text);
  } catch (err) {
    console.error('❌ Chi tiết lỗi Gemini API:', err);
  }
}

testKey();
