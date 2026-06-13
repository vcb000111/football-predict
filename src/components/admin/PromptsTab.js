'use client';

export default function PromptsTab({
  prompts,
  selectedPromptKey,
  setSelectedPromptKey,
  editPromptContent,
  setEditPromptContent,
  savingPrompt,
  loadingPrompts,
  onSavePrompt,
  onResetPrompt
}) {
  const promptTypes = [
    { key: 'predict_system', name: '🤖 System Prompt chính', desc: 'Dự đoán & phân tích bóng đá ELO/Poisson' },
    { key: 'predict_rag_template', name: '🔍 Template tin tức RAG', desc: 'Đưa dữ liệu tìm kiếm Internet vào context' },
    { key: 'predict_feedback_template', name: '📊 Template lịch sử đối đầu', desc: 'Học máy ngữ cảnh qua các sai số cũ' },
    { key: 'predict_critic_template', name: '⚖️ Template phản biện (Critic)', desc: 'Chạy tác tử phản biện rà soát logic cược' },
    { key: 'sync_fixtures_template', name: '🔄 Prompt Đồng bộ lịch (AI)', desc: 'Tìm kiếm RAG và trích xuất lịch thi đấu' }
  ];

  const currentPrompt = prompts.find(p => p.prompt_key === selectedPromptKey);

  return (
    <div className="glass-panel border border-white/5 rounded-2xl p-6 shadow-xl bg-[#0f172a]/20 backdrop-blur-md animate-fade-in">
      <div className="border-b border-white/5 pb-3 flex items-center justify-between mb-6">
        <h2 className="text-sm font-bold text-white flex items-center space-x-2">
          <span className="text-indigo-400">📝</span>
          <span>Quản lý prompt AI dùng cho phân tích cược</span>
        </h2>
        {currentPrompt && (
          <span className="text-[10px] text-gray-500 font-medium">
            Cập nhật: {new Date(currentPrompt.last_updated || new Date()).toLocaleDateString('vi-VN')}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar: Select Prompt Key */}
        <div className="lg:col-span-1 space-y-2">
          <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider block mb-3">Danh sách prompt</label>
          <div className="flex flex-col gap-1.5">
            {promptTypes.map(item => (
              <button
                key={item.key}
                onClick={() => setSelectedPromptKey(item.key)}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedPromptKey === item.key
                    ? 'bg-indigo-600/10 border-indigo-500/30 text-white shadow-md'
                    : 'bg-white/5 border-white/5 text-gray-400 hover:text-gray-250 hover:bg-white/10'
                }`}
              >
                <p className="text-xs font-black leading-tight">{item.name}</p>
                <p className="text-[9px] text-gray-500 mt-1 leading-normal">{item.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Right Content: Editor and Variables */}
        <div className="lg:col-span-3 space-y-4 flex flex-col">
          <div className="space-y-1.5 flex-1">
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] text-gray-500 font-black uppercase tracking-wider">
                Nội dung prompt template
              </label>
              {loadingPrompts && (
                <span className="text-[10px] text-indigo-400 font-medium animate-pulse">⏳ Đang tải...</span>
              )}
            </div>
            <textarea
              value={editPromptContent || ''}
              onChange={(e) => setEditPromptContent(e.target.value)}
              rows="12"
              disabled={loadingPrompts}
              className="w-full bg-[#070b14] border border-white/10 rounded-2xl p-4 text-xs font-mono text-gray-200 focus:outline-none focus:border-indigo-555 resize-y min-h-[300px] leading-relaxed custom-scrollbar"
              placeholder="Đang tải nội dung prompt..."
            ></textarea>
          </div>

          {/* Variables helper panel */}
          <div className="bg-[#0b1220]/75 border border-white/5 rounded-xl p-4 text-[10px] text-gray-500 space-y-2">
            <span className="font-black text-indigo-400 uppercase tracking-wider block mb-1">
              💡 Các biến số hỗ trợ (Sử dụng cú pháp song ngoặc để bind dữ liệu tự động):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 bg-white/5 p-2 rounded-lg font-mono">
              {selectedPromptKey === 'predict_system' && (
                <>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{homeTeam}}"}</code>: Tên đội nhà</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{awayTeam}}"}</code>: Tên đội khách</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{homeStats}}"}</code>: Stats ELO/Rank đội nhà</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{awayStats}}"}</code>: Stats ELO/Rank đội khách</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{poissonMonteCarlo}}"}</code>: Mô phỏng Monte Carlo</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{feedbackSection}}"}</code>: Đối chiếu sai số lịch sử</div>
                </>
              )}
              {selectedPromptKey === 'predict_rag_template' && (
                <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{searchContext}}"}</code>: Kết quả tìm kiếm cào được từ Internet</div>
              )}
              {selectedPromptKey === 'predict_feedback_template' && (
                <>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{historyTexts}}"}</code>: Lịch sử cược trước của hai đội</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{rate}}"}</code>: Tỷ lệ đoán đúng 1X2 (%)</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{correct}}"}</code>: Số trận đoán đúng</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{total}}"}</code>: Tổng số trận đã dự đoán</div>
                </>
              )}
              {selectedPromptKey === 'predict_critic_template' && (
                <>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{homeTeam}}"}</code>: Tên đội nhà</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{awayTeam}}"}</code>: Tên đội khách</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{draftPrediction}}"}</code>: Bản nháp JSON ban đầu</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{poissonMonteCarlo}}"}</code>: Mô phỏng Monte Carlo</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{searchContext}}"}</code>: Dữ liệu tìm kiếm Internet</div>
                </>
              )}
              {selectedPromptKey === 'sync_fixtures_template' && (
                <>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{tournament}}"}</code>: Tên giải đấu cần quét</div>
                  <div><code className="bg-[#0f172a] text-indigo-300 px-1 py-0.5 rounded font-mono border border-white/5">{"{{season}}"}</code>: Tên mùa giải cần quét</div>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-white/5 gap-4">
            <button
              onClick={onResetPrompt}
              className="bg-[#10192e] hover:bg-rose-950/20 border border-white/10 hover:border-rose-900/50 text-gray-300 hover:text-rose-450 text-xs font-bold py-2 px-4 rounded-xl transition-all cursor-pointer"
            >
              🔄 Khôi phục mặc định
            </button>
            <button
              onClick={onSavePrompt}
              disabled={savingPrompt || loadingPrompts}
              className="bg-indigo-650 hover:bg-indigo-600 text-white font-extrabold text-xs py-2.5 px-6 rounded-xl transition-all duration-150 disabled:opacity-50 flex items-center space-x-2 cursor-pointer active:scale-95"
            >
              {savingPrompt ? (
                <>
                  <span className="animate-spin inline-block">🔄</span>
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Lưu thay đổi</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
