/**
 * Helper để gọi REST API của Groq Cloud trực tiếp bằng fetch
 */
export async function callGroqModel(model, apiKeys, prompt) {
  let lastError = null;
  for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const currentKey = apiKeys[keyIdx];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000); // Timeout sau 35 giây
      
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { 
              role: 'user', 
              content: prompt 
            }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errText}`);
      }
      
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      
      return {
        response: { text },
        modelUsed: model,
        keyIndexUsed: keyIdx
      };
    } catch (err) {
      console.warn(`⚠️ [Groq Call] Model ${model} thất bại với Key #${keyIdx + 1}:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error(`Tất cả keys đều thất bại cho model Groq ${model}`);
}
