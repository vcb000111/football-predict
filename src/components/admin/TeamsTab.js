'use client';

import { useState } from 'react';
import { getTeamFlag } from '@/lib/flags';

export default function TeamsTab({
  teams,
  onEditTeam
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('All');

  const getTeamGroup = (teamName) => {
    const groupMapping = {
      "Mexico": "Group A", "South Africa": "Group A", "South Korea": "Group A", "Czechia": "Group A",
      "Canada": "Group B", "Bosnia and Herzegovina": "Group B", "Qatar": "Group B", "Switzerland": "Group B",
      "Brazil": "Group C", "Haiti": "Group C", "Morocco": "Group C", "Scotland": "Group C",
      "USA": "Group D", "United States": "Group D", "Paraguay": "Group D", "Australia": "Group D", "Turkey": "Group D", "Türkiye": "Group D",
      "Germany": "Group E", "Curaçao": "Group E", "Ivory Coast": "Group E", "Ecuador": "Group E",
      "Japan": "Group F", "Netherlands": "Group F", "Sweden": "Group F", "Tunisia": "Group F",
      "Belgium": "Group G", "Egypt": "Group G", "Iran": "Group G", "New Zealand": "Group G",
      "Cape Verde": "Group H", "Saudi Arabia": "Group H", "Spain": "Group H", "Uruguay": "Group H",
      "France": "Group I", "Iraq": "Group I", "Norway": "Group I", "Senegal": "Group I",
      "Algeria": "Group J", "Argentina": "Group J", "Austria": "Group J", "Jordan": "Group J",
      "Colombia": "Group K", "DR Congo": "Group K", "Portugal": "Group K", "Uzbekistan": "Group K",
      "Croatia": "Group L", "England": "Group L", "Ghana": "Group L", "Panama": "Group L"
    };
    return groupMapping[teamName] || "N/A";
  };

  const renderFormBadge = (formStr) => {
    if (!formStr) return <span className="text-gray-650 italic">Chưa có</span>;
    return (
      <div className="flex gap-1">
        {formStr.split(',').map((char, idx) => {
          const c = char.trim().toUpperCase();
          let bg = 'bg-gray-650 text-white';
          if (c === 'W') bg = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/35';
          if (c === 'D') bg = 'bg-gray-550/20 text-gray-400 border border-gray-550/35';
          if (c === 'L') bg = 'bg-rose-500/20 text-rose-400 border border-rose-500/35';
          return (
            <span key={idx} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${bg}`}>
              {c}
            </span>
          );
        })}
      </div>
    );
  };

  const filteredTeams = teams.filter(t => {
    const matchesSearch = t.team_name.toLowerCase().includes(searchQuery.toLowerCase());
    const groupOfTeam = getTeamGroup(t.team_name);
    const matchesGroup = selectedGroup === 'All' || groupOfTeam === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Search and Filter Panel */}
      <div className="glass-panel border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0f172a]/20 backdrop-blur-md">
        <div className="w-full sm:flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm đội tuyển (Ví dụ: Mexico, Brazil...)"
            className="w-full bg-[#0d1527] border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-secondary/70 transition-colors"
          />
        </div>

        <div className="w-full sm:w-auto flex items-center gap-2 justify-end">
          <span className="text-[10px] text-gray-500 font-bold uppercase whitespace-nowrap">Bảng đấu:</span>
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="bg-[#0d1527] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-secondary/70 cursor-pointer"
          >
            {['All', 'Group A', 'Group B', 'Group C', 'Group D', 'Group E', 'Group F', 'Group G', 'Group H', 'Group I', 'Group J', 'Group K', 'Group L'].map(g => (
              <option key={g} value={g}>{g === 'All' ? 'Tất cả bảng' : g}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid of Teams */}
      {filteredTeams.length === 0 ? (
        <div className="text-center py-16 bg-white/5 rounded-2xl border border-dashed border-white/10">
          <p className="text-xs text-gray-500">Không tìm thấy đội tuyển nào phù hợp với bộ lọc.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTeams.map(team => {
            const group = getTeamGroup(team.team_name);
            return (
              <div
                key={team.id}
                className="glass-panel border border-white/5 hover:border-secondary/40 rounded-2xl p-5 hover:shadow-xl transition-all duration-300 flex flex-col justify-between bg-[#0f172a]/20 backdrop-blur-md"
              >
                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="flex items-center space-x-3">
                      {getTeamFlag(team.team_name, "w-8.5 h-6 rounded-md shadow border border-white/10")}
                      <div>
                        <h3 className="text-sm font-black text-white hover:text-secondary transition-colors leading-tight">
                          {team.team_name}
                        </h3>
                        <span className="text-[9px] text-gray-500 font-medium">
                          Cập nhật: {new Date(team.last_updated).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>
                    <span className="text-[9px] bg-secondary/15 text-secondary border border-secondary/25 px-2.5 py-0.5 rounded-full font-bold uppercase">
                      {group}
                    </span>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-2 gap-3 bg-white/5 p-3 rounded-xl border border-white/5 text-xs">
                    <div>
                      <p className="text-[9px] text-gray-500 font-bold uppercase">FIFA rank</p>
                      <p className="text-xs font-black text-white font-mono mt-0.5">#{team.fifa_rank || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-500 font-bold uppercase">ELO rating</p>
                      <p className="text-xs font-black text-yellow-400 font-mono mt-0.5">{team.elo_rating || 'N/A'}</p>
                    </div>
                    <div className="border-t border-white/5 pt-2 col-span-2 flex justify-between">
                      <div>
                        <span className="text-[9px] text-gray-500 font-bold uppercase block">Bàn thắng 10 trận</span>
                        <span className="text-xs font-black text-gray-300 font-mono">{team.avg_goals_scored ?? '0.0'}/trận</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-gray-500 font-bold uppercase block">Bàn thua 10 trận</span>
                        <span className="text-xs font-black text-gray-300 font-mono">{team.avg_goals_conceded ?? '0.0'}/trận</span>
                      </div>
                    </div>
                    <div className="border-t border-white/5 pt-2 col-span-2 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <span className="text-[8px] text-gray-500 font-bold uppercase block">Góc thắng</span>
                        <span className="text-[11px] font-black text-emerald-400 font-mono">{team.avg_corners_won ?? 4.5}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-gray-500 font-bold uppercase block">Góc chịu</span>
                        <span className="text-[11px] font-black text-rose-400 font-mono">{team.avg_corners_conceded ?? 4.5}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-gray-500 font-bold uppercase block">Thẻ</span>
                        <span className="text-[11px] font-black text-amber-400 font-mono">{team.avg_cards_received ?? 1.8}</span>
                      </div>
                    </div>
                  </div>

                  {/* Highlights and Tactics */}
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1">
                      <span className="text-[10px] text-gray-500 font-bold uppercase">Phong độ:</span>
                      {renderFormBadge(team.recent_form)}
                    </div>
                    {team.key_players && (
                      <div className="py-1">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">Ngôi sao:</span>
                        <p className="text-gray-300 mt-0.5 text-[11px] truncate" title={team.key_players}>{team.key_players}</p>
                      </div>
                    )}
                    {team.tactical_analysis && (
                      <div className="py-1 border-t border-white/5 pt-2">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">Lối chơi chính:</span>
                        <p className="text-gray-400 mt-0.5 text-[11px] line-clamp-2 leading-relaxed" title={team.tactical_analysis}>
                          {team.tactical_analysis}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end mt-4 pt-3 border-t border-white/5">
                  <button
                    onClick={() => onEditTeam(team)}
                    className="bg-secondary/10 hover:bg-secondary/20 border border-secondary/20 hover:border-secondary/40 text-secondary text-[11px] font-black px-4 py-1.5 rounded-xl transition-colors cursor-pointer"
                  >
                    Chỉnh sửa
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
