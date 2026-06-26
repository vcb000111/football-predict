import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import currentData from '@/data/fixtures.json';
import { getDB } from '@/lib/db';
import {
  fixtureIdentity,
  isWorldCup2026Request,
  validateWorldCup2026Fixture
} from '@/lib/world-cup-schedule';

function parseOptionalScore(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeImportFixture(fixture) {
  const tournament = fixture.tournament || 'World Cup 2026';
  const season = fixture.season || '2026';

  if (!isWorldCup2026Request(tournament, season)) {
    return { fixture: { ...fixture, tournament, season }, rejected: null };
  }

  const validation = validateWorldCup2026Fixture({ ...fixture, tournament, season });
  if (!validation.valid) {
    return {
      fixture: null,
      rejected: {
        fixture,
        reason: validation.reason
      }
    };
  }

  return {
    fixture: {
      ...validation.official,
      actualHomeScore: parseOptionalScore(fixture.actualHomeScore ?? fixture.actualScore?.home),
      actualAwayScore: parseOptionalScore(fixture.actualAwayScore ?? fixture.actualScore?.away),
      isTest: false
    },
    rejected: null
  };
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

    const hasCanonicalManagedFixture = fixturesToImport.some((fixture) =>
      isWorldCup2026Request(fixture.tournament || 'World Cup 2026', fixture.season || '2026')
    );

    if (hasCanonicalManagedFixture) {
      return NextResponse.json(
        {
          error: 'World Cup 2026 đang được quản lý bằng canonical schedule engine. Vui lòng dùng luồng sync/apply thay vì import payload tự do.'
        },
        { status: 400 }
      );
    }

    const normalizedResults = fixturesToImport.map(normalizeImportFixture);
    const rejectedFixtures = normalizedResults
      .filter((result) => result.rejected)
      .map((result) => result.rejected);

    if (rejectedFixtures.length > 0) {
      return NextResponse.json(
        {
          error: 'Danh sách import có trận đấu chưa khớp lịch chuẩn.',
          rejectedFixtures
        },
        { status: 400 }
      );
    }

    const cleanFixturesToImport = normalizedResults.map((result) => result.fixture);

    const db = await getDB();
    const existingFixtures = await db.all("SELECT * FROM fixtures");
    const mergedFixtures = existingFixtures.map(f => ({
      id: f.id,
      homeTeam: f.home_team,
      awayTeam: f.away_team,
      date: f.match_date,
      time: f.match_time,
      group: f.group_name,
      venue: f.venue,
      tournament: f.tournament,
      season: f.season,
      actualHomeScore: f.actual_home_score,
      actualAwayScore: f.actual_away_score,
      actualFirstHalfScore: f.actual_first_half_home_score !== null && f.actual_first_half_away_score !== null ? {
        home: f.actual_first_half_home_score,
        away: f.actual_first_half_away_score
      } : null,
      isTest: f.is_test === 1
    }));

    let addedCount = 0;
    const statements = [];

    cleanFixturesToImport.forEach((newF) => {
      // Kiểm tra trùng lặp
      const exists = mergedFixtures.some(
        (f) => fixtureIdentity(f) === fixtureIdentity(newF)
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
        
        const nextId = isTest ? `t${maxTestNum + 1}` : (newF.id || `m${maxMatchNum + 1}`);

        const fixtureRecord = {
          id: nextId,
          homeTeam: newF.homeTeam,
          awayTeam: newF.awayTeam,
          date: newF.date,
          time: newF.time || '20:00',
          group: newF.group || 'Group Stage',
          venue: newF.venue || 'TBA',
          tournament: newF.tournament || 'World Cup 2026',
          season: newF.season || '2026',
          actualHomeScore: parseOptionalScore(newF.actualHomeScore ?? newF.actualScore?.home),
          actualAwayScore: parseOptionalScore(newF.actualAwayScore ?? newF.actualScore?.away),
          isTest
        };

        statements.push({
          sql: `INSERT INTO fixtures (
            id, home_team, away_team, match_date, match_time, group_name, venue, tournament, season,
            actual_home_score, actual_away_score, is_test
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            fixtureRecord.id,
            fixtureRecord.homeTeam,
            fixtureRecord.awayTeam,
            fixtureRecord.date,
            fixtureRecord.time,
            fixtureRecord.group,
            fixtureRecord.venue,
            fixtureRecord.tournament,
            fixtureRecord.season,
            fixtureRecord.actualHomeScore,
            fixtureRecord.actualAwayScore,
            fixtureRecord.isTest ? 1 : 0
          ]
        });

        mergedFixtures.push(fixtureRecord);
        addedCount++;
      }
    });

    if (statements.length > 0) {
      await db.batch(statements);
    }

    const updatedData = {
      groups: currentData.groups,
      fixtures: mergedFixtures
    };

    // Ghi đè vào file fixtures.json local
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
