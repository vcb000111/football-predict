import data from '../data/fixtures.json';
import HomePageClient from './HomePageClient';
import { getDB } from '@/lib/db';

export default async function Page() {
  const isKeyConfigured = !!process.env.GEMINI_API_KEYS || !!process.env.GEMINI_API_KEY;
  
  let historyCounts = {};
  try {
    const db = await getDB();
    const counts = await db.all(
      'SELECT match_id, COUNT(*) as count FROM predictions WHERE match_id IS NOT NULL GROUP BY match_id'
    );
    counts.forEach((row) => {
      historyCounts[row.match_id] = row.count;
    });
  } catch (err) {
    console.error('Không thể lấy thống kê lịch sử từ SQLite:', err.message);
  }

  return (
    <HomePageClient 
      initialData={data} 
      isKeyConfigured={isKeyConfigured} 
      historyCounts={historyCounts} 
    />
  );
}
