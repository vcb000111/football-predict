'use client';

import { getTeamFlag } from '@/lib/flags';

export default function EditTeamModal({
  show,
  selectedTeam,
  editFormData,
  onChange,
  onSubmit,
  saving,
  onClose
}) {
  if (!show || !selectedTeam) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-scale-up">
      <div className="glass-panel border border-white/10 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl bg-[#0b1220]/95 backdrop-blur-md">
        {/* Modal Header */}
        <div className="bg-[#0f172a] border-b border-white/5 p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getTeamFlag(editFormData.team_name, "w-8 h-5.5 rounded")}
            <div>
              <h3 className="text-sm font-black text-white">Chỉnh sửa đội tuyển</h3>
              <p className="text-[10px] text-gray-400 font-medium">Cập nhật chỉ số thực lực cho {editFormData.team_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-base cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={onSubmit}>
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
            {/* Row 1: FIFA Rank & ELO */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-400 font-black uppercase">FIFA ranking</label>
                <input
                  type="number"
                  name="fifa_rank"
                  value={editFormData.fifa_rank}
                  onChange={onChange}
                  placeholder="Ví dụ: 15"
                  required
                  min="1"
                  className="w-full bg-[#0d1527] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-400 font-black uppercase">ELO rating</label>
                <input
                  type="number"
                  name="elo_rating"
                  value={editFormData.elo_rating}
                  onChange={onChange}
                  placeholder="Ví dụ: 1800"
                  required
                  min="500"
                  className="w-full bg-[#0d1527] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60 font-mono"
                />
              </div>
            </div>

            {/* Row 2: Goals */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-400 font-black uppercase">Bàn thắng trung bình (10 trận)</label>
                <input
                  type="number"
                  step="0.1"
                  name="avg_goals_scored"
                  value={editFormData.avg_goals_scored}
                  onChange={onChange}
                  placeholder="Ví dụ: 1.8"
                  required
                  min="0"
                  className="w-full bg-[#0d1527] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-400 font-black uppercase">Bàn thua trung bình (10 trận)</label>
                <input
                  type="number"
                  step="0.1"
                  name="avg_goals_conceded"
                  value={editFormData.avg_goals_conceded}
                  onChange={onChange}
                  placeholder="Ví dụ: 1.1"
                  required
                  min="0"
                  className="w-full bg-[#0d1527] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60 font-mono"
                />
              </div>
            </div>

            {/* Row 3: Form */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 font-black uppercase flex justify-between">
                <span>Phong độ gần đây (5 trận)</span>
                <span className="text-[9px] text-gray-500 font-medium normal-case">Tách nhau bởi dấu phẩy (W,D,L)</span>
              </label>
              <input
                type="text"
                name="recent_form"
                value={editFormData.recent_form}
                onChange={onChange}
                placeholder="Ví dụ: W,D,W,L,W"
                required
                pattern="^[WwDdLl](,[WwDdLl]){0,4}$"
                className="w-full bg-[#0d1527] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60 font-mono uppercase"
              />
            </div>

            {/* Row 4: Key Players */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 font-black uppercase">Ngôi sao nổi bật</label>
              <input
                type="text"
                name="key_players"
                value={editFormData.key_players}
                onChange={onChange}
                placeholder="Ví dụ: Son Heung-min, Hwang Hee-chan"
                className="w-full bg-[#0d1527] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60"
              />
            </div>

            {/* Row 5: Tactics */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 font-black uppercase">Phân tích chiến thuật</label>
              <textarea
                name="tactical_analysis"
                value={editFormData.tactical_analysis}
                onChange={onChange}
                rows="3"
                placeholder="Mô tả ngắn gọn sơ đồ và cách tiếp cận trận đấu..."
                className="w-full bg-[#0d1527] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-secondary/60 resize-none font-sans"
              ></textarea>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="bg-[#0f172a] border-t border-white/5 p-4 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-bold py-2 px-4 rounded-xl transition-all cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-secondary hover:bg-secondary/95 text-white text-xs font-extrabold py-2 px-5 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
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
        </form>
      </div>
    </div>
  );
}
