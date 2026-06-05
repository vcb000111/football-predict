'use client';

import { useState } from 'react';
import Link from 'next/link';

const countryCodes = {
  "Mexico": "mx", "South Africa": "za", "South Korea": "kr", "Czechia": "cz",
  "Canada": "ca", "Bosnia and Herzegovina": "ba", "Qatar": "qa", "Switzerland": "ch",
  "Brazil": "br", "Haiti": "ht", "Morocco": "ma", "Scotland": "gb-sct",
  "USA": "us", "Paraguay": "py", "Australia": "au", "Türkiye": "tr",
  "Germany": "de", "Curaçao": "cw", "Côte d'Ivoire": "ci", "Ecuador": "ec",
  "Japan": "jp", "Netherlands": "nl", "Sweden": "se", "Tunisia": "tn",
  "Belgium": "be", "Egypt": "eg", "Iran": "ir", "New Zealand": "nz",
  "Cape Verde": "cv", "Saudi Arabia": "sa", "Spain": "es", "Uruguay": "uy",
  "France": "fr", "Iraq": "iq", "Norway": "no", "Senegal": "sn",
  "Algeria": "dz", "Argentina": "ar", "Austria": "at", "Jordan": "jo",
  "Colombia": "co", "DR Congo": "cd", "Portugal": "pt", "Uzbekistan": "uz",
  "Croatia": "hr", "England": "gb-eng", "Ghana": "gh", "Panama": "pa"
};

export function getTeamFlagEmoji(teamName) {
  const flags = {
    "Mexico": "🇲🇽", "South Africa": "🇿🇦", "South Korea": "🇰🇷", "Czechia": "🇨🇿",
    "Canada": "🇨🇦", "Bosnia and Herzegovina": "🇧🇦", "Qatar": "🇶🇦", "Switzerland": "🇨🇭",
    "Brazil": "🇧🇷", "Haiti": "🇭🇹", "Morocco": "🇲🇦", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    "USA": "🇺🇸", "Paraguay": "🇵🇾", "Australia": "🇦🇺", "Türkiye": "🇹🇷",
    "Germany": "🇩🇪", "Curaçao": "🇨🇼", "Côte d'Ivoire": "🇨🇮", "Ecuador": "🇪🇨",
    "Japan": "🇯🇵", "Netherlands": "🇳🇱", "Sweden": "🇸🇪", "Tunisia": "🇹🇳",
    "Belgium": "🇧🇪", "Egypt": "🇪🇬", "Iran": "🇮🇷", "New Zealand": "🇳🇿",
    "Cape Verde": "🇨🇻", "Saudi Arabia": "🇸🇦", "Spain": "🇪🇸", "Uruguay": "🇺🇾",
    "France": "🇫🇷", "Iraq": "🇮🇶", "Norway": "🇳🇴", "Senegal": "🇸🇳",
    "Algeria": "🇩🇿", "Argentina": "🇦🇷", "Austria": "🇦🇹", "Jordan": "🇯🇴",
    "Colombia": "🇨🇴", "DR Congo": "🇨🇩", "Portugal": "🇵🇹", "Uzbekistan": "🇺🇿",
    "Croatia": "🇭🇷", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Ghana": "🇬🇭", "Panama": "🇵🇦"
  };
  return flags[teamName] || "🏳️";
}

export function getTeamFlag(teamName, className = "w-6 h-4.5") {
  const code = countryCodes[teamName];
  if (!code) return <span className="inline-block text-xl">🏳️</span>;
  return (
    <img 
      src={`https://flagcdn.com/w40/${code}.png`} 
      alt={teamName}
      className={`inline-block object-cover rounded-sm shadow-sm border border-card-border/60 ${className}`}
      loading="lazy"
    />
  );
}

export default function HomePageClient({ initialData, isKeyConfigured, historyCounts = {} }) {
  const [activeTab, setActiveTab] = useState('fixtures'); // 'fixtures', 'test-matches' or 'groups'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('All');
  const [layout, setLayout] = useState('grid'); // 'grid' or 'list'
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'group' | 'history'
  const [quickPredicting, setQuickPredicting] = useState({});
  const [modalData, setModalData] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  const handleQuickPredict = async (fixture) => {
    if (quickPredicting[fixture.id]) return;
    setQuickPredicting(prev => ({ ...prev, [fixture.id]: true }));
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          matchId: fixture.id
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi phân tích trận đấu');
      
      setModalData({
        fixture,
        prediction: data
      });
    } catch (err) {
      alert(`Lỗi phân tích nhanh: ${err.message}`);
    } finally {
      setQuickPredicting(prev => ({ ...prev, [fixture.id]: false }));
    }
  };

  const handleSyncFixtures = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/fixtures/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi đồng bộ lịch thi đấu');
      
      setSyncMessage({ success: true, text: data.message });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setSyncMessage({ success: false, text: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const { groups, fixtures } = initialData;

  // Phân chia trận đấu chính thức và trận thử nghiệm
  const displayFixtures = activeTab === 'test-matches' 
    ? fixtures.filter(f => f.isTest) 
    : fixtures.filter(f => !f.isTest);

  // Lọc lịch thi đấu dựa trên tìm kiếm và bảng đấu
  const filteredFixtures = displayFixtures.filter(fixture => {
    const matchesSearch = 
      fixture.homeTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fixture.awayTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fixture.group.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesGroup = selectedGroupFilter === 'All' || fixture.group === selectedGroupFilter;
    
    return matchesSearch && matchesGroup;
  });

  // Sắp xếp các trận đấu dựa trên sortBy
  const sortedAndFilteredFixtures = [...filteredFixtures].sort((a, b) => {
    if (sortBy === 'group') {
      return a.group.localeCompare(b.group);
    } else if (sortBy === 'history') {
      const countA = historyCounts[a.id] || 0;
      const countB = historyCounts[b.id] || 0;
      if (countB !== countA) {
        return countB - countA; // Sắp xếp giảm dần theo số lượt dự đoán
      }
    }
    // Mặc định: sắp xếp theo ngày giờ
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.time.localeCompare(b.time);
  });

  return (
    <div className="min-h-screen pb-6 bg-gradient-to-b from-[#0B0F17] via-[#0D1527] to-[#0A0D14]">
      
      {/* Hero Header Section */}
      <section className="relative overflow-hidden py-10 border-b border-card-border/50">
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

          <div className="flex justify-center space-x-3">
            <button 
              onClick={() => { setActiveTab('fixtures'); }}
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary hover:to-primary text-white font-bold py-2 px-5 rounded-xl shadow-md text-xs transition-all duration-200"
            >
              Xem Lịch Dự Đoán
            </button>
            <Link 
              href="/custom"
              className="glass-panel text-white hover:text-secondary font-bold py-2 px-5 rounded-xl text-xs hover:border-secondary/40 transition-all duration-200"
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
              <div className="flex flex-col sm:flex-row gap-2 flex-1">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Tìm kiếm đội bóng (ví dụ: Mexico, USA, Brazil...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#0E131F]/80 border border-card-border/80 rounded-lg py-1.5 px-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                </div>
                <div className="w-full sm:w-48">
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
                    onClick={handleSyncFixtures}
                    disabled={syncing}
                    className={`px-3 py-1.5 rounded-lg border font-bold text-[10px] tracking-wider transition-all duration-150 flex items-center space-x-1.5 active:scale-[0.98] cursor-pointer ${
                      syncing 
                        ? 'bg-[#151E2E] border-card-border text-gray-400' 
                        : 'bg-primary/10 hover:bg-primary/20 border-primary/30 hover:border-primary/50 text-primary hover:text-white'
                    }`}
                    title="Đồng bộ lịch thi đấu & Vòng đấu từ Internet (AI)"
                  >
                    <span>{syncing ? '🔄 Đang đồng bộ...' : '🔄 Đồng bộ lịch (AI)'}</span>
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
                    const historyCount = historyCounts[fixture.id] || 0;
                    return (
                      <div 
                        key={fixture.id}
                        className="glass-panel rounded-xl p-4 hover:border-primary/45 transition-all duration-200 flex flex-col justify-between"
                      >
                        <div>
                          {/* Card Header */}
                          <div className="flex justify-between items-center text-[10px] text-gray-500 mb-2.5">
                            <span className="bg-card-border px-2 py-0.5 rounded-full font-semibold">{fixture.group}</span>
                            <span>{fixture.date} • {fixture.time}</span>
                          </div>

                          {/* Teams Matchup */}
                          <div className="flex flex-col space-y-2.5 my-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                {getTeamFlag(fixture.homeTeam, "w-7 h-5")}
                                <span className="font-bold text-sm text-white">{fixture.homeTeam}</span>
                              </div>
                            </div>
                            <div className="text-[10px] text-gray-600 font-extrabold pl-3">VS</div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                {getTeamFlag(fixture.awayTeam, "w-7 h-5")}
                                <span className="font-bold text-sm text-white">{fixture.awayTeam}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Card Footer & Predict Button */}
                        <div className="mt-4 pt-3 border-t border-card-border/50 flex flex-col space-y-2">
                          <div className="text-[10px] text-gray-500 flex items-center">
                            <span className="mr-1">📍</span>
                            <span className="truncate">{fixture.venue}</span>
                          </div>
                          
                          <div className="flex space-x-2">
                            <Link 
                              href={`/match/${fixture.id}`}
                              className="flex-1 bg-card-border hover:bg-primary/20 border border-card-border hover:border-primary/50 text-white font-bold py-2 px-2.5 rounded-lg text-center text-xs transition-all duration-150 flex items-center justify-center space-x-1"
                              title="Xem chi tiết & lịch sử dự đoán"
                            >
                              <span>🔍 Chi Tiết</span>
                            </Link>
                            
                            <button
                              onClick={() => handleQuickPredict(fixture)}
                              disabled={quickPredicting[fixture.id]}
                              className={`flex-1 text-white font-bold py-2 px-2.5 rounded-lg text-center text-xs transition-all duration-150 flex items-center justify-center space-x-1 active:scale-[0.98] cursor-pointer ${
                                quickPredicting[fixture.id]
                                  ? 'bg-[#151E2E] text-gray-500 border border-card-border'
                                  : 'bg-gradient-to-r from-primary/80 to-secondary/80 hover:from-primary hover:to-secondary border border-primary/20 hover:border-primary/40'
                              }`}
                            >
                              <span>{quickPredicting[fixture.id] ? '⏳ Chạy...' : '⚡ Nhanh'}</span>
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
                    const historyCount = historyCounts[fixture.id] || 0;
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
                            {fixture.date} • {fixture.time}
                          </span>
                        </div>

                        {/* Teams & Flags */}
                        <div className="flex items-center justify-between sm:justify-center space-x-4 sm:w-2/5 px-2">
                          {/* Home Team */}
                          <div className="flex items-center space-x-2.5 sm:w-5/12 justify-end">
                            <span className="font-bold text-white text-right truncate max-w-[125px]">{fixture.homeTeam}</span>
                            {getTeamFlag(fixture.homeTeam, "w-6.5 h-4.5")}
                          </div>

                          <span className="text-[9px] font-black text-gray-600 bg-background/50 px-1.5 py-0.5 rounded select-none">VS</span>

                          {/* Away Team */}
                          <div className="flex items-center space-x-2.5 sm:w-5/12 justify-start">
                            {getTeamFlag(fixture.awayTeam, "w-6.5 h-4.5")}
                            <span className="font-bold text-white text-left truncate max-w-[125px]">{fixture.awayTeam}</span>
                          </div>
                        </div>

                        {/* Venue & Action buttons */}
                        <div className="flex items-center justify-between sm:justify-end space-x-3 sm:w-1/3 pt-1.5 sm:pt-0 border-t border-card-border/20 sm:border-t-0">
                          <span className="text-[10px] text-gray-500 truncate max-w-[155px] hidden md:inline-block">
                            📍 {fixture.venue.split(',')[0]}
                          </span>
                          
                          <div className="flex space-x-1.5 w-full sm:w-auto">
                            <Link 
                              href={`/match/${fixture.id}`}
                              className="flex-1 sm:flex-none bg-card-border hover:bg-primary/20 border border-card-border hover:border-primary/50 text-white font-semibold py-1 px-2 rounded text-[10px] transition-all duration-150 flex items-center justify-center space-x-0.5"
                              title="Xem chi tiết & lịch sử dự đoán"
                            >
                              <span>🔍 Chi Tiết</span>
                            </Link>
                            
                            <button
                              onClick={() => handleQuickPredict(fixture)}
                              disabled={quickPredicting[fixture.id]}
                              className={`flex-1 sm:flex-none text-white font-semibold py-1 px-2 rounded text-[10px] transition-all duration-150 flex items-center justify-center space-x-0.5 active:scale-[0.98] cursor-pointer ${
                                quickPredicting[fixture.id]
                                  ? 'bg-[#151E2E] text-gray-500 border border-card-border'
                                  : 'bg-gradient-to-r from-primary/80 to-secondary/80 hover:from-primary hover:to-secondary border border-primary/20 hover:border-primary/40'
                              }`}
                            >
                              <span>{quickPredicting[fixture.id] ? '⏳ Chạy...' : '⚡ Nhanh'}</span>
                            </button>

                            {historyCount > 0 && (
                              <Link 
                                href={`/match/${fixture.id}?tab=history`}
                                className="bg-card-border/60 hover:bg-secondary/20 border border-card-border/50 hover:border-secondary/50 text-gray-300 hover:text-white font-semibold py-1 px-2 rounded text-[10px] transition-all duration-150 flex items-center justify-center space-x-1"
                                title={`Xem lịch sử (${historyCount} lần dự đoán)`}
                              >
                                <span>📜</span>
                                <span className="text-[9px] bg-secondary/20 px-1 rounded text-secondary">{historyCount}</span>
                              </Link>
                            )}
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
              <div className="absolute top-0 right-0 text-[8px] text-gray-500 font-bold bg-card-border/40 px-2 py-0.5 rounded-bl">
                {modalData.fixture.date} • {modalData.fixture.time}
              </div>
              
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

            {/* Recommended Bets Panel */}
            <div className="space-y-2 mb-4.5">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block pl-0.5">Các Kèo AI Khuyến Nghị</span>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* 1X2 & OU */}
                <div className="p-2.5 rounded-lg bg-[#0E1321] border border-card-border/50">
                  <div className="text-[9px] text-gray-550 font-bold uppercase">Châu Âu (1X2)</div>
                  <div className="text-[11px] font-bold text-primary mt-0.5">
                    {modalData.prediction.bets?.oneXTwo?.recommendation ?? modalData.prediction.recommendation_1x2}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0E1321] border border-card-border/50">
                  <div className="text-[9px] text-gray-550 font-bold uppercase">Tài Xỉu 2.5</div>
                  <div className="text-[11px] font-bold text-secondary mt-0.5">
                    {modalData.prediction.bets?.overUnder?.recommendation ?? modalData.prediction.recommendation_ou}
                  </div>
                </div>

                {/* Handicap & BTTS */}
                <div className="p-2.5 rounded-lg bg-[#0E1321] border border-card-border/50">
                  <div className="text-[9px] text-gray-550 font-bold uppercase">Chấp Châu Á</div>
                  <div className="text-[11px] font-bold text-accent mt-0.5 truncate" title={modalData.prediction.bets?.handicap?.recommendation ?? modalData.prediction.recommendation_handicap}>
                    {modalData.prediction.bets?.handicap?.recommendation ?? modalData.prediction.recommendation_handicap}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0E1321] border border-card-border/50">
                  <div className="text-[9px] text-gray-550 font-bold uppercase">Ghi Bàn (BTTS)</div>
                  <div className="text-[11px] font-bold text-blue-400 mt-0.5">
                    {modalData.prediction.bets?.btts?.recommendation ?? modalData.prediction.recommendation_btts}
                  </div>
                </div>

                {/* Corners & Cards */}
                <div className="p-2.5 rounded-lg bg-[#0E1321] border border-card-border/50">
                  <div className="text-[9px] text-gray-550 font-bold uppercase">Phạt Góc (O/U 8.5)</div>
                  <div className="text-[11px] font-bold text-purple-400 mt-0.5 truncate" title={modalData.prediction.bets?.corners?.recommendation ?? modalData.prediction.recommendation_corners}>
                    {modalData.prediction.bets?.corners?.recommendation ?? modalData.prediction.recommendation_corners}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0E1321] border border-card-border/50">
                  <div className="text-[9px] text-gray-550 font-bold uppercase">Thẻ Phạt (O/U 3.5)</div>
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

    </div>
  );
}
