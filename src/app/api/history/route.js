import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get('matchId');
    const homeTeam = searchParams.get('homeTeam');
    const awayTeam = searchParams.get('awayTeam');

    const db = await getDB();
    let history = [];

    const parseHistoryDetails = (list) => {
      return list.map((item) => {
        let parsedDetails = null;
        if (item.bet_evaluation_details) {
          try {
            parsedDetails = JSON.parse(item.bet_evaluation_details);
          } catch (e) {
            console.error("Lỗi parse bet_evaluation_details:", e);
          }
        }
        return {
          ...item,
          bet_evaluation_details: parsedDetails
        };
      });
    };

    if (matchId) {
      history = await db.all(
        'SELECT * FROM predictions WHERE match_id = ? ORDER BY id DESC',
        [matchId]
      );
    } else if (homeTeam && awayTeam) {
      history = await db.all(
        `SELECT * FROM predictions 
         WHERE (home_team = ? AND away_team = ?) 
            OR (home_team = ? AND away_team = ?) 
         ORDER BY id DESC`,
        [homeTeam, awayTeam, awayTeam, homeTeam]
      );
    } else {
      return NextResponse.json(
        { error: 'Thiếu thông số truy vấn (matchId hoặc homeTeam & awayTeam)' },
        { status: 400 }
      );
    }

    return NextResponse.json({ history: parseHistoryDetails(history) });
  } catch (error) {
    console.error('Lỗi khi lấy lịch sử dự đoán:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi lấy lịch sử', details: error.message },
      { status: 500 }
    );
  }
}
