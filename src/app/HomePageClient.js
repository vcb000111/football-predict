'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { saveLastUsedModel, formatModelName } from '@/lib/models-client';
import { getTeamFlag, getTeamFlagEmoji } from '@/lib/flags';
import { getVNTime } from '@/lib/timezone';

export function getPredictionStatus(predHome, predAway, actHome, actAway) {
  if (actHome === null || actHome === undefined || actAway === null || actAway === undefined) {
    return { status: 'pending', text: 'Chờ thi đấu', colorClass: 'bg-gray-500/10 text-gray-400 border-gray-500/20' };
  }
  
  const pHome = parseInt(predHome, 10);
  const pAway = parseInt(predAway, 10);
  const aHome = parseInt(actHome, 10);
  const aAway = parseInt(actAway, 10);

  // Đúng hoàn toàn (Đúng cả tỷ số)
  if (pHome === aHome && pAway === aAway) {
    return { status: 'correct', text: 'Đúng tỷ số', colorClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 glow-green-sm' };
  }
  
  // Gần đúng (Đúng kết quả 1X2 nhưng lệch tỷ số)
  const predDiff = pHome - pAway;
  const actDiff = aHome - aAway;
  const predOutcome = predDiff > 0 ? 1 : (predDiff < 0 ? -1 : 0);
  const actOutcome = actDiff > 0 ? 1 : (actDiff < 0 ? -1 : 0);
  
  if (predOutcome === actOutcome) {
    return { status: 'near', text: 'Gần đúng', colorClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
  }
  
  // Sai hoàn toàn
  return { status: 'incorrect', text: 'Sai kết quả', colorClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30' };
}

export default function HomePageClient({ initialData, isKeyConfigured, historyCounts = {}, latestPredictions = {} }) {
  const [activeTab, setActiveTab] = useState('fixtures'); // 'fixtures', 'test-matches' or 'groups'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('All');
  const [selectedTournamentFilter, setSelectedTournamentFilter] = useState('All');
  const [selectedSeasonFilter, setSelectedSeasonFilter] = useState('All');
  const [layout, setLayout] = useState('grid'); // 'grid' or 'list'
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'group' | 'history'
  const [showPastMatches, setShowPastMatches] = useState(false);
  
  // States cho cơ chế đồng bộ đa giải đấu & xem trước (Preview Modal)
  const [showSyncConfigModal, setShowSyncConfigModal] = useState(false);
  const [syncTournament, setSyncTournament] = useState('World Cup 2026');
  const [syncSeason, setSyncSeason] = useState('2026');
  const [customTournament, setCustomTournament] = useState('');
  const [customSeason, setCustomSeason] = useState('');
  const [syncPreviewMatches, setSyncPreviewMatches] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  const [quickPredicting, setQuickPredicting] = useState({});
  const [activePredictMenu, setActivePredictMenu] = useState(null);
  const [activeActionMenu, setActiveActionMenu] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [localHistoryCounts, setLocalHistoryCounts] = useState(historyCounts);
  const [localLatestPredictions, setLocalLatestPredictions] = useState(latestPredictions);
  const [localFixtures, setLocalFixtures] = useState(initialData.fixtures);
  const [updatingAutoList, setUpdatingAutoList] = useState({});
  const [resultModalData, setResultModalData] = useState(null);
  const [syncingStats, setSyncingStats] = useState({});
  const [toastMessage, setToastMessage] = useState(null);

  // Sync state with props when parent updates
  useEffect(() => {
    setLocalHistoryCounts(historyCounts);
  }, [historyCounts]);

  useEffect(() => {
    setLocalLatestPredictions(latestPredictions);
  }, [latestPredictions]);

  useEffect(() => {
    setLocalFixtures(initialData.fixtures);
  }, [initialData.fixtures]);


  const [isRestored, setIsRestored] = useState(false);

  // Load persisted states from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const persistedTab = localStorage.getItem('homepage_active_tab');
      if (persistedTab) setActiveTab(persistedTab);

      const persistedLayout = localStorage.getItem('homepage_layout');
      if (persistedLayout) setLayout(persistedLayout);

      const persistedSortBy = localStorage.getItem('homepage_sort_by');
      if (persistedSortBy) setSortBy(persistedSortBy);

      const persistedGroupFilter = localStorage.getItem('homepage_group_filter');
      if (persistedGroupFilter) setSelectedGroupFilter(persistedGroupFilter);

      const persistedTournamentFilter = localStorage.getItem('homepage_tournament_filter');
      if (persistedTournamentFilter) setSelectedTournamentFilter(persistedTournamentFilter);

      const persistedSeasonFilter = localStorage.getItem('homepage_season_filter');
      if (persistedSeasonFilter) setSelectedSeasonFilter(persistedSeasonFilter);

      const persistedSearch = localStorage.getItem('homepage_search_query');
      if (persistedSearch) setSearchQuery(persistedSearch);
      
      const persistedShowPastMatches = localStorage.getItem('homepage_show_past_matches');
      if (persistedShowPastMatches) setShowPastMatches(persistedShowPastMatches === 'true');

      const persistedSyncTournament = localStorage.getItem('homepage_sync_tournament');
      if (persistedSyncTournament) setSyncTournament(persistedSyncTournament);

      const persistedSyncSeason = localStorage.getItem('homepage_sync_season');
      if (persistedSyncSeason) setSyncSeason(persistedSyncSeason);
      
      setIsRestored(true);
    }
  }, []);

  // Save states to localStorage when they change
  useEffect(() => {
    if (isRestored && typeof window !== 'undefined') {
      localStorage.setItem('homepage_active_tab', activeTab);
    }
  }, [activeTab, isRestored]);

  useEffect(() => {
    if (isRestored && typeof window !== 'undefined') {
      localStorage.setItem('homepage_layout', layout);
    }
  }, [layout, isRestored]);

  useEffect(() => {
    if (isRestored && typeof window !== 'undefined') {
      localStorage.setItem('homepage_sort_by', sortBy);
    }
  }, [sortBy, isRestored]);

  useEffect(() => {
    if (isRestored && typeof window !== 'undefined') {
      localStorage.setItem('homepage_group_filter', selectedGroupFilter);
    }
  }, [selectedGroupFilter, isRestored]);

  useEffect(() => {
    if (isRestored && typeof window !== 'undefined') {
      localStorage.setItem('homepage_search_query', searchQuery);
    }
  }, [searchQuery, isRestored]);

  useEffect(() => {
    if (isRestored && typeof window !== 'undefined') {
      localStorage.setItem('homepage_tournament_filter', selectedTournamentFilter);
    }
  }, [selectedTournamentFilter, isRestored]);

  useEffect(() => {
    if (isRestored && typeof window !== 'undefined') {
      localStorage.setItem('homepage_season_filter', selectedSeasonFilter);
    }
  }, [selectedSeasonFilter, isRestored]);

  useEffect(() => {
    if (isRestored && typeof window !== 'undefined') {
      localStorage.setItem('homepage_show_past_matches', showPastMatches.toString());
    }
  }, [showPastMatches, isRestored]);

  useEffect(() => {
    if (isRestored && typeof window !== 'undefined') {
      localStorage.setItem('homepage_sync_tournament', syncTournament);
    }
  }, [syncTournament, isRestored]);

  useEffect(() => {
    if (isRestored && typeof window !== 'undefined') {
      localStorage.setItem('homepage_sync_season', syncSeason);
    }
  }, [syncSeason, isRestored]);

  useEffect(() => {
    if (selectedSeasonFilter !== 'All') {
      const currentTabFixtures = activeTab === 'test-matches' 
        ? localFixtures.filter(f => f.isTest) 
        : localFixtures.filter(f => !f.isTest);
      const hasMatchInNewTab = currentTabFixtures.some(f => f.season === selectedSeasonFilter);
      if (!hasMatchInNewTab) {
        setSelectedSeasonFilter('All');
      }
    }
  }, [activeTab, localFixtures]);

  // Đóng menu khi click bên ngoài
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (activePredictMenu && !e.target.closest('.predict-menu-container')) {
        setActivePredictMenu(null);
      }
      if (activeActionMenu && !e.target.closest('.action-menu-container')) {
        setActiveActionMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activePredictMenu, activeActionMenu]);


  const handleQuickPredict = async (fixture, type = 'full_time', fHome = null, fAway = null) => {
    if (quickPredicting[fixture.id]) return;
    setQuickPredicting(prev => ({ ...prev, [fixture.id]: true }));
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          matchId: fixture.id,
          predictType: type,
          firstHalfHomeScore: fHome,
          firstHalfAwayScore: fAway
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi phân tích trận đấu');
      if (data.modelUsed) {
        saveLastUsedModel(data.modelUsed);
      }
      
      
      setModalData({
        fixture,
        prediction: data
      });

      // Update history counts instantly on the client side
      setLocalHistoryCounts(prev => ({
        ...prev,
        [fixture.id]: (prev[fixture.id] || 0) + 1
      }));

      // Update latest predictions instantly on the client side
      setLocalLatestPredictions(prev => ({
        ...prev,
        [fixture.id]: {
          predictedHomeScore: data.predictedScore?.home ?? data.predicted_home_score,
          predictedAwayScore: data.predictedScore?.away ?? data.predicted_away_score,
          actualHomeScore: fixture.actualHomeScore,
          actualAwayScore: fixture.actualAwayScore,
          predictType: type,
          actualFirstHalfHomeScore: fixture.actualFirstHalfScore?.home ?? null,
          actualFirstHalfAwayScore: fixture.actualFirstHalfScore?.away ?? null,
          isCorrect: null
        }
      }));
    } catch (err) {
      alert(`Lỗi phân tích nhanh: ${err.message}`);
    } finally {
      setQuickPredicting(prev => ({ ...prev, [fixture.id]: false }));
    }
  };

  const handleAutoUpdate = async (fixture) => {
    if (updatingAutoList[fixture.id]) return;

    // Nếu trận đấu đã có kết quả thực tế, mặc định Force Update
    let isForce = false;
    if (fixture.actualHomeScore !== null && fixture.actualHomeScore !== undefined && fixture.actualAwayScore !== null && fixture.actualAwayScore !== undefined) {
      isForce = true;
    }

    setUpdatingAutoList(prev => ({ ...prev, [fixture.id]: true }));
    try {
      const historyCount = localHistoryCounts[fixture.id] || 0;
      if (historyCount === 0) {
        // Run predict first to save prediction row in SQLite
        const predRes = await fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            matchId: fixture.id
          })
        });
        const predData = await predRes.json();
        if (!predRes.ok) throw new Error(predData.error || 'Lỗi khi dự đoán tự động');
        
        setLocalHistoryCounts(prev => ({
          ...prev,
          [fixture.id]: 1
        }));
      }

      const res = await fetch('/api/results/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          matchId: fixture.id,
          force: isForce
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi tự động lấy kết quả');

      if (data.success && data.actualScore) {
        setLocalFixtures(prev => 
          prev.map(f => {
            if (f.id === fixture.id) {
              return {
                ...f,
                actualHomeScore: data.actualScore.home,
                actualAwayScore: data.actualScore.away
              };
            }
            return f;
          })
        );

        // Update latest predictions actual scores instantly
        setLocalLatestPredictions(prev => {
          if (prev[fixture.id]) {
            return {
              ...prev,
              [fixture.id]: {
                ...prev[fixture.id],
                actualHomeScore: data.actualScore.home,
                actualAwayScore: data.actualScore.away
              }
            };
          }
          return prev;
        });

        setResultModalData({
          fixture,
          success: true,
          actualScore: data.actualScore,
          summary: data.summary,
          betEvaluations: data.betEvaluations,
          modelUsed: data.modelUsed
        });
      } else {
        setResultModalData({
          fixture,
          success: false,
          status: data.status || 'not_started',
          message: data.message || 'Không tìm thấy kết quả thực tế trực tuyến.'
        });
      }
    } catch (err) {
      setResultModalData({
        fixture,
        success: false,
        status: 'error',
        message: err.message
      });
    } finally {
      setUpdatingAutoList(prev => ({ ...prev, [fixture.id]: false }));
    }
  };

  const handleSyncFixtures = async (tournamentVal, seasonVal) => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/fixtures/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament: tournamentVal,
          season: seasonVal
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi đồng bộ lịch thi đấu');
      
      if (data.newFixtures && data.newFixtures.length > 0) {
        setSyncPreviewMatches(data.newFixtures);
        setShowSyncConfigModal(false);
        showToast(`Quét thành công! Tìm thấy ${data.newFixtures.length} trận đấu mới.`, true);
      } else {
        showToast('Không có trận đấu mới nào được tìm thấy.', true);
      }
    } catch (err) {
      showToast(`Đồng bộ thất bại: ${err.message}`, false);
    } finally {
      setSyncing(false);
    }
  };

  const handleImportMatches = async (fixturesToImport) => {
    if (isImporting) return;
    setIsImporting(true);
    try {
      const res = await fetch('/api/fixtures/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixturesToImport })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi import lịch thi đấu');
      
      showToast(data.message || 'Đã thêm trận đấu thành công!', true);
      setSyncPreviewMatches(null);
      
      // Reload trang để đồng bộ hoàn toàn dữ liệu
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      showToast(`Lỗi import: ${err.message}`, false);
      setIsImporting(false);
    }
  };

  const showToast = (text, success = true) => {
    setToastMessage({ text, success });
    setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  };

  const handleUpdateMatchStats = async (fixture) => {
    if (syncingStats[fixture.id]) return;
    setSyncingStats(prev => ({ ...prev, [fixture.id]: true }));
    try {
      const res = await fetch('/api/admin/teams/ai-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamNames: [fixture.homeTeam, fixture.awayTeam] })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Đã đồng bộ Stats cho ${fixture.homeTeam} & ${fixture.awayTeam} thành công!`, true);
      } else {
        throw new Error(data.error || 'Cập nhật Stats thất bại');
      }
    } catch (err) {
      showToast(`Lỗi cập nhật Stats: ${err.message}`, false);
    } finally {
      setSyncingStats(prev => ({ ...prev, [fixture.id]: false }));
    }
  };

  const { groups } = initialData;

  // Phân chia trận đấu chính thức và trận thử nghiệm
  const displayFixtures = activeTab === 'test-matches' 
    ? localFixtures.filter(f => f.isTest) 
    : localFixtures.filter(f => !f.isTest);

  // Lấy danh sách giải đấu duy nhất của các trận đấu hiển thị
  const uniqueTournaments = Array.from(
    new Set(displayFixtures.map(f => f.tournament).filter(Boolean))
  );

  // Lấy danh sách mùa giải duy nhất của các trận đấu hiển thị
  const uniqueSeasons = Array.from(
    new Set(displayFixtures.map(f => f.season).filter(Boolean))
  ).sort();

  // Lọc lịch thi đấu dựa trên tìm kiếm, bảng đấu, giải đấu, mùa giải và trận đấu đã qua
  const filteredFixtures = displayFixtures.filter(fixture => {
    const matchesSearch = 
      fixture.homeTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fixture.awayTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fixture.group.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesGroup = selectedGroupFilter === 'All' || fixture.group === selectedGroupFilter;
    const matchesTournament = selectedTournamentFilter === 'All' || fixture.tournament === selectedTournamentFilter;
    const matchesSeason = selectedSeasonFilter === 'All' || fixture.season === selectedSeasonFilter;
    
    const isPast = fixture.actualHomeScore !== null && fixture.actualHomeScore !== undefined;
    const matchesPastFilter = showPastMatches || !isPast;
    
    return matchesSearch && matchesGroup && matchesTournament && matchesSeason && matchesPastFilter;
  });

  // Sắp xếp các trận đấu dựa trên sortBy
  const sortedAndFilteredFixtures = [...filteredFixtures].sort((a, b) => {
    if (sortBy === 'group') {
      return a.group.localeCompare(b.group);
    } else if (sortBy === 'history') {
      const countA = localHistoryCounts[a.id] || 0;
      const countB = localHistoryCounts[b.id] || 0;
      if (countB !== countA) {
        return countB - countA; // Sắp xếp giảm dần theo số lượt dự đoán
      }
    }
    // Mặc định: sắp xếp theo ngày giờ VN
    const timeA = getVNTime(a.date, a.time, a.venue);
    const timeB = getVNTime(b.date, b.time, b.venue);
    if (timeA.date !== timeB.date) {
      return timeA.date.localeCompare(timeB.date);
    }
    return timeA.time.localeCompare(timeB.time);
  });

  return (
    <div className="min-h-screen pb-6 bg-gradient-to-b from-[#0B0F17] via-[#0D1527] to-[#0A0D14]">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-5 right-5 z-50 p-4 rounded-xl border text-xs font-semibold backdrop-blur-md shadow-2xl transition-all duration-300 animate-slide-in ${
          toastMessage.success 
            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
            : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
        }`}>
          <div className="flex items-center space-x-2">
            <span>{toastMessage.success ? '✅' : '🔴'}</span>
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}
      
      {/* Hero Header Section */}
      <section className="relative overflow-hidden py-5 border-b border-card-border/50">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-primary/5 blur-[80px] pointer-events-none"></div>
        <div className="absolute top-1/3 right-1/4 translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-secondary/5 blur-[80px] pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          
          {/* Warning Banner if API Key is missing */}
          {!isKeyConfigured && (
            <div className="mb-6 max-w-xl mx-auto glass-panel border border-accent/40 rounded-xl p-3.5 bg-accent/5 glow-gold">
              <div className="flex items-center space-x-2.5">
                <span className="text-xl">⚠️</span>
                <p className="text-xs text-yellow-300 text-left">
                  <strong>Mock Mode:</strong> Hãy tạo file <code>.env.local</code> và điền <code>GEMINI_API_KEY</code> hoặc <code>GEMINI_API_KEYS</code> để kích hoạt dự đoán AI thời gian thực.
                </p>
              </div>
            </div>
          )}

          <span className="inline-flex items-center space-x-1.5 bg-primary/10 border border-primary/30 rounded-full px-3 py-1 text-[10px] font-bold text-primary mb-3 tracking-wider uppercase">
            ⚽ FIFA WORLD CUP 2026 PREDICTOR
          </span>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
            Dự Đoán Kết Quả Bằng <span className="text-gradient">AI Thế Hệ Mới</span>
          </h1>
          
          <p className="max-w-xl mx-auto text-xs sm:text-sm text-gray-400 mb-6 leading-relaxed">
            Phân tích chuyên sâu các loại kèo dựa trên dữ liệu tìm kiếm thời gian thực Google Search Grounding từ AI Gemini. Tự động lưu và học hỏi từ lịch sử SQLite.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 justify-center w-full max-w-xs sm:max-w-none mx-auto">
            <button 
              onClick={() => { setActiveTab('fixtures'); }}
              className="w-full sm:w-auto bg-gradient-to-r from-primary to-primary/80 hover:from-primary hover:to-primary text-white font-bold py-2 px-5 rounded-xl shadow-md text-xs transition-all duration-200 text-center"
            >
              Xem Lịch Dự Đoán
            </button>
            <Link 
              href="/stats"
              className="w-full sm:w-auto bg-gradient-to-r from-[#1E293B] to-[#0F172A] border border-card-border hover:border-indigo-500/40 text-white font-bold py-2 px-5 rounded-xl text-xs transition-all duration-200 flex items-center justify-center space-x-1.5"
            >
              <span>📊</span>
              <span>Thống Kê AI</span>
            </Link>
            <Link 
              href="/custom"
              className="w-full sm:w-auto glass-panel text-white hover:text-secondary font-bold py-2 px-5 rounded-xl text-xs hover:border-secondary/40 transition-all duration-200 text-center"
            >
              Giả Lập Cặp Đấu Tự Do
            </Link>
          </div>

        </div>
      </section>

      {/* Tabs and Content Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-card-border pb-2.5 mb-6">
          <div className="flex space-x-4 flex-wrap">
            <button
              onClick={() => setActiveTab('fixtures')}
              className={`pb-2.5 text-sm sm:text-base font-bold border-b-2 transition-all duration-200 px-1 cursor-pointer ${
                activeTab === 'fixtures' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              📅 Lịch Thi Đấu & Dự Đoán
            </button>
            <button
              onClick={() => setActiveTab('test-matches')}
              className={`pb-2.5 text-sm sm:text-base font-bold border-b-2 transition-all duration-200 px-1 cursor-pointer ${
                activeTab === 'test-matches' 
                  ? 'border-accent text-accent' 
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              🧪 Trận Đấu Thử Nghiệm
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`pb-2.5 text-sm sm:text-base font-bold border-b-2 transition-all duration-200 px-1 cursor-pointer ${
                activeTab === 'groups' 
                  ? 'border-secondary text-secondary' 
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              🏆 Các Bảng Đấu (48 Đội)
            </button>
          </div>
        </div>

        {/* Tab CONTENT: FIXTURES */}
        {(activeTab === 'fixtures' || activeTab === 'test-matches') && (
          <div>
            {/* Search, Group, Sorting & Layout Controls */}
            <div className="glass-panel border border-card-border/60 rounded-xl p-3.5 mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs">
              {/* Search & Group filters */}
              <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 flex-1">
                <div className="relative col-span-2 sm:flex-1">
                  <input
                    type="text"
                    placeholder="Tìm kiếm đội bóng (ví dụ: Mexico, USA, Brazil...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#0E131F]/80 border border-card-border/80 rounded-lg py-1.5 px-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                </div>
                <div className="w-full col-span-1 sm:w-48">
                  <select
                    value={selectedGroupFilter}
                    onChange={(e) => setSelectedGroupFilter(e.target.value)}
                    className="w-full bg-[#0E131F]/80 border border-card-border/80 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer"
                  >
                    <option value="All">Tất cả bảng đấu</option>
                    {groups.map(g => (
                      <option key={g.name} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full col-span-1 sm:w-48">
                  <select
                    value={selectedTournamentFilter}
                    onChange={(e) => setSelectedTournamentFilter(e.target.value)}
                    className="w-full bg-[#0E131F]/80 border border-card-border/80 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer"
                  >
                    <option value="All">Tất cả giải đấu</option>
                    {uniqueTournaments.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full col-span-2 sm:col-span-1 sm:w-48">
                  <select
                    value={selectedSeasonFilter}
                    onChange={(e) => setSelectedSeasonFilter(e.target.value)}
                    className="w-full bg-[#0E131F]/80 border border-card-border/80 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer"
                  >
                    <option value="All">Tất cả mùa giải</option>
                    {uniqueSeasons.map(s => (
                      <option key={s} value={s}>Mùa giải {s}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:w-auto flex items-center">
                  <div className="flex items-center space-x-2 bg-[#0E131F]/80 border border-card-border/80 rounded-lg py-1.5 px-3 select-none cursor-pointer w-full justify-center sm:justify-start">
                    <input
                      id="showPastMatchesCheckbox"
                      type="checkbox"
                      checked={showPastMatches}
                      onChange={(e) => setShowPastMatches(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-card-border text-primary focus:ring-primary cursor-pointer accent-primary shrink-0"
                    />
                    <label htmlFor="showPastMatchesCheckbox" className="text-gray-300 font-medium cursor-pointer text-[10.5px] whitespace-nowrap">
                      Hiện các trận đã qua
                    </label>
                  </div>
                </div>
              </div>

              {/* Sorting & Layout Toggles */}
              <div className="flex flex-wrap items-center gap-3.5">
                {/* Sort controls */}
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Sắp xếp:</span>
                  <div className="bg-card-border/40 p-0.5 rounded-lg flex space-x-0.5">
                    <button
                      onClick={() => setSortBy('date')}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all duration-150 ${
                        sortBy === 'date' 
                          ? 'bg-primary text-white shadow-sm' 
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      Ngày
                    </button>
                    <button
                      onClick={() => setSortBy('group')}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all duration-150 ${
                        sortBy === 'group' 
                          ? 'bg-primary text-white shadow-sm' 
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      Bảng
                    </button>
                    <button
                      onClick={() => setSortBy('history')}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all duration-150 ${
                        sortBy === 'history' 
                          ? 'bg-primary text-white shadow-sm' 
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      Độ Hot (Lịch sử)
                    </button>
                  </div>
                </div>

                {/* Layout Controls */}
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Hiển thị:</span>
                  <div className="bg-card-border/40 p-0.5 rounded-lg flex space-x-0.5">
                    <button
                      onClick={() => setLayout('grid')}
                      className={`px-2 py-1 rounded-md transition-all duration-150 flex items-center justify-center ${
                        layout === 'grid' 
                          ? 'bg-secondary text-white shadow-sm' 
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                      title="Dạng Lưới"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => setLayout('list')}
                      className={`px-2 py-1 rounded-md transition-all duration-150 flex items-center justify-center ${
                        layout === 'list' 
                          ? 'bg-secondary text-white shadow-sm' 
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                      title="Dạng Danh Sách"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Sync Button */}
                <div className="flex items-center">
                  <button
                    onClick={() => setShowSyncConfigModal(true)}
                    disabled={syncing}
                    className={`px-3 py-1.5 rounded-lg border font-bold text-[10px] tracking-wider transition-all duration-150 flex items-center space-x-1.5 active:scale-[0.98] cursor-pointer ${
                      syncing 
                        ? 'bg-[#151E2E] border-card-border text-gray-400' 
                        : 'bg-primary/10 hover:bg-primary/20 border-primary/30 hover:border-primary/50 text-primary hover:text-white'
                    }`}
                    title="Đồng bộ lịch thi đấu & Vòng đấu từ Internet (AI)"
                  >
                    <span>{syncing ? '🔄 Đang quét...' : '🔄 Đồng bộ lịch (AI)'}</span>
                  </button>
                </div>
              </div>
            </div>

            {syncMessage && (
              <div className={`mb-4 p-2.5 rounded-lg border text-[11px] leading-relaxed text-center animate-fade-in ${
                syncMessage.success 
                  ? 'border-primary/30 bg-primary/5 text-primary' 
                  : 'border-red-500/30 bg-red-950/10 text-red-400'
              }`}>
                {syncMessage.text}
              </div>
            )}

            {/* Fixtures List/Grid */}
            {sortedAndFilteredFixtures.length > 0 ? (
              layout === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sortedAndFilteredFixtures.map((fixture) => {
                    const historyCount = localHistoryCounts[fixture.id] || 0;
                    return (
                      <div 
                        key={fixture.id}
                        className="glass-panel rounded-xl p-4 hover:border-primary/45 transition-all duration-200 flex flex-col justify-between"
                      >
                        <div>
                          {/* Card Header */}
                          <div className="flex justify-between items-center text-[10px] text-gray-500 mb-2.5">
                            <span className="bg-card-border px-2 py-0.5 rounded-full font-semibold">{fixture.group}</span>
                            <span>{getVNTime(fixture.date, fixture.time, fixture.venue).formatted} (Giờ VN)</span>
                          </div>

                          {/* Teams Matchup */}
                          <div className="my-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3">
                            <div className="flex min-w-0 items-center space-x-2">
                              {getTeamFlag(fixture.homeTeam, "w-7 h-5 shrink-0")}
                              <span className="truncate font-bold text-sm text-white">{fixture.homeTeam}</span>
                            </div>
                            {fixture.actualHomeScore !== undefined && fixture.actualHomeScore !== null ? (
                              <div className="inline-flex items-center justify-center whitespace-nowrap rounded bg-card-border/40 px-2.5 py-0.5 text-sm font-black text-white">
                                <span>{fixture.actualHomeScore}</span>
                                <span className="mx-1 text-gray-400">-</span>
                                <span>{fixture.actualAwayScore}</span>
                              </div>
                            ) : (
                              <span className="inline-flex min-w-10 justify-center rounded bg-background/50 px-2 py-0.5 text-center text-[10px] font-black text-gray-600 select-none">
                                VS
                              </span>
                            )}
                            <div className="flex min-w-0 items-center justify-end space-x-2 text-right">
                              <span className="truncate font-bold text-sm text-white">{fixture.awayTeam}</span>
                              {getTeamFlag(fixture.awayTeam, "w-7 h-5 shrink-0")}
                            </div>
                          </div>
                        </div>

                        {/* Card Footer & Predict Button */}
                        <div className="mt-4 pt-3 border-t border-card-border/50 flex flex-col space-y-2">
                          <div className="text-[10px] text-gray-500 flex items-center">
                            <span className="mr-1">📍</span>
                            <span className="truncate">{fixture.venue}</span>
                          </div>
                          
                          {(() => {
                            const pred = localLatestPredictions[fixture.id];
                            if (!pred) return null;
                            const status = getPredictionStatus(
                              pred.predictedHomeScore, 
                              pred.predictedAwayScore, 
                              fixture.actualHomeScore, 
                              fixture.actualAwayScore,
                              pred.predictType || 'full_time',
                              pred.actualFirstHalfHomeScore,
                              pred.actualFirstHalfAwayScore
                            );
                            const typeLabel = pred.predictType === 'first_half' ? 'H1' : pred.predictType === 'second_half' ? 'H2' : 'FT';
                            return (
                              <div className={`p-2 rounded-lg border text-[11px] flex items-center justify-between ${status.colorClass} backdrop-blur-sm transition-all duration-300`}>
                                <span className="font-bold">🔮 AI ({typeLabel}): {pred.predictedHomeScore} - {pred.predictedAwayScore}</span>
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-black/30 tracking-wider">
                                  {status.text}
                                </span>
                              </div>
                            );
                          })()}
                          
                          <div className="grid grid-cols-3 sm:grid-cols-2 gap-1.5">
                            <Link 
                              href={`/match/${fixture.id}`}
                              className="bg-card-border hover:bg-primary/20 border border-card-border hover:border-primary/50 text-white font-bold py-1.5 px-1 rounded-lg text-center text-[11px] transition-all duration-150 flex items-center justify-center space-x-1"
                              title="Xem chi tiết & lịch sử dự đoán"
                            >
                              <span>🔍 Chi Tiết</span>
                            </Link>
                            
                            <div className="relative predict-menu-container">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActivePredictMenu(activePredictMenu === fixture.id ? null : fixture.id);
                                  setActiveActionMenu(null);
                                }}
                                disabled={quickPredicting[fixture.id] || syncingStats[fixture.id]}
                                className={`w-full text-white font-bold py-1.5 px-1 rounded-lg text-center text-[11px] transition-all duration-150 flex items-center justify-center space-x-1 active:scale-[0.98] cursor-pointer ${
                                  quickPredicting[fixture.id]
                                    ? 'bg-[#151E2E] text-gray-500 border border-card-border'
                                    : 'bg-gradient-to-r from-primary/80 to-secondary/80 hover:from-primary hover:to-secondary border border-primary/20 hover:border-primary/40'
                                }`}
                              >
                                <span>{quickPredicting[fixture.id] ? '⏳ Chạy...' : '⚡ Nhanh'}</span>
                              </button>

                              {activePredictMenu === fixture.id && (
                                <div className="absolute right-0 bottom-full mb-1.5 w-40 rounded-xl border border-card-border bg-[#0D1324]/95 backdrop-blur-md shadow-2xl p-1 z-40 animate-slide-in">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActivePredictMenu(null);
                                      handleQuickPredict(fixture, 'full_time');
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-[10.5px] text-gray-300 hover:text-white hover:bg-primary/20 rounded-lg transition-colors font-medium flex items-center space-x-2"
                                  >
                                    <span>📅</span>
                                    <span>Cả trận (FT)</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActivePredictMenu(null);
                                      handleQuickPredict(fixture, 'first_half');
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-[10.5px] text-gray-300 hover:text-white hover:bg-primary/20 rounded-lg transition-colors font-medium flex items-center space-x-2"
                                  >
                                    <span>⏱️</span>
                                    <span>Hiệp 1 (H1)</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActivePredictMenu(null);

                                      const pred = localLatestPredictions[fixture.id];
                                      const defaultH1 = pred?.actualFirstHalfHomeScore !== null && pred?.actualFirstHalfAwayScore !== null
                                        ? `${pred.actualFirstHalfHomeScore}-${pred.actualFirstHalfAwayScore}`
                                        : '';

                                      const promptVal = prompt(
                                        `Nhập tỷ số Hiệp 1 thực tế (Định dạng: Home-Away, ví dụ: 1-0):`, 
                                        defaultH1
                                      );
                                      if (promptVal === null) return;

                                      const match = promptVal.trim().match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
                                      if (!match) {
                                        alert("Định dạng tỷ số không hợp lệ. Vui lòng nhập X-Y (ví dụ: 1-0).");
                                        return;
                                      }
                                      const fHome = parseInt(match[1], 10);
                                      const fAway = parseInt(match[2], 10);
                                      handleQuickPredict(fixture, 'second_half', fHome, fAway);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-[10.5px] text-gray-300 hover:text-white hover:bg-primary/20 rounded-lg transition-colors font-medium flex items-center space-x-2"
                                  >
                                    <span>🔥</span>
                                    <span>Hiệp 2 (H2)</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="relative action-menu-container sm:hidden">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveActionMenu(activeActionMenu === fixture.id ? null : fixture.id);
                                  setActivePredictMenu(null);
                                }}
                                className="w-full bg-[#1E293B]/70 hover:bg-primary/25 border border-card-border hover:border-primary/40 text-white font-bold py-1.5 px-1 rounded-lg text-center text-[11px] transition-all duration-150 flex items-center justify-center active:scale-[0.98] cursor-pointer"
                                title="Tác vụ khác"
                              >
                                <span>•••</span>
                              </button>

                              {activeActionMenu === fixture.id && (
                                <div className="absolute right-0 bottom-full mb-1.5 w-36 rounded-xl border border-card-border bg-[#0D1324]/95 backdrop-blur-md shadow-2xl p-1 z-40 animate-slide-in">
                                  <button
                                    onClick={() => handleUpdateMatchStats(fixture)}
                                    disabled={syncingStats[fixture.id] || quickPredicting[fixture.id] || updatingAutoList[fixture.id]}
                                    className="w-full text-left px-3 py-1.5 text-[10.5px] text-indigo-300 hover:text-white hover:bg-indigo-500/20 rounded-lg transition-colors font-medium"
                                  >
                                    {syncingStats[fixture.id] ? '⏳ Stats...' : '📊 Stats AI'}
                                  </button>
                                  <button
                                    onClick={() => handleAutoUpdate(fixture)}
                                    disabled={updatingAutoList[fixture.id] || quickPredicting[fixture.id] || syncingStats[fixture.id]}
                                    className="w-full text-left px-3 py-1.5 text-[10.5px] text-gray-300 hover:text-white hover:bg-primary/20 rounded-lg transition-colors font-medium"
                                  >
                                    {updatingAutoList[fixture.id] ? '🔄 KQ...' : '🤖 Kết quả'}
                                  </button>
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => handleUpdateMatchStats(fixture)}
                              disabled={syncingStats[fixture.id] || quickPredicting[fixture.id] || updatingAutoList[fixture.id]}
                              className={`hidden sm:flex text-white font-bold py-1.5 px-1 rounded-lg text-center text-[11px] transition-all duration-150 items-center justify-center space-x-1 active:scale-[0.98] cursor-pointer ${
                                syncingStats[fixture.id]
                                  ? 'bg-[#151E2E] text-gray-500 border border-card-border'
                                  : 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/35 hover:to-purple-500/35 border border-indigo-500/30 hover:border-indigo-500/50 text-indigo-300'
                              }`}
                              title="Cập nhật ELO, FIFA Rank và phong độ mới nhất bằng AI/Search"
                            >
                              <span>{syncingStats[fixture.id] ? '⏳ Stats...' : '⚡ Stats AI'}</span>
                            </button>

                            <button
                              onClick={() => handleAutoUpdate(fixture)}
                              disabled={updatingAutoList[fixture.id] || quickPredicting[fixture.id] || syncingStats[fixture.id]}
                              className={`hidden sm:flex text-white font-bold py-1.5 px-1 rounded-lg text-center text-[11px] transition-all duration-150 items-center justify-center space-x-0.5 active:scale-[0.98] cursor-pointer ${
                                updatingAutoList[fixture.id]
                                  ? 'bg-[#151E2E] text-gray-500 border border-card-border'
                                  : 'bg-[#1E293B]/70 hover:bg-primary/25 border border-card-border hover:border-primary/40'
                              }`}
                              title="Tự động cập nhật kết quả thực tế (AI & Google Search)"
                            >
                              <span>🤖 {updatingAutoList[fixture.id] ? 'KQ...' : 'Kết Quả'}</span>
                            </button>
                          </div>
                          
                          {historyCount > 0 && (
                            <Link 
                              href={`/match/${fixture.id}?tab=history`}
                              className="w-full bg-[#151E2E]/60 hover:bg-secondary/15 border border-card-border/60 hover:border-secondary/40 text-gray-300 hover:text-white py-1.5 px-3 rounded-lg text-[10px] font-bold transition-all duration-150 flex items-center justify-center space-x-1"
                            >
                              <span>📜 Lịch sử phân tích:</span>
                              <span className="bg-secondary/20 px-1.5 py-0.5 rounded-full text-secondary text-[9px]">{historyCount} lần</span>
                            </Link>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedAndFilteredFixtures.map((fixture) => {
                    const historyCount = localHistoryCounts[fixture.id] || 0;
                    return (
                      <div 
                        key={fixture.id}
                        className="glass-panel rounded-lg px-3 py-2 hover:border-primary/45 transition-all duration-150 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 text-xs animate-fade-in"
                      >
                        {/* Date & Group info */}
                        <div className="flex items-center space-x-2 sm:w-1/4">
                          <span className="bg-card-border/80 px-2 py-0.5 rounded text-[10px] font-semibold text-gray-400 whitespace-nowrap">
                            {fixture.group}
                          </span>
                          <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap">
                            {getVNTime(fixture.date, fixture.time, fixture.venue).formatted} (VN)
                          </span>
                        </div>

                        {/* Teams & Flags */}
                        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 sm:w-2/5 px-2">
                          {/* Home Team */}
                          <div className="flex min-w-0 items-center justify-start space-x-2.5">
                            {getTeamFlag(fixture.homeTeam, "w-6.5 h-4.5 shrink-0")}
                            <span className="truncate font-bold text-white text-right max-w-[125px] sm:max-w-none">{fixture.homeTeam}</span>
                          </div>

                          {fixture.actualHomeScore !== undefined && fixture.actualHomeScore !== null ? (
                            <div className="inline-flex min-w-[56px] items-center justify-center whitespace-nowrap rounded-lg border border-card-border/50 bg-card-border/30 px-2 py-0.5 select-none">
                              <span className="font-mono text-xs font-black text-white">{fixture.actualHomeScore}</span>
                              <span className="mx-1 text-[8px] font-bold text-gray-500">-</span>
                              <span className="font-mono text-xs font-black text-white">{fixture.actualAwayScore}</span>
                            </div>
                          ) : (
                            <span className="inline-flex min-w-[40px] justify-center rounded bg-background/50 px-1.5 py-0.5 text-[9px] font-black text-gray-600 select-none">VS</span>
                          )}

                          {/* Away Team */}
                          <div className="flex min-w-0 items-center justify-end space-x-2.5">
                            <span className="truncate font-bold text-white text-left max-w-[125px] sm:max-w-none">{fixture.awayTeam}</span>
                            {getTeamFlag(fixture.awayTeam, "w-6.5 h-4.5 shrink-0")}
                          </div>
                        </div>

                        {/* Venue & Action buttons */}
                        <div className="flex items-center justify-between sm:justify-end space-x-3 sm:w-1/3 pt-1.5 sm:pt-0 border-t border-card-border/20 sm:border-t-0">
                          <span className="text-[10px] text-gray-500 truncate max-w-[155px] hidden md:inline-block">
                            📍 {fixture.venue.split(',')[0]}
                          </span>
                          
                          {(() => {
                            const pred = localLatestPredictions[fixture.id];
                            if (!pred) return null;
                            const status = getPredictionStatus(
                              pred.predictedHomeScore, 
                              pred.predictedAwayScore, 
                              fixture.actualHomeScore, 
                              fixture.actualAwayScore,
                              pred.predictType || 'full_time',
                              pred.actualFirstHalfHomeScore,
                              pred.actualFirstHalfAwayScore
                            );
                            const typeLabel = pred.predictType === 'first_half' ? 'H1' : pred.predictType === 'second_half' ? 'H2' : 'FT';
                            return (
                              <div className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center space-x-1 ${status.colorClass} select-none whitespace-nowrap`} title={status.text}>
                                <span>🔮 ({typeLabel}) {pred.predictedHomeScore} - {pred.predictedAwayScore}</span>
                                <span className="text-[8px] bg-black/25 px-1 py-0.2 rounded font-extrabold uppercase">
                                  {status.status === 'correct' ? 'Đúng' : status.status === 'near' ? 'Gần' : status.status === 'incorrect' ? 'Sai' : 'Chờ'}
                                </span>
                              </div>
                            );
                          })()}
                          
                          <div className="flex space-x-1.5 w-full sm:w-auto justify-end">
                            <Link 
                              href={`/match/${fixture.id}`}
                              className="bg-card-border hover:bg-primary/20 border border-card-border hover:border-primary/50 text-white w-7 h-7 sm:w-8 sm:h-8 rounded-lg transition-all duration-150 flex items-center justify-center"
                              title="Xem chi tiết & phân tích chuyên sâu"
                            >
                              <span>🔍</span>
                            </Link>
                            
                            <div className="relative predict-menu-container">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActivePredictMenu(activePredictMenu === fixture.id ? null : fixture.id);
                                  setActiveActionMenu(null);
                                }}
                                disabled={quickPredicting[fixture.id] || syncingStats[fixture.id]}
                                className={`text-white w-7 h-7 sm:w-8 sm:h-8 rounded-lg transition-all duration-150 flex items-center justify-center active:scale-[0.98] cursor-pointer ${
                                  quickPredicting[fixture.id]
                                    ? 'bg-[#151E2E] text-gray-550 border border-card-border'
                                    : 'bg-gradient-to-r from-primary/80 to-secondary/80 hover:from-primary hover:to-secondary border border-primary/25 hover:border-primary/45 shadow-sm'
                                }`}
                                title={quickPredicting[fixture.id] ? 'Đang phân tích...' : 'Phân tích nhanh bằng AI'}
                              >
                                <span>{quickPredicting[fixture.id] ? '⏳' : '⚡'}</span>
                              </button>

                              {activePredictMenu === fixture.id && (
                                <div className="absolute right-0 bottom-full mb-1.5 w-40 rounded-xl border border-card-border bg-[#0D1324]/95 backdrop-blur-md shadow-2xl p-1 z-40 animate-slide-in">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActivePredictMenu(null);
                                      handleQuickPredict(fixture, 'full_time');
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-[10.5px] text-gray-300 hover:text-white hover:bg-primary/20 rounded-lg transition-colors font-medium flex items-center space-x-2"
                                  >
                                    <span>📅</span>
                                    <span>Cả trận (FT)</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActivePredictMenu(null);
                                      handleQuickPredict(fixture, 'first_half');
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-[10.5px] text-gray-300 hover:text-white hover:bg-primary/20 rounded-lg transition-colors font-medium flex items-center space-x-2"
                                  >
                                    <span>⏱️</span>
                                    <span>Hiệp 1 (H1)</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActivePredictMenu(null);

                                      const pred = localLatestPredictions[fixture.id];
                                      const defaultH1 = pred?.actualFirstHalfHomeScore !== null && pred?.actualFirstHalfAwayScore !== null
                                        ? `${pred.actualFirstHalfHomeScore}-${pred.actualFirstHalfAwayScore}`
                                        : '';

                                      const promptVal = prompt(
                                        `Nhập tỷ số Hiệp 1 thực tế (Định dạng: Home-Away, ví dụ: 1-0):`, 
                                        defaultH1
                                      );
                                      if (promptVal === null) return;

                                      const match = promptVal.trim().match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
                                      if (!match) {
                                        alert("Định dạng tỷ số không hợp lệ. Vui lòng nhập X-Y (ví dụ: 1-0).");
                                        return;
                                      }
                                      const fHome = parseInt(match[1], 10);
                                      const fAway = parseInt(match[2], 10);
                                      handleQuickPredict(fixture, 'second_half', fHome, fAway);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-[10.5px] text-gray-300 hover:text-white hover:bg-primary/20 rounded-lg transition-colors font-medium flex items-center space-x-2"
                                  >
                                    <span>🔥</span>
                                    <span>Hiệp 2 (H2)</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => handleUpdateMatchStats(fixture)}
                              disabled={syncingStats[fixture.id] || quickPredicting[fixture.id] || updatingAutoList[fixture.id]}
                              className={`hidden sm:flex text-white w-7 h-7 sm:w-8 sm:h-8 rounded-lg transition-all duration-150 items-center justify-center active:scale-[0.98] cursor-pointer ${
                                syncingStats[fixture.id]
                                  ? 'bg-[#151E2E] text-gray-500 border border-card-border'
                                  : 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/25 hover:to-purple-500/25 border border-indigo-500/25 hover:border-indigo-500/45 text-indigo-300'
                              }`}
                              title={syncingStats[fixture.id] ? 'Đang đồng bộ stats...' : 'Cập nhật Stats AI của 2 đội'}
                            >
                              <span>{syncingStats[fixture.id] ? '⏳' : '📊'}</span>
                            </button>
                            
                            <button
                              onClick={() => handleAutoUpdate(fixture)}
                              disabled={updatingAutoList[fixture.id] || quickPredicting[fixture.id] || syncingStats[fixture.id]}
                              className={`hidden sm:flex text-white w-7 h-7 sm:w-8 sm:h-8 rounded-lg transition-all duration-150 items-center justify-center active:scale-[0.98] cursor-pointer ${
                                updatingAutoList[fixture.id]
                                  ? 'bg-[#151E2E] text-gray-500 border border-card-border'
                                  : 'bg-[#1E293B]/70 hover:bg-primary/25 border border-card-border hover:border-primary/40'
                              }`}
                              title={updatingAutoList[fixture.id] ? 'Đang cập nhật...' : 'Tự động cập nhật kết quả thực tế (AI)'}
                            >
                              <span>{updatingAutoList[fixture.id] ? '🔄' : '🤖'}</span>
                            </button>

                            {historyCount > 0 && (
                              <Link 
                                href={`/match/${fixture.id}?tab=history`}
                                className="hidden sm:flex bg-card-border/60 hover:bg-secondary/20 border border-card-border/50 hover:border-secondary/50 text-gray-300 hover:text-white w-7 h-7 sm:w-8 sm:h-8 rounded-lg transition-all duration-150 items-center justify-center relative"
                                title={`Xem lịch sử (${historyCount} lần dự đoán)`}
                              >
                                <span>📜</span>
                                <span className="absolute -top-1 -right-1 bg-secondary text-white text-[8px] font-black px-1 rounded-full min-w-[13px] h-[13px] flex items-center justify-center border border-[#0B0F17]">
                                  {historyCount}
                                </span>
                              </Link>
                            )}

                            <div className="relative action-menu-container sm:hidden">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveActionMenu(activeActionMenu === fixture.id ? null : fixture.id);
                                  setActivePredictMenu(null);
                                }}
                                className="text-white w-7 h-7 rounded-lg transition-all duration-150 flex items-center justify-center border border-card-border bg-[#1E293B]/70 hover:bg-primary/25 active:scale-[0.98] cursor-pointer"
                                title="Tác vụ khác"
                              >
                                <span>•••</span>
                              </button>

                              {activeActionMenu === fixture.id && (
                                <div className="absolute right-0 bottom-full mb-1.5 w-36 rounded-xl border border-card-border bg-[#0D1324]/95 backdrop-blur-md shadow-2xl p-1 z-40 animate-slide-in">
                                  <button
                                    onClick={() => handleUpdateMatchStats(fixture)}
                                    disabled={syncingStats[fixture.id] || quickPredicting[fixture.id] || updatingAutoList[fixture.id]}
                                    className="w-full text-left px-3 py-1.5 text-[10.5px] text-indigo-300 hover:text-white hover:bg-indigo-500/20 rounded-lg transition-colors font-medium"
                                  >
                                    {syncingStats[fixture.id] ? '⏳ Stats...' : '📊 Stats AI'}
                                  </button>
                                  <button
                                    onClick={() => handleAutoUpdate(fixture)}
                                    disabled={updatingAutoList[fixture.id] || quickPredicting[fixture.id] || syncingStats[fixture.id]}
                                    className="w-full text-left px-3 py-1.5 text-[10.5px] text-gray-300 hover:text-white hover:bg-primary/20 rounded-lg transition-colors font-medium"
                                  >
                                    {updatingAutoList[fixture.id] ? '🔄 Kết quả...' : '🤖 Kết quả'}
                                  </button>
                                  {historyCount > 0 && (
                                    <Link
                                      href={`/match/${fixture.id}?tab=history`}
                                      className="block w-full text-left px-3 py-1.5 text-[10.5px] text-secondary hover:text-white hover:bg-secondary/20 rounded-lg transition-colors font-medium"
                                    >
                                      📜 Lịch sử phân tích
                                    </Link>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="text-center py-10 glass-panel rounded-xl">
                <span className="text-3xl mb-2 block">🔍</span>
                <p className="text-xs text-gray-400">Không tìm thấy trận đấu nào khớp với bộ lọc.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab CONTENT: GROUPS */}
        {activeTab === 'groups' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {groups.map((group) => (
              <div 
                key={group.name}
                className="glass-panel rounded-xl p-4 border border-card-border"
              >
                <div className="border-b border-card-border pb-2 mb-3 flex items-center justify-between">
                  <h3 className="font-extrabold text-sm text-gradient">{group.name}</h3>
                  <span className="text-[10px] text-gray-500 font-medium">Bảng đấu</span>
                </div>
                <ul className="space-y-2">
                  {group.teams.map((team, idx) => (
                    <li 
                      key={team}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-card-border/20 border border-card-border/30 hover:bg-card-border/30 transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        {getTeamFlag(team, "w-6 h-4")}
                        <span className="font-semibold text-xs text-gray-200">{team}</span>
                      </div>
                      <span className="text-[10px] text-gray-600 font-bold">#{idx + 1}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

      </section>

      {/* QUICK PREDICT MODAL */}
      {modalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in">
          {/* Backdrop click closes modal */}
          <div className="absolute inset-0" onClick={() => setModalData(null)}></div>
          
          <div className="glass-panel border border-card-border/80 rounded-2xl w-full max-w-lg p-5 relative z-10 shadow-2xl glow-cyan animate-scale-in max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-card-border pb-3 mb-4">
              <div>
                <span className="bg-[#151E2E] border border-card-border text-[9px] font-bold text-gray-400 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {modalData.fixture.group}
                </span>
                <h2 className="text-sm font-extrabold text-white mt-1.5 flex items-center space-x-2">
                  <span>⚡ Phân Tích Nhanh Dự Đoán AI</span>
                </h2>
              </div>
              <button 
                onClick={() => setModalData(null)}
                className="text-gray-400 hover:text-white font-bold text-base p-1 transition-colors leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Teams Matchup Header */}
            <div className="bg-[#0B0F17]/50 rounded-xl p-3.5 border border-card-border/50 text-center mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 text-[8px] text-gray-550 font-bold bg-card-border/40 px-2 py-0.5 rounded-bl">
                {getVNTime(modalData.fixture.date, modalData.fixture.time, modalData.fixture.venue).formatted} (VN)
              </div>
              
              {modalData.prediction.modelUsed && (
                <div className="absolute top-0 left-0 text-[7px] text-gray-400 font-bold bg-card-border/40 px-2 py-0.5 rounded-br uppercase tracking-wide">
                  Model: {formatModelName(modalData.prediction.modelUsed)}
                </div>
              )}
              
              <div className="flex items-center justify-center space-x-4 mt-1">
                <div className="flex items-center space-x-2 w-5/12 justify-end">
                  <span className="font-extrabold text-xs text-white truncate">{modalData.fixture.homeTeam}</span>
                  {getTeamFlag(modalData.fixture.homeTeam, "w-6.5 h-4.5")}
                </div>
                <span className="text-[10px] font-bold text-gray-650 bg-card-border/30 px-2 py-0.5 rounded-full">VS</span>
                <div className="flex items-center space-x-2 w-5/12 justify-start">
                  {getTeamFlag(modalData.fixture.awayTeam, "w-6.5 h-4.5")}
                  <span className="font-extrabold text-xs text-white truncate">{modalData.fixture.awayTeam}</span>
                </div>
              </div>
            </div>

            {/* Cache Status Badge & Re-predict Button */}
            {modalData.prediction.isCached && (
              <div className="mb-3.5 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] flex items-center justify-between backdrop-blur-md">
                <span className="flex items-center space-x-1">
                  <span>⚡</span>
                  <span>Dữ liệu tải từ bộ nhớ đệm (Lưu cách đây {(() => {
                    const cachedTime = new Date(modalData.prediction.cachedAt.replace(' ', 'T') + 'Z').getTime();
                    const diffMins = Math.round((Date.now() - cachedTime) / (1000 * 60));
                    if (diffMins < 60) return `${diffMins} phút`;
                    return `${Math.round(diffMins / 60)} giờ`;
                  })()})</span>
                </span>
                <button
                  onClick={async () => {
                    const fixtureId = modalData.fixture.id;
                    setQuickPredicting(prev => ({ ...prev, [fixtureId]: true }));
                    setModalData(null);
                    try {
                      const res = await fetch('/api/predict', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          homeTeam: modalData.fixture.homeTeam,
                          awayTeam: modalData.fixture.awayTeam,
                          matchId: fixtureId,
                          forceRefresh: true
                        })
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Lỗi phân tích trận đấu');
                      if (data.modelUsed) {
                        saveLastUsedModel(data.modelUsed);
                      }
                      setModalData({
                        fixture: modalData.fixture,
                        prediction: data
                      });
                    } catch (err) {
                      alert(`Lỗi cập nhật AI: ${err.message}`);
                    } finally {
                      setQuickPredicting(prev => ({ ...prev, [fixtureId]: false }));
                    }
                  }}
                  className="bg-[#10B981]/25 hover:bg-[#10B981]/40 border border-[#10B981]/40 hover:border-[#10B981]/65 text-emerald-300 font-extrabold px-2.5 py-1 rounded-lg text-[9px] cursor-pointer transition-all active:scale-[0.97]"
                >
                  🔄 Phân tích lại
                </button>
              </div>
            )}

            {/* Prediction Summary: Score & Win probabilities */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {/* Score card */}
              <div className="bg-card-border/20 rounded-xl p-3 border border-card-border/60 text-center flex flex-col justify-center">
                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-2.5">Tỷ Số Dự Kiến</span>
                <div className="flex items-center justify-center space-x-4">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-400 truncate max-w-[80px]">{modalData.fixture.homeTeam}</span>
                    <span className="text-2xl font-black text-white">{modalData.prediction.predictedScore?.home ?? modalData.prediction.predicted_home_score}</span>
                  </div>
                  <span className="text-gray-600 font-bold text-lg">-</span>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-400 truncate max-w-[80px]">{modalData.fixture.awayTeam}</span>
                    <span className="text-2xl font-black text-white">{modalData.prediction.predictedScore?.away ?? modalData.prediction.predicted_away_score}</span>
                  </div>
                </div>
              </div>

              {/* Win probabilities */}
              <div className="bg-card-border/20 rounded-xl p-3 border border-card-border/60 flex flex-col justify-center">
                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-2">Xác Suất Thắng</span>
                {(() => {
                  const prob = {
                    home: modalData.prediction.winProbability?.home ?? modalData.prediction.win_prob_home ?? 33,
                    draw: modalData.prediction.winProbability?.draw ?? modalData.prediction.win_prob_draw ?? 34,
                    away: modalData.prediction.winProbability?.away ?? modalData.prediction.win_prob_away ?? 33
                  };
                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[9px] text-gray-400 font-semibold">
                        <span>{prob.home}%</span>
                        <span>{prob.draw}%</span>
                        <span>{prob.away}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full overflow-hidden flex bg-card-border">
                        <div className="h-full bg-primary" style={{ width: `${prob.home}%` }}></div>
                        <div className="h-full bg-gray-500" style={{ width: `${prob.draw}%` }}></div>
                        <div className="h-full bg-secondary" style={{ width: `${prob.away}%` }}></div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Siêu máy tính Monte Carlo 10,000 lần */}
            {modalData.prediction.monteCarlo && (
              <div className="bg-[#1E293B]/20 rounded-xl p-3.5 border border-card-border/50 mb-4 text-xs">
                <div className="flex justify-between items-center mb-2.5 pb-1.5 border-b border-card-border/30">
                  <span className="text-[10px] text-indigo-300 font-black uppercase tracking-wider flex items-center space-x-1.5">
                    <span>📊</span>
                    <span>Siêu máy tính Monte Carlo (10,000 lần)</span>
                  </span>
                  <span className="text-[9px] text-gray-500 font-bold">Tỉ lệ mô phỏng động</span>
                </div>
                
                {/* 1X2 Probabilities */}
                <div className="mb-3.5">
                  <div className="flex justify-between text-[10px] text-gray-300 font-bold mb-1">
                    <span className="text-emerald-400">{modalData.fixture.homeTeam}: {modalData.prediction.monteCarlo.winProbability.home}%</span>
                    <span className="text-gray-400">Hòa: {modalData.prediction.monteCarlo.winProbability.draw}%</span>
                    <span className="text-rose-400">{modalData.fixture.awayTeam}: {modalData.prediction.monteCarlo.winProbability.away}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full overflow-hidden flex bg-card-border/30 border border-card-border/40">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300" style={{ width: `${modalData.prediction.monteCarlo.winProbability.home}%` }}></div>
                    <div className="h-full bg-gray-550 transition-all duration-300" style={{ width: `${modalData.prediction.monteCarlo.winProbability.draw}%` }}></div>
                    <div className="h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-300" style={{ width: `${modalData.prediction.monteCarlo.winProbability.away}%` }}></div>
                  </div>
                </div>

                {/* Sub Bets probabilities */}
                <div className="grid grid-cols-2 gap-2 mb-3.5">
                  <div className="bg-[#0A0D14]/75 p-2 rounded-lg border border-card-border/35 flex justify-between items-center">
                    <span className="text-[10px] text-gray-450 font-semibold">Cả 2 đội ghi bàn (BTTS):</span>
                    <span className="font-extrabold text-blue-400">{modalData.prediction.monteCarlo.bttsProbability}%</span>
                  </div>
                  <div className="bg-[#0A0D14]/75 p-2 rounded-lg border border-card-border/35 flex justify-between items-center">
                    <span className="text-[10px] text-gray-450 font-semibold">Xác suất nổ Tài {modalData.prediction.ou_line ?? modalData.prediction.bets?.overUnder?.line ?? 2.5}:</span>
                    <span className="font-extrabold text-purple-400">{modalData.prediction.monteCarlo.ouProbability.over}%</span>
                  </div>
                </div>

                {/* Top scores */}
                <div className="space-y-1.5">
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block pl-0.5">Top 3 tỉ số dễ xảy ra nhất</span>
                  <div className="space-y-1">
                    {modalData.prediction.monteCarlo.topScores.slice(0, 3).map((scoreItem, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-[#0A0D14]/65 border border-card-border/25">
                        <div className="flex items-center space-x-2">
                          <span className="text-[9px] font-bold text-gray-500">#{idx + 1}</span>
                          <span className="font-black text-white font-mono">{scoreItem.score}</span>
                        </div>
                        <div className="flex items-center space-x-2 w-7/12">
                          <div className="w-full bg-card-border/30 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-indigo-550 h-full rounded-full" style={{ width: `${scoreItem.probability * 5}%` }}></div>
                          </div>
                          <span className="text-[10px] font-black text-indigo-400 min-w-[32px] text-right font-mono">{scoreItem.probability}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Recommended Bets Panel */}
            <div className="space-y-2 mb-4.5">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block pl-0.5">Các Kèo AI Khuyến Nghị</span>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* 1X2 & OU */}
                <div className="p-2.5 rounded-lg bg-[#0E1321] border border-card-border/50">
                  <div className="text-[9px] text-gray-555 font-bold uppercase">Châu Âu (1X2)</div>
                  <div className="text-[11px] font-bold text-primary mt-0.5">
                    {modalData.prediction.bets?.oneXTwo?.recommendation ?? modalData.prediction.recommendation_1x2}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0E1321] border border-card-border/50">
                  <div className="text-[9px] text-gray-555 font-bold uppercase">Tài Xỉu {modalData.prediction.ou_line ?? modalData.prediction.bets?.overUnder?.line ?? 2.5}</div>
                  <div className="text-[11px] font-bold text-secondary mt-0.5">
                    {modalData.prediction.bets?.overUnder?.recommendation ?? modalData.prediction.recommendation_ou}
                  </div>
                </div>

                {/* Handicap & BTTS */}
                <div className="p-2.5 rounded-lg bg-[#0E1321] border border-card-border/50">
                  <div className="text-[9px] text-gray-555 font-bold uppercase">Chấp Châu Á</div>
                  <div className="text-[11px] font-bold text-accent mt-0.5 truncate" title={modalData.prediction.bets?.handicap?.recommendation ?? modalData.prediction.recommendation_handicap}>
                    {modalData.prediction.bets?.handicap?.recommendation ?? modalData.prediction.recommendation_handicap}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0E1321] border border-card-border/50">
                  <div className="text-[9px] text-gray-555 font-bold uppercase">Ghi Bàn (BTTS)</div>
                  <div className="text-[11px] font-bold text-blue-400 mt-0.5">
                    {modalData.prediction.bets?.btts?.recommendation ?? modalData.prediction.recommendation_btts}
                  </div>
                </div>

                {/* Corners & Cards */}
                <div className="p-2.5 rounded-lg bg-[#0E1321] border border-card-border/50">
                  <div className="text-[9px] text-gray-555 font-bold uppercase">Phạt Góc (O/U {modalData.prediction.corners_line ?? modalData.prediction.bets?.corners?.line ?? 8.5})</div>
                  <div className="text-[11px] font-bold text-purple-400 mt-0.5 truncate" title={modalData.prediction.bets?.corners?.recommendation ?? modalData.prediction.recommendation_corners}>
                    {modalData.prediction.bets?.corners?.recommendation ?? modalData.prediction.recommendation_corners}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0E1321] border border-card-border/50">
                  <div className="text-[9px] text-gray-555 font-bold uppercase">Thẻ Phạt (O/U {modalData.prediction.cards_line ?? modalData.prediction.bets?.cards?.line ?? 3.5})</div>
                  <div className="text-[11px] font-bold text-[#F59E0B] mt-0.5 truncate" title={modalData.prediction.bets?.cards?.recommendation ?? modalData.prediction.recommendation_cards}>
                    {modalData.prediction.bets?.cards?.recommendation ?? modalData.prediction.recommendation_cards}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex space-x-3 pt-3 border-t border-card-border">
              <Link
                href={`/match/${modalData.fixture.id}`}
                className="flex-1 bg-gradient-to-r from-primary to-secondary text-white font-bold py-2 px-4 rounded-xl text-center text-xs transition-all active:scale-[0.98]"
              >
                🔍 Xem Nhận Định Chi Tiết
              </Link>
              <button
                onClick={() => setModalData(null)}
                className="bg-card-border hover:bg-card-border/80 border border-card-border text-white font-bold py-2 px-5 rounded-xl text-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUTO RESULT UPDATE RAG MODAL */}
      {resultModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in">
          {/* Backdrop click closes modal */}
          <div className="absolute inset-0" onClick={() => setResultModalData(null)}></div>
          
          <div className="glass-panel border border-card-border/80 rounded-2xl w-full max-w-xl p-5 relative z-10 shadow-2xl glow-cyan animate-scale-in max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-card-border pb-3 mb-4">
              <div>
                <span className={`border text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  resultModalData.success 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : resultModalData.status === 'error'
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {resultModalData.success 
                    ? '🤖 Cập nhật kết quả RAG thành công' 
                    : resultModalData.status === 'error'
                      ? '❌ Lỗi hệ thống'
                      : '⚠️ Trạng thái trận đấu'}
                </span>
                <h2 className="text-sm font-extrabold text-white mt-1.5 flex items-center space-x-2">
                  <span>📊 Kết Quả Thực Tế Trực Tuyến</span>
                </h2>
              </div>
              <button 
                onClick={() => setResultModalData(null)}
                className="text-gray-400 hover:text-white font-bold text-base p-1 transition-colors leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Teams Matchup & Score Header */}
            <div className="bg-[#0B0F17]/50 rounded-xl p-4 border border-card-border/50 text-center mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 text-[8px] text-gray-550 font-bold bg-card-border/40 px-2 py-0.5 rounded-bl">
                {getVNTime(resultModalData.fixture.date, resultModalData.fixture.time, resultModalData.fixture.venue).formatted} (VN)
              </div>
              
              {resultModalData.modelUsed && (
                <div className="absolute top-0 left-0 text-[7px] text-gray-400 font-bold bg-card-border/40 px-2 py-0.5 rounded-br uppercase tracking-wide">
                  Chấm điểm bởi: {formatModelName(resultModalData.modelUsed)}
                </div>
              )}
              
              <div className="flex items-center justify-center space-x-4 mt-2">
                {/* Home Team */}
                <div className="flex items-center space-x-2.5 w-5/12 justify-end">
                  <span className="font-extrabold text-sm text-white truncate">{resultModalData.fixture.homeTeam}</span>
                  {getTeamFlag(resultModalData.fixture.homeTeam, "w-8 h-5.5")}
                </div>

                {/* Score or VS */}
                <div className="flex flex-col items-center justify-center min-w-[70px]">
                  {resultModalData.success ? (
                    <div className="flex items-center space-x-2.5">
                      <span className="text-2xl font-black text-primary">{resultModalData.actualScore.home}</span>
                      <span className="text-gray-650 font-bold text-lg">-</span>
                      <span className="text-2xl font-black text-primary">{resultModalData.actualScore.away}</span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-gray-650 bg-card-border/30 px-2.5 py-0.5 rounded-full">VS</span>
                  )}
                  {resultModalData.success && (
                    <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.2 rounded font-black mt-1">FT</span>
                  )}
                </div>

                {/* Away Team */}
                <div className="flex items-center space-x-2.5 w-5/12 justify-start">
                  {getTeamFlag(resultModalData.fixture.awayTeam, "w-8 h-5.5")}
                  <span className="font-extrabold text-sm text-white truncate">{resultModalData.fixture.awayTeam}</span>
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div className="space-y-4 mb-5">
              {/* Summary / Message Text */}
              <div className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                resultModalData.success 
                  ? 'bg-emerald-500/5 text-emerald-300 border-emerald-500/20' 
                  : resultModalData.status === 'error'
                    ? 'bg-rose-500/5 text-rose-300 border-rose-500/20'
                    : 'bg-amber-500/5 text-amber-300 border-amber-500/20'
              }`}>
                <p className="font-bold mb-1 flex items-center space-x-1.5">
                  <span>{resultModalData.success ? '📝 Nhận định đối chiếu kết quả:' : 'ℹ️ Thông tin trạng thái:'}</span>
                </p>
                <p className="text-[11px] font-medium text-gray-300">
                  {resultModalData.success ? resultModalData.summary : resultModalData.message}
                </p>
              </div>

              {/* Kèo cược đánh giá chi tiết */}
              {resultModalData.success && resultModalData.betEvaluations && (
                <div className="space-y-2">
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block pl-0.5">Kết Quả Chấm Điểm Các Kèo (AI Pundit)</span>
                  
                  <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                    {(() => {
                      const pred = localLatestPredictions[resultModalData.fixture.id];
                      const ouLine = pred?.ou_line ?? pred?.bets?.overUnder?.line ?? 2.5;
                      const cornersLine = pred?.corners_line ?? pred?.bets?.corners?.line ?? 8.5;
                      const cardsLine = pred?.cards_line ?? pred?.bets?.cards?.line ?? 3.5;
                      
                      return Object.entries({
                        'Châu Âu (1X2)': { data: resultModalData.betEvaluations.oneXTwo },
                        [`Tài Xỉu ${ouLine}`]: { data: resultModalData.betEvaluations.overUnder },
                        'Kèo Chấp': { data: resultModalData.betEvaluations.handicap },
                        'Ghi Bàn (BTTS)': { data: resultModalData.betEvaluations.btts },
                        [`Phạt Góc (O/U ${cornersLine})`]: { data: resultModalData.betEvaluations.corners },
                        [`Thẻ Phạt (O/U ${cardsLine})`]: { data: resultModalData.betEvaluations.cards }
                      }).map(([betName, { data: evalItem }]) => {
                        if (!evalItem || evalItem.outcome === 'n/a') return null;
                        
                        const isCorrect = evalItem.outcome === 'correct';
                        const isRefund = evalItem.outcome === 'refund';
                        
                        return (
                          <div key={betName} className="p-3 bg-[#0d1324] border border-card-border/40 rounded-xl flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-white">{betName}</span>
                              <span className={`px-2.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                                isCorrect
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : isRefund
                                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                    : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                              }`}>
                                {isCorrect ? '✅ ĐÚNG' : isRefund ? '🔄 HOÀ' : '❌ SAI'}
                              </span>
                            </div>
                            {evalItem.reason && (
                              <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                                {evalItem.reason}
                              </p>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex space-x-3 pt-3 border-t border-card-border">
              <Link
                href={`/match/${resultModalData.fixture.id}`}
                className="flex-1 bg-gradient-to-r from-primary to-secondary text-white font-bold py-2 px-4 rounded-xl text-center text-xs transition-all active:scale-[0.98]"
              >
                🔍 Xem Lịch Sử Dự Đoán Trận Đấu
              </Link>
              <button
                onClick={() => setResultModalData(null)}
                className="bg-card-border hover:bg-card-border/80 border border-card-border text-white font-bold py-2 px-5 rounded-xl text-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SYNC CONFIG MODAL */}
      {showSyncConfigModal && isRestored && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in">
          <div className="absolute inset-0" onClick={() => !syncing && setShowSyncConfigModal(false)}></div>
          <div className="glass-panel border border-card-border/80 rounded-2xl w-full max-w-md p-5 relative z-10 shadow-2xl animate-scale-in text-left">
            <div className="flex justify-between items-start border-b border-card-border pb-3 mb-4">
              <h2 className="text-sm font-extrabold text-white">🔄 Cấu hình Đồng bộ lịch (AI)</h2>
              <button 
                onClick={() => !syncing && setShowSyncConfigModal(false)}
                disabled={syncing}
                className="text-gray-400 hover:text-white font-bold text-base p-1 transition-colors leading-none cursor-pointer disabled:opacity-50"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4 mb-5 text-xs">
              <div>
                <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider text-[10px]">Giải đấu</label>
                <select
                  value={syncTournament}
                  onChange={(e) => setSyncTournament(e.target.value)}
                  disabled={syncing}
                  className="w-full bg-[#0E131F]/80 border border-card-border/80 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer disabled:opacity-50"
                >
                  {uniqueTournaments.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="NEW">[Giải đấu mới...]</option>
                </select>
                
                {syncTournament === 'NEW' && (
                  <input
                    type="text"
                    placeholder="Nhập tên giải đấu mới (ví dụ: Premier League)..."
                    value={customTournament}
                    onChange={(e) => setCustomTournament(e.target.value)}
                    disabled={syncing}
                    className="w-full bg-[#0E131F]/80 border border-card-border/80 rounded-lg py-2 px-3 text-xs text-white mt-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
                  />
                )}
              </div>

              <div>
                <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider text-[10px]">Mùa giải</label>
                <select
                  value={syncSeason}
                  onChange={(e) => setSyncSeason(e.target.value)}
                  disabled={syncing}
                  className="w-full bg-[#0E131F]/80 border border-card-border/80 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer disabled:opacity-50"
                >
                  {uniqueSeasons.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="NEW">[Mùa giải mới...]</option>
                </select>
                
                {syncSeason === 'NEW' && (
                  <input
                    type="text"
                    placeholder="Nhập mùa giải mới (ví dụ: 2024-2025)..."
                    value={customSeason}
                    onChange={(e) => setCustomSeason(e.target.value)}
                    disabled={syncing}
                    className="w-full bg-[#0E131F]/80 border border-card-border/80 rounded-lg py-2 px-3 text-xs text-white mt-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
                  />
                )}
              </div>
            </div>

            <div className="flex space-x-3 pt-3 border-t border-card-border justify-end">
              <button
                onClick={() => setShowSyncConfigModal(false)}
                disabled={syncing}
                className="bg-card-border hover:bg-card-border/85 border border-card-border text-white font-bold py-2 px-5 rounded-xl text-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  const targetTournament = syncTournament === 'NEW' ? customTournament.trim() : syncTournament;
                  const targetSeason = syncSeason === 'NEW' ? customSeason.trim() : syncSeason;
                  
                  if (!targetTournament) {
                    alert('Vui lòng nhập tên giải đấu mới!');
                    return;
                  }
                  if (!targetSeason) {
                    alert('Vui lòng nhập mùa giải mới!');
                    return;
                  }
                  handleSyncFixtures(targetTournament, targetSeason);
                }}
                disabled={syncing}
                className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary hover:to-primary text-white font-bold py-2 px-5 rounded-xl text-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                {syncing ? '⌛ Đang quét...' : 'Bắt đầu quét (AI)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SYNC PREVIEW MODAL */}
      {syncPreviewMatches && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in">
          <div className="absolute inset-0" onClick={() => !isImporting && setSyncPreviewMatches(null)}></div>
          <div className="glass-panel border border-card-border/80 rounded-2xl w-full max-w-3xl p-5 relative z-10 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-card-border pb-3 mb-4">
              <div className="text-left">
                <h2 className="text-sm font-extrabold text-white">📋 Xem trước trận đấu mới quét được ({syncPreviewMatches.length} trận)</h2>
                <p className="text-[10px] text-gray-400 mt-1">Vui lòng rà soát lại thông tin trước khi import vào hệ thống.</p>
              </div>
              <button 
                onClick={() => !isImporting && setSyncPreviewMatches(null)}
                disabled={isImporting}
                className="text-gray-400 hover:text-white font-bold text-base p-1 transition-colors leading-none cursor-pointer disabled:opacity-50"
              >
                ✕
              </button>
            </div>
            
            {/* Matches list */}
            <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1 text-xs">
              {syncPreviewMatches.length > 0 ? (
                <div className="divide-y divide-card-border/30">
                  {syncPreviewMatches.map((match, idx) => (
                    <div key={idx} className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 text-left">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="bg-primary/15 border border-primary/20 text-primary font-bold text-[9px] px-2 py-0.5 rounded-full uppercase">
                            {match.group}
                          </span>
                          <span className="text-[10.5px] text-gray-400 font-bold">
                            📅 {match.date} {match.time}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-3 mt-1.5">
                          <span className="text-white font-extrabold text-xs">{match.homeTeam}</span>
                          <span className="text-gray-500 font-black text-[10px]">VS</span>
                          <span className="text-white font-extrabold text-xs">{match.awayTeam}</span>
                        </div>
                        
                        <p className="text-[10px] text-gray-500 mt-1">📍 {match.venue}</p>
                      </div>
                      
                      <div className="sm:ml-4 flex items-center justify-end">
                        <button
                          onClick={() => handleImportMatches([match])}
                          disabled={isImporting}
                          className="bg-card-border hover:bg-primary/25 border border-card-border hover:border-primary/45 text-gray-200 hover:text-white font-bold py-1 px-3.5 rounded-lg text-[10.5px] transition-all cursor-pointer disabled:opacity-50"
                        >
                          Thêm
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400">
                  Không tìm thấy trận đấu mới nào thích hợp để hiển thị.
                </div>
              )}
            </div>

            <div className="flex space-x-3 pt-3 border-t border-card-border justify-end mt-4">
              <button
                onClick={() => setSyncPreviewMatches(null)}
                disabled={isImporting}
                className="bg-card-border hover:bg-card-border/85 border border-card-border text-white font-bold py-2 px-5 rounded-xl text-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                Đóng
              </button>
              {syncPreviewMatches.length > 0 && (
                <button
                  onClick={() => handleImportMatches(syncPreviewMatches)}
                  disabled={isImporting}
                  className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary hover:to-primary text-white font-bold py-2 px-5 rounded-xl text-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {isImporting ? '⌛ Đang thêm...' : 'Thêm tất cả'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
