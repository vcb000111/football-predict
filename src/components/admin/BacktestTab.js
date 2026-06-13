'use client';

import { useEffect, useRef } from 'react';

export default function BacktestTab({
  backtestFixtures,
  loadingBacktest,
  backtestRunning,
  backtestLog,
  backtestProgress,
  currentBacktestMatch,
  fastMode,
  setFastMode,
  backtestTournament,
  setBacktestTournament,
  onRunBacktest
}) {
  const consoleRef = useRef(null);

  // Auto scroll to bottom of log console
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [backtestLog]);

  const displayedLogs = backtestLog.slice(-150);

  const handleCopyLogs = () => {
    if (backtestLog.length === 0) return;
    navigator.clipboard.writeText(backtestLog.join('\n'));
    alert('Đã copy toàn bộ nhật ký log vào clipboard!');
  };

  return (
    <div className="glass-panel border border-white/5 rounded-2xl p-6 shadow-xl space-y-6 bg-[#0f172a]/20 backdrop-blur-md animate-fade-in">
      <div className="border-b border-white/5 pb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white flex items-center space-x-2">
          <span className="text-accent font-bold">🧪</span>
          <span>Tiến trình chạy backtest tăng cỡ mẫu</span>
        </h2>
        <span className="text-[10px] bg-accent/10 text-accent border border-accent/20 px-2.5 py-0.5 rounded-full font-bold">
          {backtestFixtures.length} trận đấu cần chạy
        </span>
      </div>

      <div className="bg-[#0f172a] border border-white/5 rounded-xl p-4 text-xs text-gray-400 leading-relaxed space-y-2">
        <span className="font-bold text-accent block">Giới thiệu cơ chế:</span>
        <p>
          Cơ chế chạy: Sử dụng giao diện admin điều khiển gọi API tuần tự từ phía client thay vì chạy vòng lặp ngầm ở backend. Điều này giúp ngăn chặn triệt để lỗi Gateway Timeout (504) và lỗi khóa ghi cơ sở dữ liệu SQLite (<code>SQLITE_BUSY</code>).
        </p>
        <p>
          Hệ thống tự động chạy qua 2 bước cho mỗi trận: 
          1. Gọi <code className="text-primary font-bold">POST /api/predict</code> (ở Fast Mode, Single-Agent và tắt RAG Search chống rò rỉ dữ liệu).
          2. Gọi <code className="text-secondary font-bold">POST /api/results/auto</code> để tự động chấm điểm dựa trên tỉ số thực tế có sẵn.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-gray-400 whitespace-nowrap">Giải đấu:</span>
            <select
              value={backtestTournament}
              onChange={(e) => setBacktestTournament(e.target.value)}
              disabled={backtestRunning}
              className="bg-[#0E1321] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent/60 cursor-pointer"
            >
              <option value="All">Tất cả giải đấu</option>
              <option value="Euro 2024">Euro 2024</option>
              <option value="Premier League">Premier League (EPL)</option>
              <option value="La Liga">La Liga (LALIGA)</option>
              <option value="World Cup 2026">World Cup 2026</option>
            </select>
          </div>
          <label className="flex items-center space-x-2 text-xs font-bold text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={fastMode}
              onChange={(e) => setFastMode(e.target.checked)}
              disabled={backtestRunning}
              className="w-4 h-4 rounded border-white/10 text-primary bg-[#0E1321] focus:ring-primary/30 cursor-pointer"
            />
            <span>Chế độ Fast Mode (Gemini Flash)</span>
          </label>
        </div>

        <button
          onClick={onRunBacktest}
          disabled={backtestRunning || backtestFixtures.length === 0}
          className="w-full lg:w-auto bg-gradient-to-r from-accent to-indigo-500 hover:from-accent hover:to-indigo-650 disabled:opacity-50 text-white font-extrabold text-xs py-2.5 px-6 rounded-xl transition-all duration-150 active:scale-95 shadow-lg shadow-accent/20 cursor-pointer flex items-center justify-center space-x-2"
        >
          {backtestRunning ? (
            <>
              <span className="animate-spin">⏳</span>
              <span>Đang chạy backtest ({backtestProgress}%)</span>
            </>
          ) : (
            <>
              <span>🧪</span>
              <span>Bắt đầu chạy backtest</span>
            </>
          )}
        </button>
      </div>

      {/* Progress Bar */}
      {backtestRunning && (
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-400 font-medium">Tiến độ chạy:</span>
            <span className="font-extrabold text-accent">{backtestProgress}%</span>
          </div>
          <div className="h-2.5 w-full bg-[#0E1321] rounded-full overflow-hidden border border-white/5">
            <div 
              className="h-full bg-gradient-to-r from-accent to-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${backtestProgress}%` }}
            ></div>
          </div>
          {currentBacktestMatch && (
            <p className="text-[10px] text-gray-500 italic">
              Đang xử lý trận: <span className="font-bold text-white">{currentBacktestMatch.homeTeam} vs {currentBacktestMatch.awayTeam}</span>
            </p>
          )}
        </div>
      )}

      {/* Logger console */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">
            Nhật ký tiến trình chạy (Live logs)
          </label>
          {backtestLog.length > 0 && (
            <button
              onClick={handleCopyLogs}
              className="bg-[#151E2E] hover:bg-white/5 border border-white/10 hover:border-white/20 text-[9px] text-gray-400 hover:text-white px-2 py-0.5 rounded cursor-pointer"
            >
              📋 Copy logs
            </button>
          )}
        </div>
        <div 
          ref={consoleRef}
          className="w-full h-60 bg-[#070b14] border border-white/10 rounded-xl p-4 text-xs font-mono text-emerald-450 overflow-y-auto custom-scrollbar space-y-1.5 shadow-inner"
          style={{ color: '#00ff66' }} // Classic emerald hacker green text
        >
          {displayedLogs.length === 0 ? (
            <p className="text-gray-600 italic">Console trống. Hãy bấm nút bắt đầu để xem log thực thi.</p>
          ) : (
            displayedLogs.map((log, idx) => (
              <p key={idx} className="leading-relaxed border-b border-white/5 pb-0.5 last:border-0">{log}</p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
