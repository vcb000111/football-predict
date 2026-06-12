import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { updateMatchResult } from '@/lib/results-updater';

export async function POST(request) {
  try {
    const { homeTeam, awayTeam, matchId, force } = await request.json();

    if (!homeTeam || !awayTeam) {
      return NextResponse.json(
        { error: 'Thiếu thông tin đội bóng để tự động cập nhật kết quả.' },
        { status: 400 }
      );
    }

    const db = await getDB();
    const result = await updateMatchResult({ homeTeam, awayTeam, matchId, force, db });

    if (result.success) {
      return NextResponse.json(result);
    } else {
      if (result.status === 'api_failed') {
        return NextResponse.json(result);
      }
      return NextResponse.json({
        success: false,
        status: result.status || 'not_started',
        message: result.message || 'Không tìm thấy kết quả thực tế trên internet.',
        isMock: result.isMock || false
      });
    }

  } catch (error) {
    console.error('Lỗi khi tự động cập nhật kết quả:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi tự động tìm kiếm kết quả', details: error.message },
      { status: 500 }
    );
  }
}
