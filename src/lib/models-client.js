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
  // "gemini-3.1-flash-lite (Critic Phản Biện) + [Gemini: gemini-3.1-flash-lite / Groq: llama-3.1-8b-instant]"
  // Hoặc "gemini-3.1-flash-lite (Critic Phản Biện) + [Gemini: gemini-3.1-flash-lite]"
  if (trimmedModel.includes('Critic Phản Biện') || trimmedModel.includes('Consensus')) {
    const isMultiAgent = trimmedModel.includes('Groq:');
    
    // Trích xuất tên model Gemini Critic chính
    let criticName = 'Gemini';
    const criticMatch = trimmedModel.match(/^(gemini-[a-zA-Z0-9\.\-]+)/);
    if (criticMatch && criticMatch[1]) {
      criticName = formatSimpleModelName(criticMatch[1]);
    }
    
    if (isMultiAgent) {
      // Trích xuất tên model Groq
      let groqName = 'Groq';
      const groqMatch = trimmedModel.match(/Groq:\s*([a-zA-Z0-9\.\-\/]+)/);
      if (groqMatch && groqMatch[1]) {
        groqName = formatSimpleModelName(groqMatch[1]);
      }
      return `Đa tác nhân: ${criticName} (Critic) + ${groqName}`;
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
    'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
    'gemini-3.5-flash': 'Gemini 3.5 Flash',
    'gemini-3-flash': 'Gemini 3 Flash',
    'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
    'llama-3.1-8b-instant': 'Groq Llama 3.1 8B',
    'llama-3.3-70b-specdec': 'Groq Llama 3.3 70B',
    'llama-3.3-70b-versatile': 'Groq Llama 3.3 70B',
    'gemma2-9b-it': 'Groq Gemma 2 9B',
    'groq/compound': 'Groq Compound MoE'
  };
  return mappings[id] || id;
}
