import { notFound } from 'next/navigation';
import dataFallback from '@/data/fixtures.json';
import MatchClient from './MatchClient';
import { getDB } from '@/lib/db';

export default async function MatchPage({ params }) {
  const { id } = await params;
  
  let match = null;
  try {
    const db = await getDB();
    const dbFixture = await db.get('SELECT * FROM fixtures WHERE id = ?', [id]);
    if (dbFixture) {
      match = {
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
  } catch (err) {
    console.error('Lỗi khi truy vấn DB cho chi tiết trận đấu:', err);
  }

  // Fallback if DB query fails or returned null
  if (!match) {
    match = dataFallback.fixtures.find((item) => item.id === id);
  }

  if (!match) {
    notFound();
  }

  return <MatchClient match={match} />;
}
