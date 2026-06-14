import dataFallback from '../data/fixtures.json';
import HomePageClient from './HomePageClient';
import { getDB } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Page() {
  let isKeyConfigured = !!process.env.GEMINI_API_KEYS || !!process.env.GEMINI_API_KEY;
  
  let historyCounts = {};
  let scoreMap = {};
  let latestPredictions = {};
  let groups = [];
  let fixtures = [];
  
  try {
    const db = await getDB();
    
    // Thực hiện song song toàn bộ các truy vấn độc lập để tối ưu hóa TTFB
    const [keyCount, counts, scores, latestPreds, dbGroupsData, dbFixtures] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM api_keys WHERE status = 1'),
      db.all('SELECT match_id, COUNT(*) as count FROM predictions WHERE match_id IS NOT NULL GROUP BY match_id'),
      db.all(`SELECT match_id, actual_home_score, actual_away_score 
              FROM predictions 
              WHERE id IN (SELECT MAX(id) FROM predictions WHERE match_id IS NOT NULL AND actual_home_score IS NOT NULL GROUP BY match_id)`),
      db.all(`SELECT match_id, predicted_home_score, predicted_away_score, actual_home_score, actual_away_score, is_correct,
                     ou_line, corners_line, cards_line, predict_type, first_half_home_score, first_half_away_score,
                     actual_first_half_home_score, actual_first_half_away_score
              FROM predictions 
              WHERE id IN (SELECT MAX(id) FROM predictions WHERE match_id IS NOT NULL GROUP BY match_id)`),
      db.all("SELECT group_name, team_name FROM tournament_groups WHERE tournament = 'World Cup 2026' AND season = '2026'"),
      db.all("SELECT * FROM fixtures")
    ]);
    
    if (keyCount && keyCount.count > 0) {
      isKeyConfigured = true;
    }

    counts.forEach((row) => {
      historyCounts[row.match_id] = row.count;
    });

    scores.forEach((row) => {
      scoreMap[row.match_id] = {
        actualHomeScore: row.actual_home_score,
        actualAwayScore: row.actual_away_score
      };
    });

    latestPreds.forEach((row) => {
      latestPredictions[row.match_id] = {
        predictedHomeScore: row.predicted_home_score,
        predictedAwayScore: row.predicted_away_score,
        actualHomeScore: row.actual_home_score,
        actualAwayScore: row.actual_away_score,
        isCorrect: row.is_correct,
        ou_line: row.ou_line,
        corners_line: row.corners_line,
        cards_line: row.cards_line,
        predictType: row.predict_type,
        firstHalfHomeScore: row.first_half_home_score,
        firstHalfAwayScore: row.first_half_away_score,
        actualFirstHalfHomeScore: row.actual_first_half_home_score,
        actualFirstHalfAwayScore: row.actual_first_half_away_score
      };
    });

    // Gom nhóm các đội bóng theo bảng đấu từ kết quả truy vấn gộp
    const groupMap = {};
    dbGroupsData.forEach((row) => {
      if (!groupMap[row.group_name]) {
        groupMap[row.group_name] = [];
      }
      groupMap[row.group_name].push(row.team_name);
    });
    groups = Object.keys(groupMap).map((name) => ({
      name,
      teams: groupMap[name]
    }));

    fixtures = dbFixtures.map(f => ({
      id: f.id,
      homeTeam: f.home_team,
      awayTeam: f.away_team,
      date: f.match_date,
      time: f.match_time,
      group: f.group_name,
      venue: f.venue,
      tournament: f.tournament,
      season: f.season,
      actualHomeScore: f.actual_home_score,
      actualAwayScore: f.actual_away_score,
      actualFirstHalfScore: f.actual_first_half_home_score !== null && f.actual_first_half_away_score !== null ? {
        home: f.actual_first_half_home_score,
        away: f.actual_first_half_away_score
      } : null
    }));

  } catch (err) {
    console.error('Không thể lấy thống kê lịch sử hoặc fixtures từ DB:', err.message);
    // Fallback nếu có lỗi DB
    groups = dataFallback.groups;
    fixtures = dataFallback.fixtures;
  }

  const mergedFixtures = fixtures.map((fixture) => {
    const dbScore = scoreMap[fixture.id];
    return {
      ...fixture,
      actualHomeScore: dbScore ? dbScore.actualHomeScore : fixture.actualHomeScore,
      actualAwayScore: dbScore ? dbScore.actualAwayScore : fixture.actualAwayScore
    };
  });

  const mergedData = {
    groups: groups.length > 0 ? groups : dataFallback.groups,
    fixtures: mergedFixtures
  };

  return (
    <HomePageClient 
      initialData={mergedData} 
      isKeyConfigured={isKeyConfigured} 
      historyCounts={historyCounts} 
      latestPredictions={latestPredictions}
    />
  );
}
