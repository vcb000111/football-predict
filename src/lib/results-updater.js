import { GoogleGenAI } from '@google/genai';
import { searchInternet } from '@/lib/search';
import { callOpenRouterModel } from '@/lib/openrouter';
// helper normalize và map
function normalizeTeamName(name) {
  if (!name) return '';
  const lower = name.trim().toLowerCase();
  const aliases = {
    'usa': 'united states',
    'türkiye': 'turkey',
    'côte d\'ivoire': 'ivory coast',
    'cote d\'ivoire': 'ivory coast',
    'korea republic': 'south korea',
    'republic of korea': 'south korea'
  };
  return aliases[lower] || lower;
}

function mapDbFixtureToJSON(dbFixture) {
  if (!dbFixture) return null;
  return {
    id: dbFixture.id,
    homeTeam: dbFixture.home_team,
    awayTeam: dbFixture.away_team,
    date: dbFixture.match_date,
    time: dbFixture.match_time,
    group: dbFixture.group_name,
    venue: dbFixture.venue,
    tournament: dbFixture.tournament,
    season: dbFixture.season,
    actualHomeScore: dbFixture.actual_home_score,
    actualAwayScore: dbFixture.actual_away_score,
    actualFirstHalfScore: dbFixture.actual_first_half_home_score !== null && dbFixture.actual_first_half_away_score !== null ? {
      home: dbFixture.actual_first_half_home_score,
      away: dbFixture.actual_first_half_away_score
    } : null
  };
}

export function generateMockTimeline(homeTeam, awayTeam, homeScore, awayScore, firstHalfHome, firstHalfAway) {
  const timeline = [];
  
  timeline.push({
    minute: 1,
    team: 'none',
    type: 'kickoff',
    player: '',
    detail: `Trận đấu bắt đầu! Trọng tài chính thổi còi khai cuộc cho trận đấu giữa ${homeTeam} và ${awayTeam}.`
  });

  const homeGoals = [];
  const awayGoals = [];
  
  for (let i = 0; i < (firstHalfHome || 0); i++) {
    homeGoals.push(Math.floor(Math.random() * 40) + 5);
  }
  for (let i = 0; i < (firstHalfAway || 0); i++) {
    awayGoals.push(Math.floor(Math.random() * 40) + 5);
  }

  const secondHalfHomeCount = Math.max(0, (homeScore || 0) - (firstHalfHome || 0));
  const secondHalfAwayCount = Math.max(0, (awayScore || 0) - (firstHalfAway || 0));
  for (let i = 0; i < secondHalfHomeCount; i++) {
    homeGoals.push(Math.floor(Math.random() * 40) + 47);
  }
  for (let i = 0; i < secondHalfAwayCount; i++) {
    awayGoals.push(Math.floor(Math.random() * 40) + 47);
  }

  homeGoals.sort((a, b) => a - b);
  awayGoals.sort((a, b) => a - b);

  const mockHomePlayers = ["Tiền đạo", "Tiền vệ", "Hậu vệ", "Ngôi sao cánh", "Trung phong"];
  const mockAwayPlayers = ["Cầu thủ số 9", "Đội trưởng", "Tiền đạo biên", "Tiền vệ công", "Cầu thủ chạy cánh"];

  homeGoals.forEach((min, idx) => {
    const player = mockHomePlayers[idx % mockHomePlayers.length];
    timeline.push({
      minute: min,
      team: 'home',
      type: 'goal',
      player: player,
      detail: `⚽ VÀOOO! ${player} dứt điểm hiểm hóc tung lưới ${awayTeam}, ghi bàn thắng cho ${homeTeam}.`
    });
  });

  awayGoals.forEach((min, idx) => {
    const player = mockAwayPlayers[idx % mockAwayPlayers.length];
    timeline.push({
      minute: min,
      team: 'away',
      type: 'goal',
      player: player,
      detail: `⚽ VÀOOO! ${player} tận dụng sai lầm hàng thủ đối phương, ghi bàn thắng cho ${awayTeam}.`
    });
  });

  const extraEvents = [
    { type: 'yellow_card', team: 'home', min: 18, player: 'Hậu vệ quét', detail: '🟨 Trọng tài rút thẻ vàng cảnh cáo sau pha vào bóng nguy hiểm từ phía sau.' },
    { type: 'yellow_card', team: 'away', min: 35, player: 'Tiền vệ phòng ngự', detail: '🟨 Thẻ vàng cho cầu thủ bên phía khách vì lỗi kéo người chiến thuật.' },
    { type: 'shoot', team: 'home', min: 22, player: 'Tiền vệ cánh', detail: '💥 KHÔNG VÀO! Pha sút bóng căng dội xà ngang khung thành đầy đáng tiếc.' },
    { type: 'save', team: 'away', min: 28, player: 'Thủ môn', detail: '🧤 CỨU THUA XUẤT THẦN! Thủ môn bay người đấm bóng chịu quả phạt góc.' },
    { type: 'corner', team: 'home', min: 29, player: 'Tiền vệ công', detail: '🚩 Phạt góc! Quả đá phạt góc khó chịu đưa bóng cuộn vào vòng cấm địa.' },
    { type: 'substitution', team: 'away', min: 60, player: 'Cầu thủ dự bị', detail: '🔄 Thay đổi người! Huấn luyện viên quyết định thay người chiến thuật.' },
    { type: 'yellow_card', team: 'away', min: 72, player: 'Trung vệ', detail: '🟨 Thẻ vàng phạt lỗi cản người không bóng ngăn đợt tấn công nguy hiểm.' },
    { type: 'shoot', team: 'away', min: 78, player: 'Tiền đạo', detail: '💥 NGUY HIỂM! Pha dứt điểm chéo góc đưa bóng đi chệch cột dọc trong gang tấc.' },
    { type: 'foul', team: 'home', min: 82, player: 'Trung vệ', detail: '🛑 Trọng tài cắt còi! Pha phạm lỗi ngay sát vòng cấm địa, cơ hội đá phạt nguy hiểm.' }
  ];

  const usedMinutes = new Set([...homeGoals, ...awayGoals, 1, 45, 46, 90]);
  extraEvents.forEach(evt => {
    let min = evt.min;
    while (usedMinutes.has(min)) {
      min += 1;
    }
    if (min < 90) {
      usedMinutes.add(min);
      timeline.push({
        minute: min,
        team: evt.team,
        type: evt.type,
        player: evt.player,
        detail: evt.detail
      });
    }
  });

  timeline.push({
    minute: 45,
    team: 'none',
    type: 'half_time',
    player: '',
    detail: `⏱️ Hết hiệp 1! Hai đội tạm nghỉ với tỷ số tạm thời là ${firstHalfHome || 0}-${firstHalfAway || 0}.`
  });

  timeline.push({
    minute: 46,
    team: 'none',
    type: 'kickoff',
    player: '',
    detail: '⏱️ Hiệp 2 bắt đầu! Quyền giao bóng thuộc về đội khách.'
  });

  timeline.push({
    minute: 90,
    team: 'none',
    type: 'full_time',
    player: '',
    detail: `🏁 HẾT GIỜ! Trọng tài thổi còi kết thúc trận đấu. Kết quả chung cuộc: ${homeTeam} ${homeScore}-${awayScore} ${awayTeam}.`
  });

  timeline.sort((a, b) => {
    if (a.minute !== b.minute) {
      return a.minute - b.minute;
    }
    const order = { kickoff: 0, goal: 2, yellow_card: 3, red_card: 4, substitution: 5, half_time: 9, full_time: 10 };
    return (order[a.type] || 5) - (order[b.type] || 5);
  });

  return timeline;
}

import { getVNTime } from '@/lib/timezone';
import fs from 'fs';
import path from 'path';

// --- CÁC HÀM HELPER ĐÁNH GIÁ KÈO CƯỢC (Được Export để tái sử dụng) ---
export function evaluateHandicap(recommendation, aHome, aAway, homeTeam, awayTeam, handicapLine = null) {
  if (!recommendation) return { outcome: 'n/a', reason: 'Không có thông tin kèo cược chấp.' };
  const lowerRec = recommendation.toLowerCase();
  let selectedTeam = '';
  
  if (lowerRec.includes('home') || lowerRec.includes(homeTeam.toLowerCase())) {
    selectedTeam = 'home';
  } else if (lowerRec.includes('away') || lowerRec.includes(awayTeam.toLowerCase())) {
    selectedTeam = 'away';
  } else {
    return { outcome: 'n/a', reason: `Không xác định được đội chọn từ kèo: ${recommendation}` };
  }
  
  let handicapValue = 0.0;
  let hasLine = false;
  if (handicapLine !== null && handicapLine !== undefined && handicapLine !== '') {
    handicapValue = parseFloat(handicapLine);
    hasLine = true;
  } else {
    const numMatch = recommendation.match(/[-+]?\d+(\.\d+)?/);
    if (!numMatch) {
      return { outcome: 'n/a', reason: `Không tìm thấy tỷ lệ chấp từ kèo: ${recommendation}` };
    }
    handicapValue = parseFloat(numMatch[0]);
  }
  
  let netDiff = 0;
  if (hasLine) {
    if (selectedTeam === 'home') {
      netDiff = aHome - aAway + handicapValue;
    } else {
      netDiff = aAway - aHome - handicapValue;
    }
  } else {
    if (selectedTeam === 'home') {
      netDiff = aHome - aAway + handicapValue;
    } else {
      netDiff = aAway - aHome + handicapValue;
    }
  }
  
  let outcome = 'incorrect';
  let reason = '';
  if (netDiff > 0.25) {
    outcome = 'correct';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} thắng cả tiền (Mốc cược: ${handicapValue}).`;
  } else if (netDiff === 0.25) {
    outcome = 'correct';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} thắng nửa tiền (Mốc cược: ${handicapValue}).`;
  } else if (netDiff === 0) {
    outcome = 'refund';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} hòa tiền (refund).`;
  } else if (netDiff === -0.25) {
    outcome = 'incorrect';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} thua nửa tiền (Mốc cược: ${handicapValue}).`;
  } else {
    outcome = 'incorrect';
    reason = `Kết quả thực tế ${aHome}-${aAway}. Lựa chọn ${recommendation} thua cả tiền (Mốc cược: ${handicapValue}).`;
  }
  return { outcome, reason };
}

export function evaluateAsianOu(recommendation, actualTotal, line) {
  if (!recommendation) return { outcome: 'n/a', reason: 'Không có khuyến nghị.' };
  const lowerRec = recommendation.toLowerCase();
  const isOver = lowerRec.includes('over') || lowerRec.includes('tài');
  const isUnder = lowerRec.includes('under') || lowerRec.includes('xỉu');

  if (!isOver && !isUnder) {
    return { outcome: 'n/a', reason: `Không xác định được loại kèo Over/Under từ: ${recommendation}` };
  }

  const diff = actualTotal - line;
  const remainder = line % 1;
  
  let outcome = 'incorrect';
  let reason = '';

  if (Math.abs(remainder - 0.5) < 0.01) {
    if (diff > 0) {
      outcome = isOver ? 'correct' : 'incorrect';
    } else {
      outcome = isUnder ? 'correct' : 'incorrect';
    }
    reason = `Thực tế là ${actualTotal}. Khuyến nghị: ${recommendation}. Kết quả: ${outcome === 'correct' ? 'Thắng' : 'Thua'}.`;
  } 
  else if (Math.abs(remainder - 0.0) < 0.01) {
    if (diff > 0) {
      outcome = isOver ? 'correct' : 'incorrect';
    } else if (diff < 0) {
      outcome = isUnder ? 'correct' : 'incorrect';
    } else {
      outcome = 'refund';
    }
    reason = `Thực tế là ${actualTotal}. Khuyến nghị: ${recommendation}. Kết quả: ${outcome === 'correct' ? 'Thắng' : (outcome === 'refund' ? 'Hòa tiền' : 'Thua')}.`;
  }
  else if (Math.abs(remainder - 0.25) < 0.01) {
    if (isOver) {
      if (diff > 0.25) {
        outcome = 'correct';
        reason = `Thực tế là ${actualTotal}. Chọn Over ${line} thắng cả tiền.`;
      } else if (diff === -0.25) {
        outcome = 'incorrect';
        reason = `Thực tế là ${actualTotal}. Chọn Over ${line} thua nửa tiền.`;
      } else {
        outcome = 'incorrect';
        reason = `Thực tế là ${actualTotal}. Chọn Over ${line} thua cả tiền.`;
      }
    } else {
      if (diff < -0.25) {
        outcome = 'correct';
        reason = `Thực tế là ${actualTotal}. Chọn Under ${line} thắng cả tiền.`;
      } else if (diff === -0.25) {
        outcome = 'correct';
        reason = `Thực tế là ${actualTotal}. Chọn Under ${line} thắng nửa tiền.`;
      } else {
        outcome = 'incorrect';
        reason = `Thực tế là ${actualTotal}. Chọn Under ${line} thua cả tiền.`;
      }
    }
  }
  else if (Math.abs(remainder - 0.75) < 0.01) {
    if (isOver) {
      if (diff > 0.25) {
        outcome = 'correct';
        reason = `Thực tế là ${actualTotal}. Chọn Over ${line} thắng cả tiền.`;
      } else if (diff === 0.25) {
        outcome = 'correct';
        reason = `Thực tế là ${actualTotal}. Chọn Over ${line} thắng nửa tiền.`;
      } else {
        outcome = 'incorrect';
        reason = `Thực tế là ${actualTotal}. Chọn Over ${line} thua cả tiền.`;
      }
    } else {
      if (diff < -0.25) {
        outcome = 'correct';
        reason = `Thực tế là ${actualTotal}. Chọn Under ${line} thắng cả tiền.`;
      } else if (diff === 0.25) {
        outcome = 'incorrect';
        reason = `Thực tế là ${actualTotal}. Chọn Under ${line} thua nửa tiền.`;
      } else {
        outcome = 'incorrect';
        reason = `Thực tế là ${actualTotal}. Chọn Under ${line} thua cả tiền.`;
      }
    }
  }
  else {
    if (diff > 0) {
      outcome = isOver ? 'correct' : 'incorrect';
    } else if (diff < 0) {
      outcome = isUnder ? 'correct' : 'incorrect';
    } else {
      outcome = 'refund';
    }
    reason = `Thực tế là ${actualTotal}. Khuyến nghị: ${recommendation}.`;
  }

  return { outcome, reason };
}

export function evaluateBetOutcome(rec1x2, recOu, recHandicap, recBtts, recCorners, recCards, predictedScore, aHome, aAway, actualCorners, actualCards, homeTeam, awayTeam, ouLine = 2.5, cornersLine = 8.5, cardsLine = 3.5, handicapLine = 0.0) {
  const pHome = predictedScore.home;
  const pAway = predictedScore.away;

  const actualOutcome = aHome > aAway ? 'Home' : (aHome < aAway ? 'Away' : 'Draw');
  const isCorrect_1x2 = (rec1x2 === actualOutcome) ? 1 : 0;
  
  const totalGoals = aHome + aAway;
  const ouEval = evaluateAsianOu(recOu, totalGoals, ouLine);
  let isCorrect_ou = 0;
  if (ouEval.outcome === 'correct') isCorrect_ou = 1;
  if (ouEval.outcome === 'refund') isCorrect_ou = 2;

  const recBttsLower = (recBtts || '').toLowerCase();
  const actualBtts = (aHome > 0 && aAway > 0) ? 'yes' : 'no';
  let isCorrect_btts = 0;
  if (recBttsLower.includes('yes') && actualBtts === 'yes') isCorrect_btts = 1;
  if (recBttsLower.includes('no') && actualBtts === 'no') isCorrect_btts = 1;

  let isCorrect_corners = null;
  let cornersEval = { outcome: 'n/a', reason: 'Không có dữ liệu phạt góc thực tế.' };
  if (actualCorners !== null && actualCorners !== undefined) {
    cornersEval = evaluateAsianOu(recCorners, actualCorners, cornersLine);
    isCorrect_corners = cornersEval.outcome === 'correct' ? 1 : (cornersEval.outcome === 'refund' ? 2 : 0);
  }

  let isCorrect_cards = null;
  let cardsEval = { outcome: 'n/a', reason: 'Không có dữ liệu thẻ phạt thực tế.' };
  if (actualCards !== null && actualCards !== undefined) {
    cardsEval = evaluateAsianOu(recCards, actualCards, cardsLine);
    isCorrect_cards = cardsEval.outcome === 'correct' ? 1 : (cardsEval.outcome === 'refund' ? 2 : 0);
  }

  const handicapEval = evaluateHandicap(recHandicap, aHome, aAway, homeTeam, awayTeam, handicapLine);
  let isCorrect_handicap = 0;
  if (handicapEval.outcome === 'correct') isCorrect_handicap = 1;
  if (handicapEval.outcome === 'refund') isCorrect_handicap = 2;

  const evalDetails = {
    oneXTwo: {
      outcome: isCorrect_1x2 === 1 ? 'correct' : 'incorrect',
      reason: `Kết quả thực tế là ${aHome}-${aAway}. Bạn dự đoán tỷ số ${pHome}-${pAway} (khuyến nghị ${rec1x2}).`
    },
    overUnder: ouEval,
    handicap: handicapEval,
    btts: {
      outcome: isCorrect_btts === 1 ? 'correct' : 'incorrect',
      reason: `Cả hai đội ghi bàn thực tế: ${actualBtts === 'yes' ? 'Có' : 'Không'}. Khuyến nghị của bạn: ${recBtts || 'N/A'}.`
    },
    corners: cornersEval,
    cards: cardsEval
  };

  return {
    isCorrect_1x2,
    isCorrect_ou,
    isCorrect_btts,
    isCorrect_corners,
    isCorrect_cards,
    isCorrect_handicap,
    evalDetails
  };
}

function getDiffMinutes(venueStr) {
  let diffMinutes = 13 * 60; // Mặc định là UTC-6 (Mexico City) -> lệch 13 tiếng (VN đi trước 13 tiếng) -> +780 phút
  const venue = (venueStr || '').toLowerCase();

  if (venue.includes('mexico city') || venue.includes('guadalajara') || venue.includes('azteca') || venue.includes('akron') || venue.includes('guadalajara')) {
    diffMinutes = 13 * 60;
  } else if (venue.includes('monterrey') || venue.includes('bbva')) {
    diffMinutes = 13 * 60;
  } else if (venue.includes('toronto') || venue.includes('bmo field') || venue.includes('atlanta') || venue.includes('mercedes-benz') || venue.includes('boston') || venue.includes('gillette') || venue.includes('miami') || venue.includes('hard rock') || venue.includes('new york') || venue.includes('metlife') || venue.includes('philadelphia') || venue.includes('lincoln financial')) {
    diffMinutes = 11 * 60; // Eastern Daylight Time (UTC-4) -> VN (UTC+7) -> lệch 11 tiếng
  } else if (venue.includes('dallas') || venue.includes('at&t') || venue.includes('houston') || venue.includes('nrg') || venue.includes('kansas') || venue.includes('arrowhead')) {
    diffMinutes = 12 * 60; // Central Daylight Time (UTC-5) -> VN (UTC+7) -> lệch 12 tiếng
  } else if (venue.includes('vancouver') || venue.includes('bc place') || venue.includes('los angeles') || venue.includes('sofi') || venue.includes('san francisco') || venue.includes('levi\'s') || venue.includes('seattle') || venue.includes('lumen')) {
    diffMinutes = 14 * 60; // Pacific Daylight Time (UTC-7) -> VN (UTC+7) -> lệch 14 tiếng
  } else if (venue.includes('istanbul') || venue.includes('turkey')) {
    diffMinutes = 4 * 60; // Turkey (UTC+3) -> VN (UTC+7) -> lệch 4 tiếng
  } else if (venue.includes('oslo') || venue.includes('norway') || venue.includes('rijeka') || venue.includes('croatia') || venue.includes('luxembourg') || venue.includes('rotterdam') || venue.includes('netherlands') || venue.includes('warsaw') || venue.includes('poland') || venue.includes('copenhagen') || venue.includes('denmark') || venue.includes('paris') || venue.includes('saint-denis') || venue.includes('france') || venue.includes('madrid') || venue.includes('spain') || venue.includes('solna') || venue.includes('sweden')) {
    diffMinutes = 5 * 60; // Western/Central Europe (UTC+2) -> VN (UTC+7) -> lệch 5 tiếng
  } else if (venue.includes('cardiff') || venue.includes('wales') || venue.includes('london')) {
    diffMinutes = 6 * 60; // UK (UTC+1) -> VN (UTC+7) -> lệch 6 tiếng
  }
  return diffMinutes;
}

export function getMatchTime(fixture) {
  if (!fixture || !fixture.date || !fixture.time) return null;
  try {
    const diffMinutes = getDiffMinutes(fixture.venue);
    const [year, month, day] = fixture.date.split('-').map(Number);
    const [hour, minute] = fixture.time.split(':').map(Number);
    
    const baseDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const matchTimeMs = baseDate.getTime() + (diffMinutes - 7 * 60) * 60 * 1000;
    return new Date(matchTimeMs);
  } catch (e) {
    return null;
  }
}

function buildFixtureSearchContext(fixture) {
  if (!fixture) {
    return {
      searchSuffix: 'World Cup 2026',
      promptContext: 'Không có dữ liệu fixture chi tiết ngoài tên hai đội.'
    };
  }

  const matchDate = fixture.date || '';
  const localTime = fixture.time || '';
  const venue = fixture.venue || '';
  const group = fixture.group || '';
  const tournament = fixture.tournament || 'World Cup 2026';
  const season = fixture.season || '2026';
  const vnTime = getVNTime(fixture.date, fixture.time, fixture.venue)?.formatted || '';

  const parts = [
    tournament,
    season,
    group,
    matchDate,
    localTime ? `${localTime} local time` : '',
    vnTime ? `${vnTime} Vietnam time` : '',
    venue
  ].filter(Boolean);

  return {
    searchSuffix: parts.join(' '),
    promptContext: [
      `matchId: ${fixture.id || 'unknown'}`,
      `tournament: ${tournament}`,
      `season: ${season}`,
      `group: ${group || 'N/A'}`,
      `date: ${matchDate || 'N/A'}`,
      `kickoffLocalTime: ${localTime || 'N/A'}`,
      `kickoffVietnamTime: ${vnTime || 'N/A'}`,
      `venue: ${venue || 'N/A'}`
    ].join('\n')
  };
}

// --- HÀM HELPER CHÍNH CẬP NHẬT KẾT QUẢ ---
export async function updateMatchResult({ homeTeam, awayTeam, matchId, force, db }) {
  try {
    // 0. Tìm thông tin trận đấu (fixture) từ DB và kiểm tra thời gian thi đấu thực tế
    let dbFixture = null;
    if (matchId) {
      dbFixture = await db.get('SELECT * FROM fixtures WHERE id = ?', [matchId]);
    } else {
      dbFixture = await db.get('SELECT * FROM fixtures WHERE home_team = ? AND away_team = ?', [homeTeam, awayTeam]);
    }
    const fixture = mapDbFixtureToJSON(dbFixture);

    if (fixture) {
      const matchTime = getMatchTime(fixture);
      if (matchTime) {
        const currentTime = new Date();
        const diffMs = currentTime.getTime() - matchTime.getTime();
        
        // Trận đấu chưa bắt đầu hoặc đang thi đấu (chưa hết 150 phút)
        if (diffMs < 150 * 60 * 1000) {
          const isFuture = diffMs < 0;
          return {
            success: false,
            status: isFuture ? 'not_started' : 'live',
            message: isFuture
              ? `Trận đấu giữa ${homeTeam} và ${awayTeam} chưa diễn ra. Không thể cập nhật kết quả.`
              : `Trận đấu giữa ${homeTeam} và ${awayTeam} đang diễn ra. Vui lòng quay lại sau khi trận đấu kết thúc.`
          };
        }
      }
    }

    let apiKeys = [];
    let MODELS = [];
    let geminiKeys = [];
    let openrouterKeys = [];

    // Tải cấu hình API key/models
    try {
      const activeKeysRows = await db.all("SELECT key_value, provider FROM api_keys WHERE status = 1");
      geminiKeys = Array.from(new Set(activeKeysRows.filter(r => (r.provider || 'gemini') === 'gemini').map(row => row.key_value.trim())));
      openrouterKeys = Array.from(new Set(activeKeysRows.filter(r => r.provider === 'openrouter').map(row => row.key_value.trim())));
      apiKeys = geminiKeys;
      
      const activeModelsRows = await db.all("SELECT model_name, provider FROM ai_models WHERE status = 1 ORDER BY priority ASC");
      MODELS = activeModelsRows.map(row => ({
        name: row.model_name.trim(),
        provider: row.provider ? row.provider.trim().toLowerCase() : 'gemini'
      }));
    } catch (dbInitError) {
      console.error('Lỗi khi tải API keys/models từ SQLite:', dbInitError);
    }

    // 1. Tìm bản ghi dự đoán làm mẫu (Có thể null nếu chưa từng predict)
    let sampleRecord = null;
    if (matchId) {
      sampleRecord = await db.get(
        'SELECT * FROM predictions WHERE match_id = ? ORDER BY id DESC LIMIT 1',
        [matchId]
      );
    }
    if (!sampleRecord) {
      sampleRecord = await db.get(
        'SELECT * FROM predictions WHERE home_team = ? AND away_team = ? ORDER BY id DESC LIMIT 1',
        [homeTeam, awayTeam]
      );
    }

    // 2. Tìm tất cả các cược chưa chấm
    let pendingPredictions = [];
    if (matchId) {
      pendingPredictions = await db.all(
        'SELECT * FROM predictions WHERE match_id = ? AND actual_home_score IS NULL',
        [matchId]
      );
    }
    if (pendingPredictions.length === 0) {
      pendingPredictions = await db.all(
        'SELECT * FROM predictions WHERE home_team = ? AND away_team = ? AND actual_home_score IS NULL',
        [homeTeam, awayTeam]
      );
    }

    // Nếu không có bản ghi nào chưa chấm, kiểm tra cờ force
    if (pendingPredictions.length === 0 && sampleRecord) {
      if (force === true) {
        if (matchId) {
          pendingPredictions = await db.all('SELECT * FROM predictions WHERE match_id = ?', [matchId]);
        } else {
          pendingPredictions = await db.all(
            'SELECT * FROM predictions WHERE home_team = ? AND away_team = ?',
            [homeTeam, awayTeam]
          );
        }
      } else {
        pendingPredictions = [sampleRecord];
      }
    }

    // 3. CHẾ ĐỘ GIẢ LẬP (MOCK MODE) khi không có API key hoạt động
    if (apiKeys.length === 0 || MODELS.length === 0) {
      const mockHomeScore = (homeTeam.length + 2) % 4;
      const mockAwayScore = (awayTeam.length + 1) % 3;
      const mockFirstHalfHome = Math.max(0, mockHomeScore - 1);
      const mockFirstHalfAway = Math.max(0, mockAwayScore - 1);
      const mockCorners = (homeTeam.length * 3 + awayTeam.length * 2) % 6 + 6;
      const mockCards = (homeTeam.length + awayTeam.length) % 5 + 1;

      if (pendingPredictions.length > 0) {
        for (const pred of pendingPredictions) {
          const isFirstHalf = pred.predict_type === 'first_half';
          const compareHome = isFirstHalf ? mockFirstHalfHome : mockHomeScore;
          const compareAway = isFirstHalf ? mockFirstHalfAway : mockAwayScore;

          const evalResults = evaluateBetOutcome(
            pred.recommendation_1x2, pred.recommendation_ou, pred.recommendation_handicap,
            pred.recommendation_btts, pred.recommendation_corners, pred.recommendation_cards,
            { home: pred.predicted_home_score, away: pred.predicted_away_score },
            compareHome, compareAway, mockCorners, mockCards, homeTeam, awayTeam,
            pred.ou_line || 2.5, pred.corners_line || 8.5, pred.cards_line || 3.5, pred.handicap_line || 0.0
          );

          const evalDetails = {
            ...evalResults.evalDetails,
            summary: `[Mock AI Grounding] Trận đấu kết thúc với tỷ số ${mockHomeScore}-${mockAwayScore}, AI đã chấm điểm cược thành công.`,
            modelUsed: 'Dự phòng / Mock'
          };

          await db.run(
            `UPDATE predictions 
             SET actual_home_score = ?, actual_away_score = ?, is_correct = ?, is_correct_ou = ?, 
                 is_correct_handicap = ?, is_correct_btts = ?, is_correct_corners = ?, is_correct_cards = ?, 
                 bet_evaluation_details = ?,
                 actual_first_half_home_score = ?, actual_first_half_away_score = ?
             WHERE id = ?`,
            [mockHomeScore, mockAwayScore, evalResults.isCorrect_1x2, evalResults.isCorrect_ou,
             evalResults.isCorrect_handicap, evalResults.isCorrect_btts, evalResults.isCorrect_corners,
             evalResults.isCorrect_cards, JSON.stringify(evalDetails), mockFirstHalfHome, mockFirstHalfAway, pred.id]
          );
        }
      }

      // Cập nhật database và file fixtures.json
      const mockTimeline = generateMockTimeline(homeTeam, awayTeam, mockHomeScore, mockAwayScore, mockFirstHalfHome, mockFirstHalfAway);
      await updateFixturesDbAndFile(db, matchId || (sampleRecord ? sampleRecord.match_id : null), homeTeam, awayTeam, mockHomeScore, mockAwayScore, mockFirstHalfHome, mockFirstHalfAway, JSON.stringify(mockTimeline));

      return {
        success: true,
        status: 'finished',
        actualScore: { home: mockHomeScore, away: mockAwayScore },
        actualFirstHalfScore: { home: mockFirstHalfHome, away: mockFirstHalfAway },
        matchTimeline: mockTimeline,
        message: 'Đã giả lập kết quả và chấm điểm thành công.'
      };
    }

    const fixtureContext = buildFixtureSearchContext(fixture);
    const matchDate = fixture ? (fixture.date || '') : '';
    const tournament = fixture ? (fixture.tournament || 'World Cup 2026') : 'World Cup 2026';

    // 4. CHẠY GOOGLE SEARCH GROUNDING RAG
    // Tinh gọn query để Tavily tìm chính xác, tránh nhồi nhét quá nhiều từ khóa rác làm nhiễu
    const q1 = `${homeTeam} vs ${awayTeam} final score result ${tournament} ${matchDate}`;
    const q2 = `${homeTeam} vs ${awayTeam} goals scorers ${tournament} ${matchDate}`;
    const q3 = `${homeTeam} vs ${awayTeam} corners stats ${tournament} ${matchDate}`;
    const q4 = `${homeTeam} vs ${awayTeam} cards yellow red stats ${tournament} ${matchDate}`;

    let searchContext = '';
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        searchInternet(q1), searchInternet(q2), searchInternet(q3), searchInternet(q4)
      ]);
      const allResults = [
        { name: 'KẾT QUẢ', data: r1 }, { name: 'BÀN THẮNG', data: r2 },
        { name: 'PHẠT GÓC', data: r3 }, { name: 'THẺ PHẠT', data: r4 }
      ];
      searchContext = `\n--- THÔNG TIN KẾT QUẢ TRA CỨU THỰC TẾ TỪ INTERNET ---`;
      allResults.forEach(res => {
        searchContext += `\n\n[Thống kê: ${res.name}]`;
        if (res.data && res.data.length > 0) {
          res.data.forEach(s => { searchContext += `\n- ${s}`; });
        } else {
          searchContext += `\n- Không tìm thấy dữ liệu.`;
        }
      });
    } catch (searchErr) {
      console.warn('⚠️ Lỗi tra cứu RAG:', searchErr.message);
    }

    const prompt = `
Hãy đóng vai trò là Trọng tài AI chấm điểm cược thể thao chuyên nghiệp. Dựa trên dữ liệu tra cứu thực tế từ Internet dưới đây, hãy xác định kết quả thực tế của trận đấu giữa:
Đội nhà (Home Team): ${homeTeam}
Đội khách (Away Team): ${awayTeam}

NGỮ CẢNH FIXTURE BẮT BUỘC PHẢI KHỚP CHÍNH XÁC:
${fixtureContext.promptContext}

Chỉ được dùng dữ liệu đúng trận đấu khớp ngày giờ/sân đấu ở trên. Nếu dữ liệu Internet nói về trận khác cùng cặp đội nhưng sai ngày, sai giải, sai sân, phải bỏ qua.

CHÚ Ý QUAN TRỌNG VỀ TỶ SỐ THỰC TẾ (CRITICAL REALTIME RULES):
1. TUYỆT ĐỐI KHÔNG LẤY TỶ SỐ DỰ ĐOÁN (prediction, preview, forecast, predicted score, simulated score). Tỷ số dự đoán trước trận (như "prediction 2-1", "AI predicts 2-1") không phải là kết quả thực tế.
2. TỶ SỐ THỰC TẾ sau khi kết thúc trận đấu (FT/Full-time) của trận đấu ${homeTeam} vs ${awayTeam} phải được xác nhận qua các cụm từ thể hiện trận đấu đã diễn ra hoặc đã kết thúc như "final score", "ended", "full time", "FT", "won 4-1", "USA 4, Paraguay 1".
3. Phân tích kỹ nội dung bài viết trong phần [Thống kê: KẾT QUẢ] và [Thống kê: BÀN THẮNG] để tìm tỷ số thực tế chính xác nhất. Nếu có thông tin tỷ số mâu thuẫn, hãy đối chiếu kỹ xem đâu là kết quả thực tế đã diễn ra và đâu chỉ là dự đoán phân tích trước trận.

Hãy trích xuất:
1. Trạng thái trận đấu: "finished" (đã kết thúc hoàn toàn) hoặc "not_started" (chưa đá / hoãn).
2. Tỷ số thực tế cả trận (actualScore): số bàn thắng của Home và Away.
3. Tỷ số thực tế kết thúc HIỆP 1 (actualFirstHalfScore): { "home": X, "away": Y } (trả về null hoặc bỏ trống nếu Internet không có dữ liệu hiệp 1).
4. Tổng số phạt góc của trận đấu.
5. Tổng số thẻ phạt của trận đấu.
6. Diễn biến trận đấu chi tiết (matchTimeline): Trích xuất mảng các sự kiện chính theo thời gian trận đấu (từ 12 đến 20 sự kiện quan trọng nhất bao gồm bàn sút, thẻ phạt, thay người, phạt góc, phạm lỗi thô bạo, cứu thua, v.v.). Mỗi sự kiện có cấu trúc: { "minute": number, "team": "home" | "away" | "none", "type": "kickoff" | "pass" | "shoot" | "goal" | "yellow_card" | "red_card" | "substitution" | "foul" | "corner" | "offside" | "save" | "referee_warning" | "half_time" | "full_time", "player": "tên cầu thủ", "detail": "Mô tả chi tiết bằng tiếng Việt" }.
Nếu dữ liệu Internet thiếu chi tiết, hãy suy luận logic để điền các sự kiện hợp lý tương thích với tỷ số thực tế.
7. So sánh đề xuất cược ban đầu của mô hình tại mẫu cược sau đây và chấm điểm cược "correct" (Đúng), "incorrect" (Sai) hoặc "refund" (Hòa tiền):

Mẫu cược: ${sampleRecord ? JSON.stringify(sampleRecord) : 'Chưa có cược trước đó'}

${searchContext}

Hãy trả về chuỗi JSON thô có cấu trúc chính xác như sau:
{
  "status": "finished",
  "actualScore": { "home": 2, "away": 1 },
  "actualFirstHalfScore": { "home": 1, "away": 0 },
  "actualCorners": 9,
  "actualCards": 4,
  "summary": "Mô tả ngắn gọn diễn biến trận đấu và kết quả chấm điểm cược.",
  "betEvaluations": {
    "oneXTwo": { "outcome": "correct", "reason": "Lý do..." },
    "overUnder": { "outcome": "incorrect", "reason": "Lý do..." },
    "handicap": { "outcome": "correct", "reason": "Lý do..." },
    "btts": { "outcome": "incorrect", "reason": "Lý do..." },
    "corners": { "outcome": "correct", "reason": "Lý do..." },
    "cards": { "outcome": "correct", "reason": "Lý do..." }
  },
  "matchTimeline": [
    { "minute": 1, "team": "none", "type": "kickoff", "player": "", "detail": "Trận đấu bắt đầu! Trọng tài chính thổi còi khai cuộc." },
    { "minute": 15, "team": "home", "type": "shoot", "player": "Tiền đạo cánh", "detail": "💥 Sút bóng! Cú sút chéo góc nguy hiểm đưa bóng đi chệch cột dọc." },
    { "minute": 24, "team": "home", "type": "goal", "player": "Ngôi sao công", "detail": "⚽ VÀOOO! Đệm bóng cận thành mở tỷ số từ pha căng ngang dọn cỗ." },
    { "minute": 45, "team": "none", "type": "half_time", "player": "", "detail": "⏱️ Hết hiệp 1! Tỷ số tạm thời là 1-0." },
    { "minute": 46, "team": "none", "type": "kickoff", "player": "", "detail": "Hiệp 2 bắt đầu!" },
    { "minute": 58, "team": "away", "type": "goal", "player": "Cầu thủ số 9", "detail": "⚽ VÀOOO! Cú đánh đầu hiểm hóc đưa trận đấu về vạch xuất phát." },
    { "minute": 72, "team": "away", "type": "yellow_card", "player": "Hậu vệ quét", "detail": "🟨 Thẻ vàng vì pha phạm lỗi cản người không bóng nguy hiểm." },
    { "minute": 88, "team": "home", "type": "goal", "player": "Đội trưởng", "detail": "⚽ VÀOOO! Cú sút phạt hàng rào đẳng cấp nâng tỷ số lên 2-1." },
    { "minute": 90, "team": "none", "type": "full_time", "player": "", "detail": "🏁 Trận đấu kết thúc với kết quả 2-1 nghiêng về đội nhà." }
  ]
}
Chỉ trả về JSON thô. Do NOT include markdown blocks.
`;

    let callResult = null;
    let lastError = null;

    for (let modelIdx = 0; modelIdx < MODELS.length; modelIdx++) {
      const currentModelObj = MODELS[modelIdx];
      const currentModel = currentModelObj.name;
      const provider = currentModelObj.provider;
      const targetKeys = provider === 'openrouter' ? openrouterKeys : geminiKeys;

      for (let keyIdx = 0; keyIdx < targetKeys.length; keyIdx++) {
        const currentKey = targetKeys[keyIdx];
        try {
          let responseText = '';
          if (provider === 'gemini') {
            const ai = new GoogleGenAI({ apiKey: currentKey });
            const rawResponse = await ai.models.generateContent({
              model: currentModel,
              contents: prompt,
              config: { abortSignal: AbortSignal.timeout(180000) },
            });
            responseText = rawResponse.text;
          } else if (provider === 'openrouter') {
            const rawResponse = await callOpenRouterModel(currentModel, [currentKey], prompt);
            responseText = rawResponse.response.text;
          }

          callResult = {
            responseText,
            modelUsed: currentModel,
            providerUsed: provider,
            keyUsed: currentKey
          };
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (callResult) break;
    }

    if (!callResult) {
      return {
        success: false,
        status: 'api_failed',
        message: 'Không có API Key hoặc Model nào hoạt động thành công.',
        details: lastError?.message
      };
    }

    const cleanJsonText = (rawText) => {
      if (!rawText) return '';
      let cleaned = rawText.trim();
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch && codeBlockMatch[1]) cleaned = codeBlockMatch[1].trim();
      const firstBrace = cleaned.indexOf('{');
      const firstBracket = cleaned.indexOf('[');
      let start = -1;
      let end = -1;
      if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        start = firstBrace;
        end = cleaned.lastIndexOf('}');
      } else if (firstBracket !== -1) {
        start = firstBracket;
        end = cleaned.lastIndexOf(']');
      }
      if (start !== -1 && end !== -1 && end > start) return cleaned.substring(start, end + 1);
      return cleaned;
    };

    const parsedData = JSON.parse(cleanJsonText(callResult.responseText));

    if (parsedData.status === 'finished' && parsedData.actualScore) {
      const aHome = parseInt(parsedData.actualScore.home, 10);
      const aAway = parseInt(parsedData.actualScore.away, 10);
      const aFirstHalfHome = parsedData.actualFirstHalfScore ? parseInt(parsedData.actualFirstHalfScore.home, 10) : null;
      const aFirstHalfAway = parsedData.actualFirstHalfScore ? parseInt(parsedData.actualFirstHalfScore.away, 10) : null;
      const aCorners = parsedData.actualCorners !== undefined ? parseInt(parsedData.actualCorners, 10) : null;
      const aCards = parsedData.actualCards !== undefined ? parseInt(parsedData.actualCards, 10) : null;

      let realEvalDetails = null;

      if (pendingPredictions.length > 0) {
        for (const pred of pendingPredictions) {
          const isFirstHalf = pred.predict_type === 'first_half';
          const compareHome = isFirstHalf ? aFirstHalfHome : aHome;
          const compareAway = isFirstHalf ? aFirstHalfAway : aAway;

          let evalResults;
          if (isFirstHalf && (aFirstHalfHome === null || aFirstHalfAway === null)) {
            evalResults = {
              isCorrect_1x2: null,
              isCorrect_ou: null,
              isCorrect_btts: null,
              isCorrect_corners: null,
              isCorrect_cards: null,
              isCorrect_handicap: null,
              evalDetails: {
                oneXTwo: { outcome: 'n/a', reason: 'Không có thông tin tỷ số Hiệp 1 thực tế.' },
                overUnder: { outcome: 'n/a', reason: 'Không có thông tin tỷ số Hiệp 1 thực tế.' },
                handicap: { outcome: 'n/a', reason: 'Không có thông tin tỷ số Hiệp 1 thực tế.' },
                btts: { outcome: 'n/a', reason: 'Không có thông tin tỷ số Hiệp 1 thực tế.' },
                corners: { outcome: 'n/a', reason: 'Không có thông tin tỷ số Hiệp 1 thực tế.' },
                cards: { outcome: 'n/a', reason: 'Không có thông tin tỷ số Hiệp 1 thực tế.' }
              }
            };
          } else {
            evalResults = evaluateBetOutcome(
              pred.recommendation_1x2, pred.recommendation_ou, pred.recommendation_handicap,
              pred.recommendation_btts, pred.recommendation_corners, pred.recommendation_cards,
              { home: pred.predicted_home_score, away: pred.predicted_away_score },
              compareHome, compareAway, aCorners, aCards, homeTeam, awayTeam,
              pred.ou_line || 2.5, pred.corners_line || 8.5, pred.cards_line || 3.5, pred.handicap_line || 0.0
            );
          }

          let finalEvalDetails = evalResults.evalDetails;
          if (sampleRecord && pred.id === sampleRecord.id && parsedData.betEvaluations) {
            const aiEval = parsedData.betEvaluations;
            finalEvalDetails = {
              oneXTwo: aiEval.oneXTwo || evalResults.evalDetails.oneXTwo,
              overUnder: aiEval.overUnder || evalResults.evalDetails.overUnder,
              handicap: aiEval.handicap || evalResults.evalDetails.handicap,
              btts: aiEval.btts || evalResults.evalDetails.btts,
              corners: aiEval.corners || evalResults.evalDetails.corners,
              cards: aiEval.cards || evalResults.evalDetails.cards
            };
          }

          const dbEvalDetails = {
            ...finalEvalDetails,
            summary: parsedData.summary || '',
            modelUsed: callResult.modelUsed
          };

          if (!realEvalDetails) realEvalDetails = dbEvalDetails;

          const isCorrect_1x2 = dbEvalDetails.oneXTwo?.outcome === 'correct' ? 1 : 0;
          const isCorrect_ou = dbEvalDetails.overUnder?.outcome === 'correct' ? 1 : (dbEvalDetails.overUnder?.outcome === 'refund' ? 2 : 0);
          const isCorrect_handicap = dbEvalDetails.handicap?.outcome === 'correct' ? 1 : (dbEvalDetails.handicap?.outcome === 'refund' ? 2 : 0);
          const isCorrect_btts = dbEvalDetails.btts?.outcome === 'correct' ? 1 : 0;
          const isCorrect_corners = dbEvalDetails.corners?.outcome === 'correct' ? 1 : (dbEvalDetails.corners?.outcome === 'refund' ? 2 : (dbEvalDetails.corners?.outcome === 'n/a' ? null : 0));
          const isCorrect_cards = dbEvalDetails.cards?.outcome === 'correct' ? 1 : (dbEvalDetails.cards?.outcome === 'refund' ? 2 : (dbEvalDetails.cards?.outcome === 'n/a' ? null : 0));

          await db.run(
            `UPDATE predictions 
             SET actual_home_score = ?, actual_away_score = ?, is_correct = ?, is_correct_ou = ?, 
                 is_correct_handicap = ?, is_correct_btts = ?, is_correct_corners = ?, is_correct_cards = ?, 
                 bet_evaluation_details = ?,
                 actual_first_half_home_score = ?, actual_first_half_away_score = ?
             WHERE id = ?`,
            [aHome, aAway, isCorrect_1x2, isCorrect_ou, isCorrect_handicap, isCorrect_btts, 
             isCorrect_corners, isCorrect_cards, JSON.stringify(dbEvalDetails), aFirstHalfHome, aFirstHalfAway, pred.id]
          );
        }
      }

      // Cập nhật database và file fixtures.json
      const matchTimeline = parsedData.matchTimeline ? JSON.stringify(parsedData.matchTimeline) : JSON.stringify(generateMockTimeline(homeTeam, awayTeam, aHome, aAway, aFirstHalfHome, aFirstHalfAway));
      await updateFixturesDbAndFile(db, matchId || (sampleRecord ? sampleRecord.match_id : null), homeTeam, awayTeam, aHome, aAway, aFirstHalfHome, aFirstHalfAway, matchTimeline);

      // --- TỰ ĐỘNG VIẾT BÀI HỌC KINH NGHIỆM ---
      if (sampleRecord) {
        await generateSelfRetrospective({ homeTeam, awayTeam, sampleRecord, aHome, aAway, parsedData, db, callResult, apiKeys });
      }

      return {
        success: true,
        status: 'finished',
        actualScore: { home: aHome, away: aAway },
        actualFirstHalfScore: { home: aFirstHalfHome, away: aFirstHalfAway },
        actualCorners: aCorners,
        actualCards: aCards,
        betEvaluations: realEvalDetails || parsedData.betEvaluations || {},
        summary: parsedData.summary,
        modelUsed: callResult.modelUsed,
        matchTimeline: parsedData.matchTimeline || JSON.parse(matchTimeline)
      };
    } else {
      return {
        success: false,
        status: parsedData.status || 'not_started',
        message: parsedData.summary || 'Trận đấu chưa bắt đầu hoặc chưa có kết quả.'
      };
    }
  } catch (error) {
    console.error('Lỗi khi cập nhật kết quả trong helper:', error);
    return { success: false, status: 'error', message: error.message };
  }
}

// Helper để cập nhật cả database và file fixtures.json local
async function updateFixturesDbAndFile(db, matchId, homeTeam, awayTeam, aHome, aAway, aFirstHalfHome = null, aFirstHalfAway = null, matchTimeline = null) {
  try {
    // 1. Cập nhật database
    if (db) {
      try {
        await db.run(
          `UPDATE fixtures 
           SET actual_home_score = ?, 
               actual_away_score = ?, 
               actual_first_half_home_score = ?, 
               actual_first_half_away_score = ?,
               match_timeline = ?
           WHERE id = ? OR (home_team = ? AND away_team = ?)`,
          [aHome, aAway, aFirstHalfHome, aFirstHalfAway, matchTimeline, matchId, homeTeam, awayTeam]
        );
        console.log(`🟢 [DB fixtures] Đã cập nhật tỉ số và diễn biến cho trận ${homeTeam} vs ${awayTeam}: ${aHome}-${aAway}`);
      } catch (dbErr) {
        // Tự động khôi phục nếu cột match_timeline chưa tồn tại (Self-healing)
        if (dbErr.message && (dbErr.message.includes('no such column') || dbErr.message.includes('match_timeline'))) {
          console.warn('⚠️ Cột match_timeline chưa tồn tại trong DB, đang tự động chạy ALTER TABLE...');
          try {
            await db.exec(`ALTER TABLE fixtures ADD COLUMN match_timeline TEXT DEFAULT NULL`);
            // Chạy lại câu lệnh UPDATE
            await db.run(
              `UPDATE fixtures 
               SET actual_home_score = ?, 
                   actual_away_score = ?, 
                   actual_first_half_home_score = ?, 
                   actual_first_half_away_score = ?,
                   match_timeline = ?
               WHERE id = ? OR (home_team = ? AND away_team = ?)`,
              [aHome, aAway, aFirstHalfHome, aFirstHalfAway, matchTimeline, matchId, homeTeam, awayTeam]
            );
            console.log(`🟢 [DB fixtures - Self-healed] Đã cập nhật tỉ số và diễn biến thành công.`);
          } catch (alterErr) {
            console.error('❌ Không thể chạy ALTER TABLE tự phục hồi:', alterErr);
          }
        } else {
          console.error('❌ Lỗi DB khi cập nhật fixtures:', dbErr);
        }
      }
    }

    // 2. Cập nhật file fixtures.json local để giữ đồng bộ (Đã loại bỏ để tránh trigger HMR reload trang)
    console.log(`ℹ️ [Skip fixtures.json] Đã bỏ qua cập nhật file tĩnh để tránh tải lại trang.`);
  } catch (err) {
    console.error('Lỗi khi cập nhật fixtures (DB/File):', err);
  }
}

// Helper tự học viết bài học kinh nghiệm
async function generateSelfRetrospective({ homeTeam, awayTeam, sampleRecord, aHome, aAway, parsedData, db, callResult, apiKeys }) {
  const incorrectBets = [];
  const sampleEval = parsedData.betEvaluations || {};
  if (sampleEval.oneXTwo?.outcome === 'incorrect') incorrectBets.push('1X2');
  if (sampleEval.overUnder?.outcome === 'incorrect') incorrectBets.push('Tài/Xỉu 2.5');
  if (sampleEval.handicap?.outcome === 'incorrect') incorrectBets.push('Handicap');
  if (sampleEval.btts?.outcome === 'incorrect') incorrectBets.push('BTTS');
  if (sampleEval.corners?.outcome === 'incorrect') incorrectBets.push('Phạt góc');
  if (sampleEval.cards?.outcome === 'incorrect') incorrectBets.push('Thẻ phạt');

  if (incorrectBets.length > 0 && apiKeys.length > 0) {
    try {
      const targetMatchId = sampleRecord.match_id || null;
      if (targetMatchId) {
        const existingLesson = await db.get('SELECT id FROM ai_lessons WHERE match_id = ? LIMIT 1', [targetMatchId]);
        if (existingLesson) return;
      }

      const lessonPrompt = `
Trận đấu ${homeTeam} vs ${awayTeam} kết thúc ${aHome}-${aAway}. Dự đoán ban đầu là tỷ số ${sampleRecord.predicted_home_score}-${sampleRecord.predicted_away_score}.
Các kèo cược bị sai: ${incorrectBets.join(', ')}. Chi tiết sai lệch: ${parsedData.summary}
Nhiệm vụ: Viết bài học kinh nghiệm siêu ngắn (dưới 50 từ) bằng tiếng Việt giải thích lý do dự đoán sai. Trả về text thô. Do NOT include markdown blocks.
`;
      const successfulKey = callResult.keyUsed;
      const successfulModel = callResult.modelUsed;
      const successfulProvider = callResult.providerUsed;

      let lessonContent = '';
      if (successfulProvider === 'gemini') {
        const aiInstance = new GoogleGenAI({ apiKey: successfulKey });
        const lessonRes = await aiInstance.models.generateContent({
          model: successfulModel,
          contents: lessonPrompt,
          config: { abortSignal: AbortSignal.timeout(15000) }
        });
        lessonContent = lessonRes.text?.trim() || '';
      } else if (successfulProvider === 'openrouter') {
        const lessonRes = await callOpenRouterModel(successfulModel, [successfulKey], lessonPrompt);
        lessonContent = lessonRes.response?.text?.trim() || '';
      }

      if (lessonContent) {
        await db.run(
          `INSERT INTO ai_lessons (match_id, team_name, bet_type, lesson_content) VALUES (?, ?, ?, ?)`,
          [targetMatchId, homeTeam, incorrectBets.join('/'), lessonContent]
        );
        await db.run(
          `INSERT INTO ai_lessons (match_id, team_name, bet_type, lesson_content) VALUES (?, ?, ?, ?)`,
          [targetMatchId, awayTeam, incorrectBets.join('/'), lessonContent]
        );
      }
    } catch (e) {
      console.warn('⚠️ Lỗi sinh bài học kinh nghiệm:', e.message);
    }
  }
}
