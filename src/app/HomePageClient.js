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
  const [activeTab, setActiveTab] = useState('fixtures'); // 'fixtures' or 'groups'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('All');
  const [layout, setLayout] = useState('grid'); // 'grid' or 'list'
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'group' | 'history'

  const { groups, fixtures } = initialData;

  // Lọc lịch thi đấu dựa trên tìm kiếm và bảng đấu
  const filteredFixtures = fixtures.filter(fixture => {
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
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('fixtures')}
              className={`pb-2.5 text-base font-bold border-b-2 transition-all duration-200 px-1 ${
                activeTab === 'fixtures' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              📅 Lịch Thi Đấu & Dự Đoán
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`pb-2.5 text-base font-bold border-b-2 transition-all duration-200 px-1 ${
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
        {activeTab === 'fixtures' && (
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
              </div>
            </div>

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
                              className="flex-1 bg-card-border hover:bg-primary/20 border border-card-border hover:border-primary/50 text-white font-bold py-2 px-3 rounded-lg text-center text-xs transition-all duration-150 flex items-center justify-center space-x-1.5"
                            >
                              <span>🧠 Dự Đoán AI</span>
                            </Link>
                            {historyCount > 0 && (
                              <Link 
                                href={`/match/${fixture.id}?tab=history`}
                                className="bg-card-border/60 hover:bg-secondary/20 border border-card-border/50 hover:border-secondary/50 text-gray-300 hover:text-white font-bold py-2 px-3 rounded-lg text-xs transition-all duration-150 flex items-center justify-center space-x-1"
                                title={`Xem lịch sử (${historyCount} lần dự đoán)`}
                              >
                                <span>📜</span>
                                <span className="text-[10px] bg-secondary/20 px-1.5 py-0.5 rounded-full text-secondary">{historyCount}</span>
                              </Link>
                            )}
                          </div>
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
                              className="flex-1 sm:flex-none bg-card-border hover:bg-primary/20 border border-card-border hover:border-primary/50 text-white font-semibold py-1 px-3 rounded text-[10px] transition-all duration-150 flex items-center justify-center space-x-1"
                            >
                              <span>🧠 Dự Đoán</span>
                            </Link>
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

    </div>
  );
}
