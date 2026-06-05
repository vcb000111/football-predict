import data from '../data/fixtures.json';
import HomePageClient from './HomePageClient';
import { getDB } from '@/lib/db';

export default async function Page() {
  const isKeyConfigured = !!process.env.GEMINI_API_KEYS || !!process.env.GEMINI_API_KEY;
  
  let historyCounts = {};
  let scoreMap = {};
  try {
    const db = await getDB();
    const counts = await db.all(
      'SELECT match_id, COUNT(*) as count FROM predictions WHERE match_id IS NOT NULL GROUP BY match_id'
    );
    counts.forEach((row) => {
      historyCounts[row.match_id] = row.count;
    });

    const scores = await db.all(
      `SELECT match_id, actual_home_score, actual_away_score 
       FROM predictions 
       WHERE id IN (SELECT MAX(id) FROM predictions WHERE match_id IS NOT NULL AND actual_home_score IS NOT NULL GROUP BY match_id)`
    );
    scores.forEach((row) => {
      scoreMap[row.match_id] = {
        actualHomeScore: row.actual_home_score,
        actualAwayScore: row.actual_away_score
      };
    });
  } catch (err) {
    console.error('Không thể lấy thống kê lịch sử từ SQLite:', err.message);
  }

  const mergedFixtures = data.fixtures.map((fixture) => {
    const dbScore = scoreMap[fixture.id];
    return {
      ...fixture,
      actualHomeScore: dbScore ? dbScore.actualHomeScore : fixture.actualHomeScore,
      actualAwayScore: dbScore ? dbScore.actualAwayScore : fixture.actualAwayScore
    };
  });

  const mergedData = {
    ...data,
    fixtures: mergedFixtures
  };

  return (
    <HomePageClient 
      initialData={mergedData} 
      isKeyConfigured={isKeyConfigured} 
      historyCounts={historyCounts} 
    />
  );
}
