'use client';

import { useState } from 'react';

export default function ModelManager({
  models,
  onAddModel,
  onToggleModelStatus,
  onDeleteModel,
  onMoveModel
}) {
  const [newModelName, setNewModelName] = useState('');
  const [newModelProvider, setNewModelProvider] = useState('gemini');

  const handleAddClick = () => {
    if (!newModelName.trim()) return;
    onAddModel(newModelProvider, newModelName.trim());
    setNewModelName('');
  };

  return (
    <div className="glass-panel border border-white/5 rounded-2xl p-6 shadow-xl space-y-6 bg-[#0f172a]/20 backdrop-blur-md">
      <div className="border-b border-white/5 pb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white flex items-center space-x-2">
          <span className="text-secondary">🤖</span>
          <span>Cấu hình thứ tự ưu tiên AI models (Gemini & OpenRouter)</span>
        </h2>
        <span className="text-[10px] bg-secondary/10 text-secondary border border-secondary/20 px-2.5 py-0.5 rounded-full font-bold">
          {models.length} Models
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={newModelProvider}
          onChange={(e) => setNewModelProvider(e.target.value)}
          className="bg-[#0d1527] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-secondary/80 cursor-pointer"
        >
          <option value="gemini">Gemini</option>
          <option value="openrouter">OpenRouter</option>
        </select>
        <input
          type="text"
          value={newModelName}
          onChange={(e) => setNewModelName(e.target.value)}
          placeholder={newModelProvider === 'gemini' ? "Ví dụ: gemini-2.5-pro, gemini-3.5-flash..." : "Ví dụ: meta-llama/llama-3.3-70b-instruct:free..."}
          className="flex-1 bg-[#0d1527] border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-secondary/80 transition-colors"
        />
        <button
          onClick={handleAddClick}
          disabled={!newModelName.trim()}
          className="bg-secondary hover:bg-secondary/90 disabled:bg-gray-800 disabled:opacity-50 text-white text-xs font-black px-4 py-2 rounded-xl transition-all cursor-pointer"
        >
          ➕ Thêm
        </button>
      </div>

      {models.length === 0 ? (
        <div className="text-center py-8 bg-white/5 rounded-xl border border-dashed border-white/10">
          <p className="text-xs text-gray-500">Chưa có AI model nào được cài đặt. Vui lòng cài đặt ít nhất 1 model.</p>
        </div>
      ) : (
        <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2 pr-1">
          {models.map((model, index) => {
            const modelIdOrIndex = model.id || index;
            return (
              <div
                key={modelIdOrIndex}
                className="flex items-center justify-between bg-white/5 border border-white/5 hover:border-white/10 rounded-xl p-3 text-xs transition-colors"
              >
                <div className="flex items-center space-x-3.5 flex-1 min-w-0 pr-4">
                  <div className="bg-[#151E2E] border border-white/10 px-2.5 py-1 rounded-lg text-center min-w-[32px]">
                    <span className="text-[10px] font-black text-secondary block">{model.priority}</span>
                    <span className="text-[8px] text-gray-500 font-bold uppercase block leading-none mt-0.5">Ưu tiên</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
                    (model.provider || 'gemini') === 'openrouter'
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                      : 'bg-secondary/10 text-secondary border border-secondary/20'
                  }`}>
                    {model.provider || 'gemini'}
                  </span>
                  <div className="truncate flex-1">
                    <p className="text-xs font-bold text-white truncate">{model.model_name}</p>
                    <span className="text-[9px] text-gray-500 font-medium">Model ID: {model.id || 'Tạm thời'}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onMoveModel(index, 'up')}
                    disabled={index === 0}
                    className="bg-white/5 border border-white/10 hover:border-white/20 text-gray-400 hover:text-white disabled:opacity-30 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => onMoveModel(index, 'down')}
                    disabled={index === models.length - 1}
                    className="bg-white/5 border border-white/10 hover:border-white/20 text-gray-400 hover:text-white disabled:opacity-30 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                  >
                    ▼
                  </button>
                  <span className="w-1 bg-white/5 h-6 mx-1 inline-block"></span>
                  <button
                    onClick={() => onToggleModelStatus(index)}
                    className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border cursor-pointer ${model.status === 1
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                  >
                    {model.status === 1 ? 'BẬT' : 'TẮT'}
                  </button>
                  <button
                    onClick={() => onDeleteModel(index, model.id)}
                    className="bg-[#151E2E] hover:bg-rose-950/40 border border-white/5 hover:border-rose-900/50 text-gray-400 hover:text-rose-400 w-7 h-7 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
