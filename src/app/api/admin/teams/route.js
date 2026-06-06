import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

// Lấy danh sách đội tuyển
export async function GET() {
  try {
    const db = await getDB();
    const teams = await db.all("SELECT * FROM teams ORDER BY team_name ASC");
    return NextResponse.json({ success: true, teams });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách đội tuyển từ SQLite:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi lấy danh sách đội tuyển', details: error.message },
      { status: 500 }
    );
  }
}

// Cập nhật thông số đội tuyển thủ công
export async function POST(request) {
  try {
    const { 
      id, 
      team_name, 
      fifa_rank, 
      elo_rating, 
      recent_form, 
      avg_goals_scored, 
      avg_goals_conceded, 
      key_players, 
      tactical_analysis 
    } = await request.json();

    if (!id && !team_name) {
      return NextResponse.json(
        { error: 'Thiếu thông tin nhận diện đội tuyển (id hoặc team_name)' },
        { status: 400 }
      );
    }

    const db = await getDB();
    
    let result;
    if (id) {
      result = await db.run(
        `UPDATE teams 
         SET fifa_rank = ?, 
             elo_rating = ?, 
             recent_form = ?, 
             avg_goals_scored = ?, 
             avg_goals_conceded = ?, 
             key_players = ?, 
             tactical_analysis = ?,
             last_updated = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          fifa_rank, 
          elo_rating, 
          recent_form?.trim(), 
          parseFloat(avg_goals_scored) || 0, 
          parseFloat(avg_goals_conceded) || 0, 
          key_players?.trim(), 
          tactical_analysis?.trim(), 
          id
        ]
      );
    } else {
      result = await db.run(
        `UPDATE teams 
         SET fifa_rank = ?, 
             elo_rating = ?, 
             recent_form = ?, 
             avg_goals_scored = ?, 
             avg_goals_conceded = ?, 
             key_players = ?, 
             tactical_analysis = ?,
             last_updated = CURRENT_TIMESTAMP
         WHERE team_name = ?`,
        [
          fifa_rank, 
          elo_rating, 
          recent_form?.trim(), 
          parseFloat(avg_goals_scored) || 0, 
          parseFloat(avg_goals_conceded) || 0, 
          key_players?.trim(), 
          tactical_analysis?.trim(), 
          team_name
        ]
      );
    }

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Không tìm thấy đội tuyển để cập nhật' },
        { status: 404 }
      );
    }

    // Lấy lại dữ liệu đội tuyển sau khi cập nhật
    const updatedTeam = id 
      ? await db.get("SELECT * FROM teams WHERE id = ?", [id])
      : await db.get("SELECT * FROM teams WHERE team_name = ?", [team_name]);

    return NextResponse.json({ 
      success: true, 
      message: `Đã cập nhật thông tin đội tuyển ${updatedTeam.team_name} thành công!`,
      team: updatedTeam
    });

  } catch (error) {
    console.error('Lỗi khi cập nhật thông tin đội tuyển:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi cập nhật thông tin đội tuyển', details: error.message },
      { status: 500 }
    );
  }
}
