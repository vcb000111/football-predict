export function saveLastUsedModel(modelId) {
  if (typeof window !== 'undefined' && modelId) {
    localStorage.setItem('last_gemini_model_used', modelId);
    // Dispatch a custom event so other components (like ModelBadge) can listen to it
    window.dispatchEvent(new Event('last-model-used-changed'));
  }
}

export function getLastUsedModel() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('last_gemini_model_used');
  }
  return null;
}

export function formatModelName(modelId) {
  if (!modelId) return 'Google Gemini';

  const trimmedModel = modelId.trim();
  const lowerModel = trimmedModel.toLowerCase();

  if (lowerModel.includes('mock') || lowerModel.includes('giả lập') || lowerModel.includes('dự phòng')) {
    return 'Dự phòng / Mock';
  }

  // 1. Phân tích định dạng Consensus đa tác nhân mới:
  // "gemini-3.1-flash-lite (Critic Phản Biện) + [Gemini: gemini-3.1-flash-lite / OpenRouter: meta-llama/llama-3.3-70b-instruct:free]"
  // Hoặc "gemini-3.1-flash-lite (Critic Phản Biện) + [Gemini: gemini-3.1-flash-lite]"
  if (trimmedModel.includes('Critic Phản Biện') || trimmedModel.includes('Consensus')) {
    const isMultiAgent = trimmedModel.includes('OpenRouter:');

    // Trích xuất tên model Gemini Critic chính
    let criticName = 'Gemini';
    const criticMatch = trimmedModel.match(/^(gemini-[a-zA-Z0-9\.\-]+)/);
    if (criticMatch && criticMatch[1]) {
      criticName = formatSimpleModelName(criticMatch[1]);
    }

    if (isMultiAgent) {
      // Trích xuất tên model OpenRouter
      let openRouterName = 'OpenRouter';
      const openRouterMatch = trimmedModel.match(/OpenRouter:\s*([a-zA-Z0-9\.\-\/:_]+)/);
      if (openRouterMatch && openRouterMatch[1]) {
        openRouterName = formatSimpleModelName(openRouterMatch[1]);
      }
      return `Đa tác nhân: ${criticName} (Critic) + ${openRouterName}`;
    } else {
      return `Đơn tác nhân: ${criticName} (Critic)`;
    }
  }

  // 2. Định dạng cũ: "gemini-3.1-flash-lite (Tác nhân phản biện tinh chỉnh)"
  if (trimmedModel.includes('(Tác nhân phản biện tinh chỉnh)')) {
    const rawId = trimmedModel.replace(/\s*\(Tác nhân phản biện tinh chỉnh\)/gi, '').trim();
    return `Phản biện: ${formatSimpleModelName(rawId)}`;
  }

  // 3. Fallback thông thường
  return formatSimpleModelName(trimmedModel);
}

// Helper format tên model đơn giản
function formatSimpleModelName(modelId) {
  const id = modelId.replace(/^models\//, '').trim();
  const mappings = {
    // 'gemini-3.5-flash': 'Gemini 3.5 Flash',
    // 'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
    // 'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
    // 'gemini-2.5-flash': 'Gemini 2.5 Flash',
    // 'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
    // 'meta-llama/llama-3.3-70b-instruct:free': 'OpenRouter Llama 3.3 70B (Free)',
    // 'meta-llama/llama-3.1-8b-instruct:free': 'OpenRouter Llama 3.1 8B (Free)',
    // 'deepseek/deepseek-chat': 'OpenRouter DeepSeek Chat'
  };
  return mappings[id] || id;
}
