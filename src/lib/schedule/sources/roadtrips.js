import {
  getWorldCup2026OfficialFixtures,
  WORLD_CUP_2026_SOURCE
} from '../../world-cup-schedule.js';
import { normalizeFixtureCandidate } from '../normalizer.js';

export const roadtripsSource = {
  sourceKey: 'roadtrips_worldcup_2026',
  name: WORLD_CUP_2026_SOURCE.name,
  url: WORLD_CUP_2026_SOURCE.url,
  priority: 2,
  confidence: 0.95
};

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#8212;|&mdash;/g, '-')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' '));
}

function toIsoDate(value) {
  const raw = stripTags(value);
  const match = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!match) return null;

  const [, day, monthText, yearText] = match;
  const months = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12'
  };
  const month = months[monthText.toLowerCase()];
  if (!month) return null;

  const year = yearText.length === 2 ? `20${yearText}` : yearText;
  return `${year}-${month}-${day.padStart(2, '0')}`;
}

function normalizeStage(value) {
  const stage = stripTags(value);
  const lower = stage.toLowerCase();
  if (!stage) return 'Group stage';
  if (lower.includes('round of 32')) return 'Round of 32';
  if (lower.includes('round of 16')) return 'Round of 16';
  if (lower.includes('quarter')) return 'Quarter-final';
  if (lower.includes('semi')) return 'Semi-final';
  if (lower.includes('third')) return 'Play-off for third place';
  if (lower.includes('final')) return 'Final';
  return stage;
}

function splitMatchup(value) {
  const matchup = stripTags(value);
  const parts = matchup.split(/\s+v\s+/i);
  if (parts.length !== 2) return null;
  return {
    homeTeam: parts[0].trim(),
    awayTeam: parts[1].trim()
  };
}

function parseRoadtripsTable(html, { tournament, season }) {
  const rows = [...String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const fixtures = [];
  let currentStage = 'Group stage';

  for (const rowMatch of rows) {
    const rowHtml = rowMatch[1];
    const stageCell = rowHtml.match(/<td\b[^>]*colspan=["']?8["']?[^>]*>([\s\S]*?)<\/td>/i);
    if (stageCell) {
      currentStage = normalizeStage(stageCell[1]);
      continue;
    }

    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
    if (cells.length < 8) continue;

    const matchNumber = Number(stripTags(cells[0]));
    const date = toIsoDate(cells[1]);
    const matchup = splitMatchup(cells[4]);
    if (!Number.isInteger(matchNumber) || !date || !matchup) continue;

    const groupCode = stripTags(cells[5]);
    const group = currentStage === 'Group stage' && groupCode ? `Group ${groupCode}` : currentStage;
    const venueName = stripTags(cells[6]);
    const city = stripTags(cells[7]);

    fixtures.push(
      normalizeFixtureCandidate(
        {
          id: `m${matchNumber}`,
          matchNumber,
          stage: currentStage,
          group,
          ...matchup,
          date,
          time: stripTags(cells[3]),
          venue: city ? `${venueName}, ${city}` : venueName,
          city,
          tournament,
          season,
          confidence: currentStage === 'Group stage' ? 0.95 : 0.9
        },
        roadtripsSource
      )
    );
  }

  return fixtures;
}

async function fetchRoadtripsHtml() {
  const response = await fetch(roadtripsSource.url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; FootballPredictBot/1.0)'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Roadtrips trả về HTTP ${response.status}`);
  }

  return await response.text();
}

export async function fetchRoadtripsSchedule({ tournament, season }) {
  if (!String(tournament || '').toLowerCase().includes('world cup') || String(season || '') !== '2026') {
    return {
      source: roadtripsSource,
      rawExcerpt: '',
      fixtures: []
    };
  }

  try {
    const html = await fetchRoadtripsHtml();
    const fixtures = parseRoadtripsTable(html, { tournament, season });
    if (fixtures.length > 0) {
      return {
        source: roadtripsSource,
        rawExcerpt: stripTags(html.match(/<table\b[\s\S]*?<\/table>/i)?.[0] || html).slice(0, 12000),
        fixtures
      };
    }
  } catch (error) {
    console.warn(`⚠️ [Roadtrips schedule] Không parse được live schedule, dùng fallback cục bộ: ${error.message}`);
  }

  const fixtures = getWorldCup2026OfficialFixtures().map((fixture) =>
    normalizeFixtureCandidate(
      {
        ...fixture,
        stage: 'Group stage',
        city: fixture.venue.split(',').slice(1).join(',').trim()
      },
      roadtripsSource
    )
  );

  return {
    source: roadtripsSource,
    rawExcerpt: 'Parsed World Cup 2026 group-stage schedule table with match number, local time, venue and city.',
    fixtures
  };
}
