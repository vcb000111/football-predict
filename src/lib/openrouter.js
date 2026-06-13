/**
 * Helper để gọi REST API của OpenRouter Cloud trực tiếp bằng fetch
 */
export async function callOpenRouterModel(model, apiKeys, prompt) {
  let lastError = null;
  for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const currentKey = apiKeys[keyIdx];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // Timeout sau 45 giây cho OpenRouter (Free models)
      
      let response;
      let usedJsonMode = true;

      try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentKey.trim()}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://football-predict.com',
            'X-Title': 'Football Predictor AI'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { 
                role: 'user', 
                content: prompt 
              }
            ],
            temperature: 0,
            response_format: { type: 'json_object' }
          }),
          signal: controller.signal
        });
      } catch (fetchErr) {
        throw fetchErr;
      }

      // Xử lý Fallback nếu lỗi HTTP 400 do không hỗ trợ response_format JSON Mode
      if (response.status === 400) {
        const errText = await response.clone().text();
        if (errText.toLowerCase().includes('response_format') || errText.toLowerCase().includes('json')) {
          console.warn(`⚠️ [OpenRouter Call] Model ${model} không hỗ trợ JSON Mode, kích hoạt Fallback gọi text thô...`);
          usedJsonMode = false;
          
          // Thử lại không có response_format
          response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${currentKey.trim()}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://football-predict.com',
              'X-Title': 'Football Predictor AI'
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { 
                  role: 'user', 
                  content: prompt 
                }
              ],
              temperature: 0
            }),
            signal: controller.signal
          });
        }
      }

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
      }
      
      const data = await response.json();
      let text = data.choices?.[0]?.message?.content || '';
      
      return {
        response: { text },
        modelUsed: model,
        keyIndexUsed: keyIdx,
        usedJsonMode
      };
    } catch (err) {
      console.warn(`⚠️ [OpenRouter Call] Model ${model} thất bại với Key #${keyIdx + 1}:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error(`Tất cả keys đều thất bại cho model OpenRouter ${model}`);
}
