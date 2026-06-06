'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getTeamFlag } from '@/lib/flags';

function getPredictionStatus(predHome, predAway, actHome, actAway) {
  if (actHome === null || actHome === undefined || actAway === null || actAway === undefined) {
    return { status: 'pending', text: 'Chờ', colorClass: 'bg-gray-500/10 text-gray-400 border-gray-500/20' };
  }
  
  const pHome = parseInt(predHome, 10);
  const pAway = parseInt(predAway, 10);
  const aHome = parseInt(actHome, 10);
  const aAway = parseInt(actAway, 10);

  if (pHome === aHome && pAway === aAway) {
    return { status: 'correct', text: 'Đúng', colorClass: 'bg-emerald-500/20 text-primary border border-primary/20 shadow-sm' };
  }
  
  const predDiff = pHome - pAway;
  const actDiff = aHome - aAway;
  const predOutcome = predDiff > 0 ? 1 : (predDiff < 0 ? -1 : 0);
  const actOutcome = actDiff > 0 ? 1 : (actDiff < 0 ? -1 : 0);
  
  if (predOutcome === actOutcome) {
    return { status: 'near', text: 'Gần đúng', colorClass: 'bg-amber-500/20 text-amber-400 border border-amber-500/20' };
  }
  
  return { status: 'incorrect', text: 'Sai', colorClass: 'bg-rose-500/20 text-rose-400 border-rose-500/20' };
}

function translateRecommendation(text) {
  if (!text) return '';
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Dịch kèo 1X2
  if (lower === 'home') return 'Đội nhà';
  if (lower === 'away') return 'Đội khách';
  if (lower === 'draw') return 'Hòa';

  // Dịch BTTS
  if (lower === 'yes') return 'Có';
  if (lower === 'no') return 'Không';

  // Dịch Tài Xỉu / Phạt Góc / Thẻ Phạt (Over / Under)
  let translated = trimmed;
  translated = translated.replace(/over/gi, 'Tài');
  translated = translated.replace(/under/gi, 'Xỉu');
  translated = translated.replace(/corners/gi, 'Phạt góc');
  translated = translated.replace(/cards/gi, 'Thẻ phạt');

  return translated;
}

export default function MatchClient({ match }) {
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [loadingStep, setLoadingStep] = useState(0);

  // States cho Form cập nhật kết quả thực tế
  const [actHome, setActHome] = useState('');
  const [actAway, setActAway] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resMessage, setResMessage] = useState(null);
  const [updatingAuto, setUpdatingAuto] = useState(false);

  const loadingSteps = [
    'Đang kết nối tới mô hình AI Google Gemini...',
    'Kích hoạt tính năng Google Search Grounding để quét mạng...',
    'Đang tìm kiếm thông tin chấn thương, đội hình và phong độ mới nhất...',
    'Tính toán xác suất kèo châu Á, tài xỉu, tỷ số và tổng hợp nhận định...'
  ];

  // Rotate loading steps
  useEffect(() => {
    if (!loading && !predicting) return;
    const interval = setInterval(() => {
      setLoadingStep((prev) => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
    }, 2000);
    return () => clearInterval(interval);
  }, [loading, predicting]);

  // Load history when match changes or on mount
  useEffect(() => {
    let active = true;
    
    const initAndLoad = async () => {
      setLoading(true);
      setError(null);
      setPrediction(null);
      setHistoryList([]);
      setResMessage(null);
      setActHome('');
      setActAway('');
      
      try {
        const res = await fetch(`/api/history?matchId=${match.id}`);
        if (!res.ok) throw new Error('Không thể tải lịch sử dự đoán');
        const data = await res.json();
        
        if (!active) return;

        if (data.history && data.history.length > 0) {
          setHistoryList(data.history);
          setPrediction(data.history[0]);
          setLoading(false);
        } else {
          // Tự động kích hoạt dự đoán mới nếu chưa có lịch sử
          await handleRunNewPrediction();
        }
      } catch (err) {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      }
    };

    initAndLoad();

    return () => {
      active = false;
    };
  }, [match.id]);

  const handleRunNewPrediction = async () => {
    const currentMatchId = match.id;
    setPredicting(true);
    setResMessage(null);
    setError(null); // Xóa lỗi cũ trước khi chạy dự đoán mới
    setLoadingStep(0);
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          matchId: currentMatchId,
          forceRefresh: true
        })
      });

      if (!res.ok) {
        throw new Error('Lỗi khi chạy dự đoán AI');
      }

      const newPred = await res.json();
      
      // Nếu người dùng đã chuyển sang trận đấu khác, bỏ qua cập nhật state
      if (match.id !== currentMatchId) return;

      setPrediction(newPred);
      
      // Tải lại lịch sử sau khi dự đoán thành công
      const histRes = await fetch(`/api/history?matchId=${currentMatchId}`);
      if (histRes.ok) {
        const histData = await histRes.json();
        if (match.id === currentMatchId) {
          setHistoryList(histData.history);
        }
      }
    } catch (err) {
      if (match.id === currentMatchId) {
        setError(err.message);
      }
    } finally {
      if (match.id === currentMatchId) {
        setPredicting(false);
        setLoading(false);
      }
    }
  };


  const handleAutoUpdateResult = async () => {
    setUpdatingAuto(true);
    setResMessage(null);
    try {
      const res = await fetch('/api/results/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          matchId: match.id
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi tự động lấy kết quả');

      if (data.success) {
        setResMessage({
          success: true,
          text: `🤖 Tự động cập nhật thành công! Trận đấu kết thúc với tỷ số thực tế: ${data.actualScore.home}-${data.actualScore.away}. ${data.summary || ''}`
        });

        setActHome(data.actualScore.home);
        setActAway(data.actualScore.away);

        // Tải lại lịch sử để cập nhật UI
        const histRes = await fetch(`/api/history?matchId=${match.id}`);
        if (histRes.ok) {
          const histData = await histRes.json();
          setHistoryList(histData.history);
          const updatedPred = histData.history.find(h => h.id === prediction.id);
          if (updatedPred) setPrediction(updatedPred);
        }
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
      const d = new Date(dateStr);
      // SQLite returns UTC, format cleanly in VN timezone
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen py-5 bg-gradient-to-b from-[#0B0F17] via-[#0D1527] to-[#0A0D14] px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        
        {/* Navigation back */}
        <div className="mb-4">
          <Link href="/" className="text-gray-405 hover:text-primary transition-colors text-xs flex items-center space-x-1">
            <span>← Quay lại danh sách trận đấu</span>
          </Link>
        </div>

        {/* Match Header Card */}
        <div className="glass-panel rounded-2xl p-4 mb-4 border border-card-border overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="text-center text-[10px] text-gray-500 font-semibold mb-3 flex items-center justify-center space-x-2">
            <span className="bg-card-border px-2.5 py-0.5 rounded-full uppercase tracking-wider">{match.group}</span>
            <span>•</span>
            <span>{match.date} • {match.time}</span>
          </div>

          <div className="flex flex-row items-center justify-between px-2 sm:px-8">
            <div className="flex items-center space-x-3 w-5/12 justify-end">
              <span className="font-extrabold text-sm sm:text-base text-white text-right">{match.homeTeam}</span>
              {getTeamFlag(match.homeTeam, "w-10 h-7 sm:w-12 sm:h-8.5")}
            </div>
            <div className="w-2/12 flex justify-center">
              <span className="text-[10px] font-black text-gray-600 tracking-wider border border-card-border/60 bg-[#0B0F17] px-2.5 py-0.5 rounded-full glow-green">
                VS
              </span>
            </div>
            <div className="flex items-center space-x-3 w-5/12 justify-start">
              {getTeamFlag(match.awayTeam, "w-10 h-7 sm:w-12 sm:h-8.5")}
              <span className="font-extrabold text-sm sm:text-base text-white text-left">{match.awayTeam}</span>
            </div>
          </div>

          <div className="text-center mt-3 pt-3 border-t border-card-border/30 text-[10px] text-gray-500 flex items-center justify-center space-x-1">
            <span>📍 Sân:</span>
            <span className="text-gray-300 font-semibold">{match.venue}</span>
          </div>
        </div>

        {/* LOADING STATE */}
        {loading && !prediction && (
          <div className="glass-panel rounded-2xl p-8 text-center border border-card-border flex flex-col items-center justify-center min-h-[250px]">
            <div className="h-10 w-10 mb-4 relative">
              <div className="absolute inset-0 rounded-full border-3 border-card-border border-t-primary animate-spin"></div>
              <span className="absolute inset-0 flex items-center justify-center text-xl animate-bounce">⚽</span>
            </div>
            <h3 className="text-white font-bold text-sm mb-1">Đang phân tích trận đấu...</h3>
            <p className="text-primary text-xs font-semibold max-w-sm h-8 flex items-center justify-center">
              {loadingSteps[loadingStep]}
            </p>
          </div>
        )}

        {/* NEW PREDICTION PROGRESS (INITIAL ONLY) */}
        {predicting && !prediction && (
          <div className="glass-panel rounded-2xl p-8 text-center border border-card-border/80 flex flex-col items-center justify-center min-h-[250px] mb-4">
            <div className="h-10 w-10 mb-4 relative">
              <div className="absolute inset-0 rounded-full border-3 border-card-border border-t-secondary animate-spin"></div>
              <span className="absolute inset-0 flex items-center justify-center text-xl animate-bounce">🧠</span>
            </div>
            <h3 className="text-white font-bold text-sm mb-1">Đang chạy dự đoán mới...</h3>
            <p className="text-secondary text-xs font-semibold max-w-sm h-8 flex items-center justify-center">
              Quét mạng xã hội & tin tức thể thao thông qua Google Search Grounding...
            </p>
          </div>
        )}

        {/* ERROR STATE (INITIAL ONLY) */}
        {error && !prediction && (
          <div className="glass-panel rounded-2xl p-6 text-center border border-red-500/30 bg-red-950/10 mb-4">
            <span className="text-3xl block mb-2">❌</span>
            <h3 className="text-red-400 font-bold text-sm mb-1">Đã xảy ra lỗi khi lấy nhận định</h3>
            <p className="text-gray-400 text-xs mb-4">{error}</p>
            <button 
              onClick={() => {
                setError(null);
                setLoading(true);
                fetch(`/api/history?matchId=${match.id}`)
                  .then(res => {
                    if (!res.ok) throw new Error('Không thể tải lịch sử');
                    return res.json();
                  })
                  .then(data => {
                    if (data.history && data.history.length > 0) {
                      setHistoryList(data.history);
                      setPrediction(data.history[0]);
                      setLoading(false);
                    } else {
                      handleRunNewPrediction();
                    }
                  })
                  .catch(err => {
                    setError(err.message);
                    setLoading(false);
                  });
              }}
              className="bg-card-border hover:bg-card-border/80 border border-card-border text-white font-bold py-1.5 px-4 rounded-xl text-xs transition-all cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* PREDICTION CONTENT (LOADED) */}
        {prediction && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Inline Notifications (Error / Progress) */}
            {error && (
              <div className="lg:col-span-12 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-[11px] text-rose-400 leading-relaxed flex items-center justify-between animate-fade-in shadow-lg">
                <span className="flex items-center space-x-1.5">
                  <span>🔴</span>
                  <span><strong>Yêu cầu dự đoán mới thất bại:</strong> {error}</span>
                </span>
                <button 
                  onClick={() => setError(null)} 
                  className="text-gray-400 hover:text-white font-bold px-2 py-0.5 rounded border border-card-border/60 hover:bg-card-border/20 text-[10px] cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            )}

            {predicting && (
              <div className="lg:col-span-12 p-3 rounded-xl border border-secondary/30 bg-secondary/5 text-[11px] text-secondary leading-relaxed flex items-center space-x-2 animate-pulse shadow-lg">
                <span>🧠</span>
                <div>
                  <strong>Tiến trình AI:</strong>{' '}
                  <span className="text-gray-300">{loadingSteps[loadingStep]}</span>
                </div>
              </div>
            )}
            
            {/* Left Column: Match Predictions & Bets & Runs History (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              
              {/* Context Feedback Indicator Banner */}
              {prediction.historicalAccuracy && (
                <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 glow-green flex items-start space-x-2 text-[11px] text-primary leading-relaxed">
                  <span>🤖</span>
                  <div>
                    <p className="font-bold">Đã kích hoạt Học máy (In-Context Learning)</p>
                    <p className="text-gray-400 mt-0.5">
                      AI đã phân tích lịch sử <strong>{prediction.historicalAccuracy.total}</strong> lần dự đoán trước để giảm sai lệch. Tỷ lệ đoán trúng kết quả (1X2): <strong>{prediction.historicalAccuracy.rate}%</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* Prediction Run selector & Run New Predict */}
              <div className="glass-panel rounded-xl p-4 border border-card-border flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Phiên Dự Đoán</span>
                  <span className="text-xs text-white font-semibold mt-0.5">ID: Lượt #{prediction.id}</span>
                </div>
                <button
                  onClick={handleRunNewPrediction}
                  disabled={predicting}
                  className={`bg-gradient-to-r from-primary to-secondary text-white font-bold py-2 px-4 rounded-xl text-xs tracking-wider transition-all duration-150 flex items-center space-x-1.5 shadow-md shadow-primary/10 ${
                    predicting ? 'opacity-50 cursor-not-allowed scale-100' : 'hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                  }`}
                >
                  {predicting ? (
                    <>
                      <span className="animate-spin inline-block">🔄</span>
                      <span>ĐANG DỰ ĐOÁN...</span>
                    </>
                  ) : (
                    <>
                      <span>🧠</span>
                      <span>DỰ ĐOÁN MỚI</span>
                    </>
                  )}
                </button>
              </div>

              {/* Win Probability & Score Card */}
              <div className="glass-panel rounded-xl p-4 border border-card-border glow-green relative overflow-hidden">
                <h3 className="text-gray-400 font-bold text-xs mb-4 uppercase tracking-wider">Tỷ Số Dự Đoán & Xác Suất</h3>
                
                <div className="flex items-center justify-center space-x-6 my-4">
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-semibold text-gray-500 mb-1 truncate max-w-[100px]">{match.homeTeam}</span>
                    <span className="text-4xl font-black text-white glow-green">{prediction.predicted_home_score ?? prediction.predictedScore?.home}</span>
                  </div>
                  <span className="text-xl font-bold text-card-border">-</span>
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-semibold text-gray-500 mb-1 truncate max-w-[100px]">{match.awayTeam}</span>
                    <span className="text-4xl font-black text-white glow-cyan">{prediction.predicted_away_score ?? prediction.predictedScore?.away}</span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {/* Read values safely supporting DB columns and API payload properties */}
                  {(() => {
                    const prob = {
                      home: prediction.win_prob_home ?? prediction.winProbability?.home ?? 33,
                      draw: prediction.win_prob_draw ?? prediction.winProbability?.draw ?? 34,
                      away: prediction.win_prob_away ?? prediction.winProbability?.away ?? 33
                    };
                    return (
                      <>
                        <div className="flex justify-between text-[10px] font-semibold text-gray-400">
                          <span>{match.homeTeam} ({prob.home}%)</span>
                          <span>Hòa ({prob.draw}%)</span>
                          <span>{match.awayTeam} ({prob.away}%)</span>
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
                  <h3 className="text-gray-400 font-bold text-xs mb-3 uppercase tracking-wider flex items-center justify-between">
                    <span>Lịch sử các lần dự đoán</span>
                    <span className="text-[10px] text-gray-500 font-normal">Click để so sánh</span>
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {historyList.map((run, idx) => {
                      const isActive = run.id === prediction.id;
                      // Read score fields supporting database fields or nested API payload fields
                      const pHome = run.predicted_home_score ?? run.predictedScore?.home;
                      const pAway = run.predicted_away_score ?? run.predictedScore?.away;
                      
                      const actualHome = run.actual_home_score;
                      const actualAway = run.actual_away_score;
                      const hasActualResult = actualHome !== null && actualHome !== undefined;

                      return (
                        <div
                          key={run.id}
                          onClick={() => setPrediction(run)}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all duration-150 flex items-center justify-between ${
                            isActive 
                              ? 'border-primary bg-primary/5 text-white shadow-sm glow-green' 
                              : 'border-card-border/60 hover:border-card-border bg-card-border/10 text-gray-400 hover:text-white'
                          }`}
                        >
                          <div className="flex flex-col space-y-0.5">
                            <span className="font-bold"># Lượt {historyList.length - idx}</span>
                            <span className="text-[9px] text-gray-500">{formatDate(run.created_at)}</span>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-extrabold text-sm text-gray-200 bg-card-border/30 px-2 py-0.5 rounded border border-card-border/30">
                              Dự đoán: {pHome}-{pAway}
                            </span>
                            {hasActualResult && (() => {
              const status = getPredictionStatus(pHome, pAway, actualHome, actualAway);
              return (
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${status.colorClass}`}>
                  {status.text} ({actualHome}-{actualAway})
                </span>
              );
            })()}
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
                    <h3 className="text-gray-400 font-bold text-xs mb-3 uppercase tracking-wider">Soi Kèo Cùng AI Pundit</h3>
                    
                    <div className="space-y-3 text-xs">
                      {/* Kèo 1X2 */}
                      <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Kèo Châu Âu (1X2)</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="bg-primary/20 text-primary border border-primary/20 font-bold px-1.5 py-0.5 rounded text-[10px]">
                              {translateRecommendation(prediction.recommendation_1x2 ?? prediction.bets?.oneXTwo?.recommendation)}
                            </span>
                            {renderBetOutcomeBadge('oneXTwo')}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.oneXTwo?.reason || 'Phân tích dựa trên sức mạnh kiểm soát và lợi thế tổng thể.'}</p>
                      </div>

                      {/* Kèo Tài Xỉu */}
                      <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Kèo Tài Xỉu (O/U)</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="bg-secondary/20 text-secondary border border-secondary/20 font-bold px-1.5 py-0.5 rounded text-[10px]">
                              {translateRecommendation(prediction.recommendation_ou ?? prediction.bets?.overUnder?.recommendation)}
                            </span>
                            {renderBetOutcomeBadge('overUnder')}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.overUnder?.reason || 'Tính toán tần suất và phong độ tấn công/phòng ngự của 2 đội.'}</p>
                      </div>

                      {/* Kèo Chấp */}
                      <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Kèo Chấp Châu Á</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="bg-accent/20 text-accent border border-accent/20 font-bold px-1.5 py-0.5 rounded text-[10px]">
                              {translateRecommendation(prediction.recommendation_handicap ?? prediction.bets?.handicap?.recommendation)}
                            </span>
                            {renderBetOutcomeBadge('handicap')}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.handicap?.reason || 'Đánh giá tỷ lệ chấp kèo châu Á tương quan lực lượng.'}</p>
                      </div>

                      {/* Kèo Cả Hai Đội Ghi Bàn (BTTS) */}
                      <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Cả Hai Đội Ghi Bàn (BTTS)</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="bg-[#1D4ED8]/25 text-blue-400 border border-[#1D4ED8]/30 font-bold px-1.5 py-0.5 rounded text-[10px]">
                              {translateRecommendation(prediction.recommendation_btts ?? prediction.bets?.btts?.recommendation)}
                            </span>
                            {renderBetOutcomeBadge('btts')}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.btts?.reason || 'Phân tích khả năng ghi bàn từ cả hai câu lạc bộ.'}</p>
                      </div>

                      {/* Kèo Phạt Góc */}
                      <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Kèo Phạt Góc (O/U 8.5)</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="bg-[#581C87]/25 text-purple-400 border border-[#581C87]/30 font-bold px-1.5 py-0.5 rounded text-[10px]">
                              {translateRecommendation(prediction.recommendation_corners ?? prediction.bets?.corners?.recommendation)}
                            </span>
                            {renderBetOutcomeBadge('corners')}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.corners?.reason || 'Tỷ lệ phạt góc dựa trên nhịp độ trận đấu và thói quen đá biên.'}</p>
                      </div>

                      {/* Kèo Thẻ Phạt */}
                      <div className="p-3 rounded-lg bg-card-border/20 border border-card-border/50">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Kèo Thẻ Phạt (O/U 3.5)</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="bg-[#D97706]/20 text-[#F59E0B] border border-[#D97706]/35 font-bold px-1.5 py-0.5 rounded text-[10px]">
                              {translateRecommendation(prediction.recommendation_cards ?? prediction.bets?.cards?.recommendation)}
                            </span>
                            {renderBetOutcomeBadge('cards')}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-[11px]">{prediction.bets?.cards?.reason || 'Đánh giá số lượng thẻ phạt từ mức độ quyết liệt và lịch sử phạm lỗi.'}</p>
                      </div>
                    </div>

                    {showOutcome && evalDetails && evalDetails.summary && (
                      <div className="mt-3 pt-2.5 border-t border-card-border/30 text-[10px] text-gray-400 italic">
                        📢 <span className="font-bold text-gray-350">AI Nhận Xét:</span> {evalDetails.summary}
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>

            {/* Right Column: AI Analysis & Search Sources & Result Entry (7 Cols) */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* Detailed AI Analysis */}
              <div className="glass-panel rounded-xl p-4 border border-card-border space-y-4">
                <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider pb-2 border-b border-card-border/50">
                  Nhận Định Chiến Thuật & Lực Lượng
                </h3>

                {/* Model Info */}
                {!prediction.isMock && (prediction.modelUsed || prediction.model_used) && (
                  <div className="text-[9px] text-gray-550 font-bold uppercase tracking-wider flex items-center space-x-1.5 bg-card-border/20 border border-card-border/40 py-0.5 px-3 rounded-full w-fit">
                    <span>MÔ HÌNH: {prediction.modelUsed || prediction.model_used || 'gemini-2.5-flash'}</span>
                  </div>
                )}

                {/* Home/Away Analyses */}
                <div className="space-y-1">
                  <h4 className="font-extrabold text-xs text-white flex items-center space-x-1.5">
                    {getTeamFlag(match.homeTeam, "w-5 h-3.5")}
                    <span>Phân tích tuyển {match.homeTeam}:</span>
                  </h4>
                  <p className="text-xs text-gray-300 leading-relaxed">{prediction.analysis?.homeTeam || prediction.home_team_analysis || 'Đội tuyển sở hữu lối chơi đồng đều, tuyến tiền vệ tổ chức tốt.'}</p>
                </div>

                <div className="space-y-1 pt-1.5">
                  <h4 className="font-extrabold text-xs text-white flex items-center space-x-1.5">
                    {getTeamFlag(match.awayTeam, "w-5 h-3.5")}
                    <span>Phân tích tuyển {match.awayTeam}:</span>
                  </h4>
                  <p className="text-xs text-gray-300 leading-relaxed">{prediction.analysis?.awayTeam || prediction.away_team_analysis || 'Đội hình có thiên hướng phòng ngự phản công kỷ luật cao.'}</p>
                </div>

                {/* Key Factors */}
                {prediction.analysis?.keyFactors && (
                  <div className="space-y-1.5 pt-1.5">
                    <h4 className="font-extrabold text-xs text-white">Yếu tố quyết định trận đấu:</h4>
                    <ul className="space-y-1">
                      {prediction.analysis.keyFactors.map((factor, idx) => (
                        <li key={idx} className="flex items-start text-xs text-gray-300">
                          <span className="text-primary mr-1.5">✓</span>
                          <span>{factor}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tactical reasoning */}
                <div className="space-y-1.5 pt-1.5">
                  <h4 className="font-extrabold text-xs text-white">Lý giải chi tiết:</h4>
                  <p className="text-xs text-gray-300 leading-relaxed bg-card-border/10 border border-card-border/40 p-3 rounded-lg font-medium">
                    {prediction.analysis?.predictionReasoning || prediction.prediction_reasoning || 'AI đánh giá cao khả năng áp đặt lối chơi và ghi bàn đột biến của bên tấn công.'}
                  </p>
                </div>
              </div>

              {/* Admin Results Update Panel */}
              <div className="glass-panel rounded-xl p-4 border border-card-border space-y-3.5">
                <div>
                  <h3 className="text-gray-400 font-bold text-xs mb-1 uppercase tracking-wider">Cập Nhật Kết Quả Thực Tế</h3>
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

              {/* Grounded Sources */}
              {prediction.sources && prediction.sources.length > 0 && (
                <div className="glass-panel rounded-xl p-4 border border-card-border">
                  <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-3">
                    Nguồn tin tham khảo (Google Search Grounding)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {prediction.sources.map((src, idx) => (
                      <a 
                        key={idx}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-card-border/20 border border-card-border hover:border-primary/50 transition-colors flex items-center space-x-1.5 text-xs text-gray-300 hover:text-primary"
                      >
                        <span>📰</span>
                        <span className="truncate flex-1 font-semibold text-[10px]">{src.title}</span>
                        <span className="text-gray-500 font-bold text-[10px]">↗</span>
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
