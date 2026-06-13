'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getTeamFlag, getTeamFlagEmoji } from '@/lib/flags';
import data from '@/data/fixtures.json';
import { saveLastUsedModel, formatModelName } from '@/lib/models-client';


export default function CustomPredictor() {
  // Trích xuất danh sách đội bóng
  const allTeams = Array.from(
    new Set(data.groups.flatMap(group => group.teams))
  ).sort();

  const [homeTeam, setHomeTeam] = useState('Argentina');
  const [awayTeam, setAwayTeam] = useState('Portugal');
  const [loading, setLoading] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [loadingStep, setLoadingStep] = useState(0);
  const [predictType, setPredictType] = useState('full_time');
  const [firstHalfHomeScore, setFirstHalfHomeScore] = useState('');
  const [firstHalfAwayScore, setFirstHalfAwayScore] = useState('');

  // States cho Form cập nhật kết quả thực tế
  const [actHome, setActHome] = useState('');
  const [actAway, setActAway] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resMessage, setResMessage] = useState(null);
  const [updatingAuto, setUpdatingAuto] = useState(false);

  const loadingSteps = [
    'Đang khởi chạy trình giả lập trận đấu...',
    'Quét dữ liệu tin tức thực tế (Google Search Grounding) cho cả 2 đội...',
    'Đang tính toán sơ đồ chiến thuật và tương quan phong độ...',
    'Đang dự đoán tỷ số, tỷ lệ cược và đề xuất kèo hợp lý...'
  ];

  // Rotate loading steps
  useEffect(() => {
    if (!predicting) return;
    const interval = setInterval(() => {
      setLoadingStep((prev) => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
    }, 2500);
    return () => clearInterval(interval);
  }, [predicting]);

  // Load history whenever homeTeam or awayTeam changes
  useEffect(() => {
    loadHistory();
  }, [homeTeam, awayTeam]);

  const loadHistory = async () => {
    if (homeTeam === awayTeam) return;
    setError(null);
    setPrediction(null);
    setResMessage(null);
    setActHome('');
    setActAway('');
    
    try {
      const res = await fetch(`/api/history?homeTeam=${homeTeam}&awayTeam=${awayTeam}`);
      if (!res.ok) throw new Error('Không thể tải lịch sử dự đoán');
      const data = await res.json();
      
      if (data.history && data.history.length > 0) {
        setHistoryList(data.history);
        setPrediction(data.history[0]); // Bản ghi mới nhất hiển thị mặc định
      } else {
        setHistoryList([]);
        setPrediction(null);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePredict = async () => {
    if (homeTeam === awayTeam) {
      setError('Đội nhà và Đội khách không thể giống nhau!');
      return;
    }

    setPredicting(true);
    setError(null);
    setPrediction(null);
    setResMessage(null);
    setActHome('');
    setActAway('');
    setLoadingStep(0);

    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          homeTeam, 
          awayTeam, 
          predictType, 
          firstHalfHomeScore: predictType === 'second_half' ? parseInt(firstHalfHomeScore || 0, 10) : null,
          firstHalfAwayScore: predictType === 'second_half' ? parseInt(firstHalfAwayScore || 0, 10) : null
        })
      });

      if (!res.ok) {
        throw new Error('Có lỗi xảy ra khi gửi yêu cầu đến máy chủ.');
      }

      const result = await res.json();
      setPrediction(result);
      if (result.modelUsed) {
        saveLastUsedModel(result.modelUsed);
      }
      
      // Reload history to include the new run
      await loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setPredicting(false);
    }
  };


  const handleAutoUpdateResult = async () => {
    setUpdatingAuto(true);
    setResMessage(null);
    try {
      const res = await fetch('/api/results/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeTeam, awayTeam })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi tự động lấy kết quả');

      if (data.success) {
        setResMessage({
          success: true,
          text: `🤖 Tự động cập nhật thành công! Kết quả thực tế: ${data.actualScore.home}-${data.actualScore.away}${data.actualFirstHalfScore ? ` (Hiệp 1: ${data.actualFirstHalfScore.home}-${data.actualFirstHalfScore.away})` : ''}. ${data.summary || ''}`
        });
        if (data.modelUsed) {
          saveLastUsedModel(data.modelUsed);
        }

        setActHome(data.actualScore.home);
        setActAway(data.actualScore.away);

        // Tải lại lịch sử
        await loadHistory();
      } else {
        setResMessage({
          success: false,
          text: `⚠️ Trạng thái: ${data.message || 'Không tìm thấy kết quả trực tuyến.'}`
        });
      }
    } catch (err) {
      setResMessage({ success: false, text: err.message });
    } finally {
      setUpdatingAuto(false);
    }
  };

  const formatDate = (dateStr) => {
    try {
      if (!dateStr) return '';
      // SQLite trả về định dạng UTC 'YYYY-MM-DD HH:MM:SS', chuyển thành ISO format có đuôi Z
      let normalizedStr = dateStr;
      if (typeof dateStr === 'string' && !dateStr.includes('T') && !dateStr.includes('Z')) {
        normalizedStr = dateStr.replace(' ', 'T') + 'Z';
      }
      const d = new Date(normalizedStr);
      // Định dạng sang giờ Việt Nam (GMT+7)
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) + ' ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen py-6 bg-gradient-to-b from-[#0B0F17] via-[#0D1527] to-[#0A0D14] px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-6">
          <span className="inline-flex items-center space-x-1.5 bg-secondary/10 border border-secondary/30 rounded-full px-3 py-1 text-[10px] font-bold text-secondary mb-3 tracking-wider uppercase">
            🔮 AI SIMULATOR
          </span>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
            Giả Lập Trận Đấu Tùy Chọn
          </h1>
          <p className="text-gray-450 max-w-xl mx-auto text-xs sm:text-sm">
            Chọn hai đội tuyển bất kỳ từ 48 đội tham dự World Cup 2026. AI sẽ tổng hợp tin tức trực tuyến hiện tại để đưa ra nhận định thực tế nhất.
          </p>
        </div>

        {/* Team Selectors Box */}
        <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-card-border mb-6">
          
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4 items-center">
            
            {/* Home Selection (3 Cols) */}
            <div className="md:col-span-3 flex flex-col space-y-1">
              <label className="text-[10px] font-bold text-primary uppercase tracking-wider">Chọn Đội Nhà (Home)</label>
              <div className="flex items-center space-x-2 bg-card-border/20 border border-card-border rounded-xl p-3">
                {getTeamFlag(homeTeam, "w-10 h-7")}
                <select
                  value={homeTeam}
                  onChange={(e) => {
                    setHomeTeam(e.target.value);
                  }}
                  className="flex-1 bg-transparent text-white font-bold text-base focus:outline-none border-none cursor-pointer"
                >
                  {allTeams.map(team => (
                    <option key={team} value={team} className="bg-[#151E2E] text-white">
                      {getTeamFlagEmoji(team)} {team}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* VS Circle Divider (1 Col) */}
            <div className="md:col-span-1 flex justify-center pt-2 md:pt-0">
              <div className="h-9 w-9 rounded-full bg-card-border/50 border border-card-border/80 flex items-center justify-center font-black text-gray-500 text-[10px] shadow-sm">
                VS
              </div>
            </div>

            {/* Away Selection (3 Cols) */}
            <div className="md:col-span-3 flex flex-col space-y-1">
              <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Chọn Đội Khách (Away)</label>
              <div className="flex items-center space-x-2 bg-card-border/20 border border-card-border rounded-xl p-3">
                {getTeamFlag(awayTeam, "w-10 h-7")}
                <select
                  value={awayTeam}
                  onChange={(e) => {
                    setAwayTeam(e.target.value);
                  }}
                  className="flex-1 bg-transparent text-white font-bold text-base focus:outline-none border-none cursor-pointer"
                >
                  {allTeams.map(team => (
                    <option key={team} value={team} className="bg-[#151E2E] text-white">
                      {getTeamFlagEmoji(team)} {team}
                    </option>
                  ))}
                </select>
              </div>
            </div>

          </div>

          {/* Phạm vi dự đoán */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-3 border-t border-card-border/50 items-end">
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Phạm vi dự đoán</label>
              <select
                value={predictType}
                onChange={(e) => setPredictType(e.target.value)}
                className="bg-card-border/20 border border-card-border rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-primary cursor-pointer font-bold"
              >
                <option value="full_time" className="bg-[#151E2E]">Cả trận (Full Time)</option>
                <option value="first_half" className="bg-[#151E2E]">Hiệp 1 (First Half)</option>
                <option value="second_half" className="bg-[#151E2E]">Hiệp 2 (Second Half)</option>
              </select>
            </div>

            {predictType === 'second_half' && (
              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                <div className="flex flex-col space-y-1">
                  <label className="text-[10px] font-bold text-gray-405 uppercase tracking-wider">Tỷ số Hiệp 1 - {homeTeam}</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={firstHalfHomeScore}
                    onChange={(e) => setFirstHalfHomeScore(e.target.value)}
                    className="bg-card-border/20 border border-card-border rounded-xl p-2 text-xs text-white focus:outline-none focus:border-primary text-center font-bold"
                  />
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-[10px] font-bold text-gray-405 uppercase tracking-wider">Tỷ số Hiệp 1 - {awayTeam}</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={firstHalfAwayScore}
                    onChange={(e) => setFirstHalfAwayScore(e.target.value)}
                    className="bg-card-border/20 border border-card-border rounded-xl p-2 text-xs text-white focus:outline-none focus:border-primary text-center font-bold"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Trigger Predict Button */}
          <div className="mt-5 flex justify-center">
            <button
              onClick={handlePredict}
              disabled={predicting || homeTeam === awayTeam}
              className={`w-full sm:w-auto px-8 py-3 rounded-xl font-extrabold text-white text-xs tracking-wider transition-all duration-150 ${
                homeTeam === awayTeam 
                  ? 'bg-gray-700 cursor-not-allowed opacity-50'
                  : 'bg-gradient-to-r from-primary to-secondary hover:scale-[1.01] active:scale-[0.99]'
              }`}
            >
              {predicting ? 'ĐANG GIẢ LẬP...' : '🧠 CHẠY DỰ ĐOÁN KẾT QUẢ AI'}
            </button>
          </div>

        </div>

        {/* LOADING SKELETON */}
        {predicting && (
          <div className="glass-panel rounded-2xl p-8 text-center border border-card-border flex flex-col items-center justify-center min-h-[200px]">
            <div className="h-10 w-10 mb-4 relative">
              <div className="absolute inset-0 rounded-full border-3 border-card-border border-t-secondary animate-spin"></div>
              <span className="absolute inset-0 flex items-center justify-center text-xl animate-bounce">⚡</span>
            </div>
            <h3 className="text-white font-bold text-xs mb-1">Đang liên hệ chuyên gia AI...</h3>
            <p className="text-secondary text-xs font-semibold max-w-sm h-8 flex items-center justify-center">
              {loadingSteps[loadingStep]}
            </p>
          </div>
        )}

        {/* ERROR STATE */}
        {error && !predicting && (
          <div className="glass-panel rounded-2xl p-4 border border-red-500/20 bg-red-950/10 text-center text-xs text-red-400">
            ⚠️ {error}
          </div>
        )}

        {/* PREDICTION RESULTS */}
        {!predicting && !error && prediction && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-6 animate-fade-in">
            
            {/* Score & Probabilities (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              
              {/* In-Context Learning Status */}
              {prediction.historicalAccuracy && (
                <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 glow-green flex items-start space-x-2 text-[11px] text-primary leading-relaxed">
                  <span>🤖</span>
                  <div>
                    <p className="font-bold">Đã kích hoạt Học máy ngữ cảnh</p>
                    <p className="text-gray-400 mt-0.5">
                      AI đã phân tích lịch sử <strong>{prediction.historicalAccuracy.total}</strong> trận trước để tự sửa đổi nhận định. Tỷ lệ chính xác gần đây: <strong>{prediction.historicalAccuracy.rate}%</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* Score & Win Prob Card */}
              <div className="glass-panel rounded-xl p-4 border border-card-border glow-cyan relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-secondary/10 text-secondary font-bold text-[9px] tracking-widest px-2.5 py-0.5 rounded-bl-lg uppercase">
                  SIMULATION DONE
                </div>
                <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-4">
                  Kết Quả Giả Định {prediction.predict_type === 'first_half' ? '(Hiệp 1)' : prediction.predict_type === 'second_half' ? '(Hiệp 2)' : '(Cả trận)'}
                </h3>
                
                <div className="flex items-center justify-center space-x-6 my-4">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-semibold text-gray-500 mb-1">{homeTeam}</span>
                    <span className="text-4xl font-black text-white">{prediction.predicted_home_score ?? prediction.predictedScore?.home}</span>
                  </div>
                  <span className="text-xl font-bold text-card-border">-</span>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-semibold text-gray-500 mb-1">{awayTeam}</span>
                    <span className="text-4xl font-black text-white">{prediction.predicted_away_score ?? prediction.predictedScore?.away}</span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {(() => {
                    const prob = {
                      home: prediction.win_prob_home ?? prediction.winProbability?.home ?? 33,
                      draw: prediction.win_prob_draw ?? prediction.winProbability?.draw ?? 34,
                      away: prediction.win_prob_away ?? prediction.winProbability?.away ?? 33
                    };
                    return (
                      <>
                        <div className="flex justify-between text-[10px] font-semibold text-gray-400">
                          <span>{homeTeam} ({prob.home}%)</span>
                          <span>Hòa ({prob.draw}%)</span>
                          <span>{awayTeam} ({prob.away}%)</span>
                        </div>
                        <div className="h-3 w-full rounded-full overflow-hidden flex bg-card-border">
                          <div className="h-full bg-gradient-to-r from-primary to-primary/80" style={{ width: `${prob.home}%` }}></div>
                          <div className="h-full bg-gray-500" style={{ width: `${prob.draw}%` }}></div>
                          <div className="h-full bg-gradient-to-r from-secondary/80 to-secondary" style={{ width: `${prob.away}%` }}></div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Runs Comparison/History List */}
              {historyList.length > 0 && (
                <div className="glass-panel rounded-xl p-4 border border-card-border">
                  <h3 className="text-gray-400 font-bold text-xs mb-2.5 uppercase tracking-wider flex items-center justify-between">
                    <span>Lịch sử giả lập cặp đấu này</span>
                    <span className="text-[9px] text-gray-500 font-normal">Click để xem lại</span>
                  </h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {historyList.map((run, idx) => {
                      const isActive = run.id === prediction.id;
                      const pHome = run.predicted_home_score ?? run.predictedScore?.home;
                      const pAway = run.predicted_away_score ?? run.predictedScore?.away;
                      
                      const actualHome = run.actual_home_score;
                      const actualAway = run.actual_away_score;
                      const hasActualResult = actualHome !== null && actualHome !== undefined;

                      return (
                        <div
                          key={run.id}
                          onClick={() => setPrediction(run)}
                          className={`p-2 rounded-lg border text-xs cursor-pointer transition-all duration-150 flex items-center justify-between ${
                            isActive 
                              ? 'border-secondary bg-secondary/5 text-white shadow-sm glow-cyan' 
                              : 'border-card-border/60 hover:border-card-border bg-card-border/10 text-gray-400 hover:text-white'
                          }`}
                        >
                          <div className="flex flex-col space-y-0.5">
                            <span className="font-bold"># Lượt {historyList.length - idx}</span>
                            <span className="text-[9px] text-gray-500">{formatDate(run.created_at)}</span>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-extrabold text-sm text-gray-205 bg-card-border/30 px-1.5 py-0.5 rounded border border-card-border/30">
                              {pHome}-{pAway}
                            </span>
                            {hasActualResult && (
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                run.is_correct === 1 
                                  ? 'bg-primary/20 text-primary border border-primary/20' 
                                  : 'bg-red-500/20 text-red-400 border border-red-500/20'
                              }`}>
                                {run.is_correct === 1 ? 'Đúng' : 'Sai'} ({actualHome}-{actualAway})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recommended Bets Card */}
              {(() => {
                const evalDetails = prediction.bet_evaluation_details;
                const showOutcome = evalDetails && (prediction.actual_home_score !== null && prediction.actual_home_score !== undefined);
                
                const renderBetOutcomeBadge = (betType) => {
                  if (!showOutcome || !evalDetails[betType]) return null;
                  const { outcome, reason } = evalDetails[betType];
                  if (outcome === 'correct') {
                    return (
                      <span className="bg-primary/20 text-primary border border-primary/30 font-bold px-1.5 py-0.5 rounded text-[9px] flex items-center space-x-1" title={reason}>
                        <span>🟢 Đúng</span>
                      </span>
                    );
                  } else if (outcome === 'incorrect') {
                    return (
                      <span className="bg-red-500/20 text-red-400 border border-red-500/30 font-bold px-1.5 py-0.5 rounded text-[9px] flex items-center space-x-1" title={reason}>
                        <span>🔴 Sai</span>
                      </span>
                    );
                  } else if (outcome === 'refund') {
                    return (
                      <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-bold px-1.5 py-0.5 rounded text-[9px] flex items-center space-x-1" title={reason}>
                        <span>🟡 Hòa</span>
                      </span>
                    );
                  }
                  return null;
                };

                return (
                  <div className="glass-panel rounded-xl p-4 border border-card-border">
                    <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-4">Đề xuất kèo từ AI</h3>
                    <div className="space-y-3">
                      
                      {/* Kèo Châu Âu */}
                      <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-gray-450 text-[10px]">KÈO CHÂU ÂU</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="bg-primary/20 text-primary font-bold px-2 py-0.5 rounded-md text-[10px]">
                              {prediction.recommendation_1x2 ?? prediction.bets?.oneXTwo?.recommendation}
                            </span>
                            {renderBetOutcomeBadge('oneXTwo')}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.oneXTwo?.reason || 'Phân tích tương quan lực lượng hai đội.'}</p>
                      </div>

                      {/* Kèo Tài Xỉu */}
                      <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-gray-455 text-[10px]">KÈO TÀI XỈU (O/U {prediction.ou_line ?? prediction.bets?.overUnder?.line ?? 2.5})</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="bg-secondary/20 text-secondary font-bold px-2 py-0.5 rounded-md text-[10px]">
                              {prediction.recommendation_ou ?? prediction.bets?.overUnder?.recommendation}
                            </span>
                            {renderBetOutcomeBadge('overUnder')}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.overUnder?.reason || 'Khả năng nổ súng của hàng công hai đội.'}</p>
                      </div>

                      {/* Kèo Chấp */}
                      <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-gray-450 text-[10px]">KÈO CHẤP CHÂU Á</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="bg-accent/20 text-accent font-bold px-2 py-0.5 rounded-md text-[10px]">
                              {prediction.recommendation_handicap ?? prediction.bets?.handicap?.recommendation}
                            </span>
                            {renderBetOutcomeBadge('handicap')}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.handicap?.reason || 'Đánh giá kèo châu Á tương thích phong độ.'}</p>
                      </div>

                      {/* Kèo Cả Hai Đội Ghi Bàn (BTTS) */}
                      <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-gray-455 text-[10px]">CẢ HAI ĐỘI GHI BÀN (BTTS)</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="bg-[#1D4ED8]/25 text-blue-400 font-bold px-2 py-0.5 rounded-md text-[10px]">
                              {prediction.recommendation_btts ?? prediction.bets?.btts?.recommendation}
                            </span>
                            {renderBetOutcomeBadge('btts')}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.btts?.reason || 'Phân tích khả năng ghi bàn từ cả hai câu lạc bộ.'}</p>
                      </div>

                      {/* Kèo Phạt Góc */}
                      <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-gray-450 text-[10px]">KÈO PHẠT GÓC (O/U {prediction.corners_line ?? prediction.bets?.corners?.line ?? 8.5})</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="bg-[#581C87]/25 text-purple-400 font-bold px-2 py-0.5 rounded-md text-[10px]">
                              {prediction.recommendation_corners ?? prediction.bets?.corners?.recommendation}
                            </span>
                            {renderBetOutcomeBadge('corners')}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.corners?.reason || 'Tỷ lệ phạt góc dựa trên nhịp độ trận đấu và thói quen đá biên.'}</p>
                      </div>

                      {/* Kèo Thẻ Phạt */}
                      <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-gray-450 text-[10px]">KÈO THẺ PHẠT (O/U {prediction.cards_line ?? prediction.bets?.cards?.line ?? 3.5})</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="bg-[#D97706]/20 text-[#F59E0B] font-bold px-2 py-0.5 rounded-md text-[10px]">
                              {prediction.recommendation_cards ?? prediction.bets?.cards?.recommendation}
                            </span>
                            {renderBetOutcomeBadge('cards')}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.cards?.reason || 'Đánh giá số lượng thẻ phạt từ mức độ quyết liệt và lịch sử phạm lỗi.'}</p>
                      </div>

                    </div>

                    {showOutcome && evalDetails && evalDetails.summary && (
                      <div className="mt-3 pt-2.5 border-t border-card-border/30 text-[10px] text-gray-400 italic flex flex-col space-y-1">
                        <div>
                          📢 <span className="font-bold text-gray-350">AI Nhận Xét:</span> {evalDetails.summary}
                        </div>
                        {evalDetails.modelUsed && (
                          <div className="text-[9px] text-gray-555 font-bold uppercase tracking-wider">
                            🔍 CHẤM ĐIỂM BỞI: {formatModelName(evalDetails.modelUsed)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Result Update Box */}
              <div className="glass-panel rounded-xl p-4 border border-card-border space-y-3.5">
                <div>
                  <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-1">Cập Nhật Kết Quả Thực Tế</h3>
                  <p className="text-[10px] text-gray-500 leading-normal">
                    AI sẽ tự động tra cứu tỉ số thực tế trực tuyến thông qua Google Search để cập nhật kết quả và chấm điểm các dự đoán.
                  </p>
                </div>
                
                {/* Auto Update Button */}
                <button
                  type="button"
                  onClick={handleAutoUpdateResult}
                  disabled={updatingAuto || submitting}
                  className="w-full bg-[#151E2E] hover:bg-primary/20 border border-card-border hover:border-primary/50 text-white font-bold py-2 px-3 rounded-lg text-xs tracking-wider transition-all flex items-center justify-center space-x-1.5 shadow-sm active:scale-[0.99]"
                >
                  <span>🤖</span>
                  <span>{updatingAuto ? 'Đang tìm kiếm & chấm điểm...' : 'TỰ ĐỘNG CẬP NHẬT (AI & GOOGLE SEARCH)'}</span>
                </button>

                {resMessage && (
                  <div className={`mt-3 p-2.5 rounded-lg border text-xs leading-relaxed ${
                    resMessage.success 
                      ? 'border-primary/30 bg-primary/5 text-primary' 
                      : 'border-red-500/30 bg-red-950/10 text-red-400'
                  }`}>
                    {resMessage.text}
                  </div>
                )}
              </div>

            </div>

            {/* AI Tactical Analysis (7 Cols) */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* Warnings */}
              {prediction.isMock && (
                <div className="p-3 rounded-xl border border-accent/40 bg-accent/5 glow-gold text-yellow-300 text-xs flex items-start space-x-2">
                  <span>💡</span>
                  <p className="text-gray-405 leading-relaxed text-xs">
                    <strong>Chế độ giả lập:</strong> Cần cấu hình khóa `GEMINI_API_KEY` trong file <code>.env.local</code> ở máy chủ để chạy nhận định thực tế qua tìm kiếm Google.
                  </p>
                </div>
              )}

              {/* Analysis Text Box */}
              <div className="glass-panel rounded-xl p-4 border border-card-border space-y-4">
                <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider pb-2 border-b border-card-border/50">
                  Phân Tích Tương Quan Lực Lượng
                </h3>

                {/* Model Info */}
                {(prediction.modelUsed || prediction.model_used) && (
                  <div className="text-[9px] text-gray-550 font-bold uppercase tracking-wider flex items-center space-x-1.5 bg-card-border/20 border border-card-border/40 py-0.5 px-3 rounded-full w-fit">
                    <span>MÔ HÌNH: {formatModelName(prediction.modelUsed || prediction.model_used)}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <h4 className="font-extrabold text-xs text-white flex items-center space-x-2">
                    {getTeamFlag(homeTeam, "w-5 h-3.5")}
                    <span>Thế mạnh tuyển {homeTeam}:</span>
                  </h4>
                  <p className="text-xs text-gray-300 leading-relaxed">{prediction.analysis?.homeTeam || prediction.home_team_analysis || 'Sức mạnh tấn công đồng đều.'}</p>
                </div>

                <div className="space-y-1 pt-1.5">
                  <h4 className="font-extrabold text-xs text-white flex items-center space-x-2">
                    {getTeamFlag(awayTeam, "w-5 h-3.5")}
                    <span>Thế mạnh tuyển {awayTeam}:</span>
                  </h4>
                  <p className="text-xs text-gray-300 leading-relaxed">{prediction.analysis?.awayTeam || prediction.away_team_analysis || 'Lối chơi phản công kiên cường.'}</p>
                </div>

                <div className="space-y-2 pt-1.5">
                  <h4 className="font-extrabold text-xs text-white">Yếu tố quyết định trận đấu:</h4>
                  <ul className="space-y-1 text-xs text-gray-300">
                    {(prediction.analysis?.keyFactors || ['Kiểm soát trung tuyến', 'Tình huống cố định', 'Tốc độ phản công']).map((factor, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="text-secondary mr-2">•</span>
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-1.5 pt-1.5">
                  <h4 className="font-extrabold text-xs text-white">Nhận định chi tiết từ chuyên gia AI:</h4>
                  <p className="text-xs text-gray-300 leading-relaxed bg-card-border/10 border border-card-border/40 p-3 rounded-lg font-medium">
                    {prediction.analysis?.predictionReasoning || prediction.prediction_reasoning || 'Nhận định trận đấu chặt chẽ có tỷ số sát nút.'}
                  </p>
                </div>
              </div>

              {/* Citations */}
              {prediction.sources && prediction.sources.length > 0 && (
                <div className="glass-panel rounded-xl p-4 border border-card-border">
                  <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-3">
                    Nguồn thông tin tham chiếu
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {prediction.sources.map((src, idx) => (
                      <a 
                        key={idx}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-card-border/20 border border-card-border hover:border-secondary/40 text-[10px] text-gray-300 hover:text-secondary truncate block"
                      >
                        📰 <span className="font-semibold">{src.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
