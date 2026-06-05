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
  if (modelId.toLowerCase().includes('mock') || modelId.toLowerCase().includes('giả lập') || modelId.toLowerCase().includes('dự phòng')) {
    return 'Dự phòng / Mock';
  }

  const id = modelId.replace(/^models\//, '').trim();

  const mappings = {
    'gemini-3.1-flash-lite': 'Google Gemini 3.1 Flash Lite',
    'gemini-3.5-flash': 'Google Gemini 3.5 Flash',
    'gemini-3-flash': 'Google Gemini 3 Flash',
    'gemini-3-flash-preview': 'Google Gemini 3 Flash Preview',
    'gemini-2.5-flash': 'Google Gemini 2.5 Flash',
    'gemini-2.5-flash-lite': 'Google Gemini 2.5 Flash Lite',
  };

  return mappings[id] || `Google Gemini (${id})`;
}
