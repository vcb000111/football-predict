import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import currentData from '@/data/fixtures.json';

function normalizeTeamName(name) {
  if (!name) return '';
  const lower = name.trim().toLowerCase();
  const aliases = {
    'usa': 'united states',
    'türkiye': 'turkey',
    'côte d\'ivoire': 'ivory coast',
    'cote d\'ivoire': 'ivory coast',
    'korea republic': 'south korea',
    'republic of korea': 'south korea'
  };
  return aliases[lower] || lower;
}

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
          normalizeTeamName(f.homeTeam) === normalizeTeamName(newF.homeTeam) &&
          normalizeTeamName(f.awayTeam) === normalizeTeamName(newF.awayTeam) &&
          f.date === newF.date
      );

      if (!exists) {
        // Tìm ID số lớn nhất hiện tại của giải đấu chính thức (m) và thử nghiệm (t)
        let maxMatchNum = 0;
        let maxTestNum = 0;
        mergedFixtures.forEach((fixtureItem) => {
          if (fixtureItem.id && typeof fixtureItem.id === 'string') {
            if (fixtureItem.id.startsWith('m')) {
              const num = parseInt(fixtureItem.id.substring(1), 10);
              if (!isNaN(num) && num > maxMatchNum) maxMatchNum = num;
            } else if (fixtureItem.id.startsWith('t')) {
              const num = parseInt(fixtureItem.id.substring(1), 10);
              if (!isNaN(num) && num > maxTestNum) maxTestNum = num;
            }
          }
        });

        const isFriendly = newF.tournament && newF.tournament.toLowerCase().includes('friendly');
        const isTest = !!(newF.isTest || isFriendly);
        
        if (isTest) {
          newF.id = `t${maxTestNum + 1}`;
        } else {
          newF.id = `m${maxMatchNum + 1}`;
        }

        const fixtureRecord = {
          id: newF.id,
          homeTeam: newF.homeTeam,
          awayTeam: newF.awayTeam,
          date: newF.date,
          time: newF.time || '20:00',
          group: newF.group || 'Group Stage',
          venue: newF.venue || 'TBA',
          tournament: newF.tournament || 'World Cup 2026',
          season: newF.season || '2026'
        };

        if (isTest) {
          fixtureRecord.isTest = true;
        }

        mergedFixtures.push(fixtureRecord);
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
