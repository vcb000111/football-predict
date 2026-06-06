'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getTeamFlag } from '@/lib/flags';

export default function StatisticsPage() {
  const [stats, setStats] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (res.ok && data.success) {
        setStats(data.stats);
        setRecommendations(data.recommendations || []);
      } else {
        throw new Error(data.error || 'Không thể tải thống kê');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (pct) => {
    if (pct >= 75) return { text: 'CỰC TỐT 🔥', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
    if (pct >= 50) return { text: 'KHÁ 📈', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' };
    if (pct >= 30) return { text: 'TRUNG BÌNH ⚖️', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
    return { text: 'CẦN CẢI THIỆN ⚠️', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' };
  };

  return (
    <div className="min-h-screen bg-[#060A13] text-gray-200 py-10 px-4 sm:px-6 md:px-8">
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-card-border/50 pb-5 gap-4">
          <div>
            <h1 className="text-2xl font-black text-gradient flex items-center space-x-2">
              <span>📊</span>
              <span>Thống Kê Hiệu Suất AI & Phân Tích Kèo (BA)</span>
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Phân tích độ chính xác lịch sử của AI Predictor và đề xuất những lựa chọn đầu tư tối ưu nhất cho các trận đấu sắp tới.
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={fetchStats}
              className="bg-card-border/50 hover:bg-card-border border border-card-border hover:border-gray-550 text-xs text-gray-300 font-bold py-2 px-4 rounded-xl transition-all duration-150 flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🔄</span>
              <span>Tải Lại</span>
            </button>
            <Link 
              href="/"
              className="bg-gradient-to-r from-primary to-secondary text-black font-extrabold text-xs py-2 px-4 rounded-xl transition-all duration-150 flex items-center space-x-1.5"
            >
              <span>🏠</span>
              <span>Trang Chủ</span>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 glass-panel rounded-2xl border border-card-border">
            <span className="text-2xl block mb-2 animate-spin">⏳</span>
            <p className="text-xs text-gray-500">Đang phân tích dữ liệu SQLite...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-semibold text-center">
            🔴 Lỗi tải thống kê: {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* CỘT TRÁI: HIỆU SUẤT AI (8 dòng trên Lg) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* KPIs Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="glass-panel border border-card-border/80 rounded-2xl p-4 text-center">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Dự Đoán Đã Tạo</span>
                  <span className="text-3xl font-black text-white mt-1 block">{stats.totalPredictions}</span>
                </div>
                <div className="glass-panel border border-card-border/80 rounded-2xl p-4 text-center">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Trận Đã Diễn Ra</span>
                  <span className="text-3xl font-black text-primary mt-1 block">{stats.evaluatedMatches}</span>
                </div>
                <div className="glass-panel border border-card-border/80 rounded-2xl p-4 text-center">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Độ Chính Xác 1X2</span>
                  <span className="text-3xl font-black text-secondary mt-1 block">{stats.outcome1x2.pct}%</span>
                </div>
              </div>

              {/* Accuracy Breakdown Graph Card */}
              <div className="glass-panel border border-card-border/80 rounded-2xl p-6 shadow-xl space-y-5">
                <h2 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-card-border/50 pb-3">
                  <span>📈</span>
                  <span>Độ Chính Xác Chi Tiết Theo Loại Kèo</span>
                </h2>

                {stats.evaluatedMatches === 0 ? (
                  <p className="text-xs text-gray-500 italic text-center py-6">
                    Chưa có trận đấu nào có kết quả thực tế để đối chiếu và xếp hạng.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {[
                      { label: 'Tài Xỉu 2.5 (Bàn Thắng)', data: stats.overUnder, color: 'from-emerald-500 to-teal-400' },
                      { label: 'Cả hai đội ghi bàn (BTTS)', data: stats.btts, color: 'from-emerald-500 to-green-400' },
                      { label: 'Dự đoán kết quả 1X2', data: stats.outcome1x2, color: 'from-indigo-500 to-cyan-400' },
                      { label: 'Kèo Chấp châu Á (Handicap)', data: stats.handicap, color: 'from-indigo-500 to-blue-400' },
                      { label: 'Đúng Tỷ Số chính xác', data: stats.exactScore, color: 'from-amber-500 to-orange-400' },
                      { label: 'Kèo Phạt Góc', data: stats.corners, color: 'from-purple-500 to-pink-400' },
                      { label: 'Kèo Thẻ Phạt', data: stats.cards, color: 'from-rose-500 to-red-400' }
                    ].map((item) => {
                      const rank = getRankBadge(item.data.pct);
                      return (
                        <div key={item.label} className="space-y-1.5 bg-card-border/10 p-3 rounded-xl border border-card-border/30">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-white">{item.label}</span>
                            <div className="flex items-center space-x-2">
                              <span className={`text-[8px] font-black border px-2 py-0.5 rounded-full ${rank.color}`}>
                                {rank.text}
                              </span>
                              <span className="font-extrabold text-gray-300">
                                {item.data.correct}/{item.data.total} ({item.data.pct}%)
                              </span>
                            </div>
                          </div>
                          
                          {/* Progress Bar Container */}
                          <div className="h-2.5 w-full bg-[#0E1321] rounded-full overflow-hidden border border-card-border/50">
                            <div 
                              className={`h-full bg-gradient-to-r ${item.color} rounded-full transition-all duration-500`}
                              style={{ width: `${item.data.pct}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* CỘT PHẢI: GỢI Ý KÈO NGON SẮP TỚI (4 dòng trên Lg) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="glass-panel border border-card-border/80 rounded-2xl p-6 shadow-xl space-y-5">
                <div className="border-b border-card-border/50 pb-3">
                  <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                    <span className="text-secondary">🔥</span>
                    <span>Gợi Ý Kèo Ngon Ăn Nhất Sắp Tới</span>
                  </h2>
                  <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                    Thuật toán **BA (Bet Analyst)** tự động lọc các trận chưa đấu có tỷ lệ thắng của AI trong lịch sử đạt hiệu suất cao nhất.
                  </p>
                </div>

                {recommendations.length === 0 ? (
                  <div className="text-center py-10 bg-card-border/15 rounded-xl border border-dashed border-card-border/40">
                    <p className="text-xs text-gray-500 italic">
                      Không có trận đấu sắp diễn ra nào đã được phân tích dự đoán. Vui lòng chạy dự đoán trước.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recommendations.map((rec, index) => (
                      <div 
                        key={`${rec.fixture.id}-${index}`}
                        className="bg-[#0f172a]/40 hover:bg-[#0f172a]/60 border border-card-border hover:border-indigo-500/40 rounded-xl p-4 space-y-3.5 transition-all duration-200"
                      >
                        {/* Recommendation Header */}
                        <div className="flex justify-between items-center text-[10px]">
                          <span className={`px-2 py-0.5 rounded font-black tracking-wider uppercase border ${
                            rec.confidence.includes('🔥')
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                          }`}>
                            {rec.confidence}
                          </span>
                          <span className="text-gray-500 font-bold">{rec.fixture.date} • {rec.fixture.time}</span>
                        </div>

                        {/* Teams Info */}
                        <div className="flex items-center space-x-2.5 bg-card-border/20 p-2 rounded-lg justify-center text-xs">
                          <div className="flex items-center space-x-1.5 w-5/12 justify-end">
                            <span className="font-extrabold text-white truncate max-w-[80px]">{rec.fixture.homeTeam}</span>
                            {getTeamFlag(rec.fixture.homeTeam, 'w-5.5 h-3.5')}
                          </div>
                          <span className="text-[9px] font-bold text-gray-600 bg-[#060A13] px-1.5 py-0.2 rounded-full">VS</span>
                          <div className="flex items-center space-x-1.5 w-5/12 justify-start">
                            {getTeamFlag(rec.fixture.awayTeam, 'w-5.5 h-3.5')}
                            <span className="font-extrabold text-white truncate max-w-[80px]">{rec.fixture.awayTeam}</span>
                          </div>
                        </div>

                        {/* Recommended Bet */}
                        <div className="bg-[#0c101d] border border-card-border/40 p-2.5 rounded-lg">
                          <span className="text-[8px] text-gray-600 font-black uppercase block tracking-wider leading-none mb-1">{rec.betType}</span>
                          <span className="text-[11px] font-bold text-secondary">{rec.recommendation}</span>
                        </div>

                        {/* BA Reason Text */}
                        <p className="text-[10px] text-gray-400 leading-relaxed pl-1 border-l-2 border-primary/40 font-medium">
                          {rec.reason}
                        </p>

                        {/* View Match Details Button */}
                        <Link 
                          href={`/match/${rec.fixture.id}`}
                          className="block text-center bg-card-border/60 hover:bg-card-border text-[9px] font-bold py-1.5 rounded-lg text-gray-300 hover:text-white border border-card-border transition-colors cursor-pointer"
                        >
                          🔍 Xem Nhận Định Chi Tiết Trận Đấu
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
