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
        
        // Parse raw prediction JSON thô
        let rawPrediction = {};
        if (item.raw_prediction_json) {
          try {
            rawPrediction = JSON.parse(item.raw_prediction_json);
          } catch (e) {
            console.error("Lỗi parse raw_prediction_json:", e);
          }
        }

        return {
          ...item,
          ...rawPrediction,
          id: item.id, // Giữ nguyên ID từ bản ghi DB thực tế
          match_id: item.match_id,
          home_team: item.home_team,
          away_team: item.away_team,
          actual_home_score: item.actual_home_score,
          actual_away_score: item.actual_away_score,
          is_correct: item.is_correct,
          is_correct_ou: item.is_correct_ou,
          is_correct_handicap: item.is_correct_handicap,
          is_correct_btts: item.is_correct_btts,
          is_correct_corners: item.is_correct_corners,
          is_correct_cards: item.is_correct_cards,
          bet_evaluation_details: parsedDetails,
          created_at: item.created_at
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
