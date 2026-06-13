import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import currentData from '@/data/fixtures.json';

const FIXTURES_FILE_PATH = path.join(process.cwd(), 'src', 'data', 'fixtures.json');

export async function POST(request) {
  try {
    const { fixturesToImport } = await request.json();

    if (!fixturesToImport || !Array.isArray(fixturesToImport)) {
      return NextResponse.json(
        { error: 'Danh sách trận đấu import không hợp lệ.' },
        { status: 400 }
      );
    }

    if (fixturesToImport.length === 0) {
      return NextResponse.json({
        success: true,
        addedCount: 0,
        message: 'Không có trận đấu nào được chọn để thêm.'
      });
    }

    // Đọc lịch thi đấu cũ
    const mergedFixtures = [...currentData.fixtures];
    let addedCount = 0;

    fixturesToImport.forEach((newF) => {
      // Kiểm tra trùng lặp
      const exists = mergedFixtures.some(
        (f) =>
          f.id === newF.id ||
          (f.homeTeam === newF.homeTeam && f.awayTeam === newF.awayTeam && f.date === newF.date)
      );

      if (!exists) {
        // Tự động sinh ID nếu chưa có
        if (!newF.id || newF.id.startsWith('m_c') || newF.id.includes('temp')) {
          newF.id = `m${mergedFixtures.length + 1}`;
        }
        
        mergedFixtures.push({
          id: newF.id,
          homeTeam: newF.homeTeam,
          awayTeam: newF.awayTeam,
          date: newF.date,
          time: newF.time || '20:00',
          group: newF.group || 'Group Stage',
          venue: newF.venue || 'TBA',
          tournament: newF.tournament || 'World Cup 2026',
          season: newF.season || '2026'
        });
        
        addedCount++;
      }
    });

    const updatedData = {
      groups: currentData.groups,
      fixtures: mergedFixtures
    };

    // Ghi đè vào file fixtures.json
    fs.writeFileSync(FIXTURES_FILE_PATH, JSON.stringify(updatedData, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      addedCount,
      totalCount: mergedFixtures.length,
      message: `Đã import thành công ${addedCount} trận đấu mới vào hệ thống!`
    });

  } catch (error) {
    console.error('Lỗi khi import lịch thi đấu:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi import lịch thi đấu', details: error.message },
      { status: 500 }
    );
  }
}
