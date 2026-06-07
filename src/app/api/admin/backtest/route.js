import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import fixturesData from '@/data/fixtures.json';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const db = await getDB();
    
    // Đọc tham số tournament từ URL query
    const { searchParams } = new URL(request.url);
    const tournament = searchParams.get('tournament') || 'All';
    
    // Lấy danh sách các trận test từ fixtures.json
    let testFixtures = fixturesData.fixtures.filter(f => f.isTest === true);
    
    if (tournament !== 'All') {
      testFixtures = testFixtures.filter(f => f.tournament === tournament);
    }
 
    // Lấy danh sách match_id đã được dự đoán trong SQLite
    const predictions = await db.all('SELECT DISTINCT match_id FROM predictions WHERE match_id IS NOT NULL');
    const predictedMatchIds = new Set(predictions.map(p => p.match_id));
 
    // Lọc ra các trận test chưa được dự đoán
    const pendingTestFixtures = testFixtures.filter(f => !predictedMatchIds.has(f.id));
 
    return NextResponse.json({
      success: true,
      totalTestMatches: testFixtures.length,
      pendingTestMatches: pendingTestFixtures.length,
      fixtures: pendingTestFixtures
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách trận test chưa chạy:', error);
    return NextResponse.json(
      { error: 'Không thể lấy danh sách trận đấu thử nghiệm', details: error.message },
      { status: 500 }
    );
  }
}
