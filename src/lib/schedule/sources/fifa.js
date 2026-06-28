import { normalizeFixtureCandidate } from '../normalizer.js';

export const fifaSource = {
  sourceKey: 'fifa_worldcup_2026',
  name: 'FIFA fixtures page',
  url: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures?country=VN&wtw-filter=ALL',
  priority: 1,
  confidence: 1
};

const FIFA_CALENDAR_API =
  'https://api.fifa.com/api/v3/calendar/matches?from=2026-06-01&to=2026-07-31&idCompetition=17&idSeason=285023&count=500';

function localizedValue(items) {
  return items?.find((item) => item.Locale === 'en-GB')?.Description
    || items?.[0]?.Description
    || '';
}

function parseFifaLocalDate(value) {
  const raw = String(value || '');
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return { date: null, time: null };
  return {
    date: match[1],
    time: `${match[2]}:${match[3]}`
  };
}

function normalizeStage(value) {
  const stage = String(value || '').trim();
  const lower = stage.toLowerCase();
  if (!stage) return 'Group stage';
  if (lower.includes('first stage')) return 'Group stage';
  if (lower.includes('round of 32')) return 'Round of 32';
  if (lower.includes('round of 16')) return 'Round of 16';
  if (lower.includes('quarter')) return 'Quarter-final';
  if (lower.includes('semi')) return 'Semi-final';
  if (lower.includes('third')) return 'Play-off for third place';
  if (lower === 'final') return 'Final';
  return stage;
}

function formatPlaceholder(code) {
  const raw = String(code || '').trim();
  if (!raw) return null;
  if (/^W(\d+)$/i.test(raw)) return `Match ${raw.slice(1)} Winner`;
  if (/^RU(\d+)$/i.test(raw)) return `Match ${raw.slice(2)} Loser`;
  return raw;
}

function resolveTeamName(team, placeholderCode) {
  const name = localizedValue(team?.TeamName) || team?.ShortClubName || team?.Abbreviation;
  if (name) return name;
  return formatPlaceholder(placeholderCode);
}

function resolveGroup(stage, groupName) {
  const group = localizedValue(groupName);
  if (stage === 'Group stage' && group) return group;
  return stage;
}

function resolveStatus(match) {
  if (match.HomeTeamScore !== null && match.AwayTeamScore !== null) {
    return 'finished';
  }
  return 'scheduled';
}

function mapFifaMatch(match, { tournament, season }) {
  const stage = normalizeStage(localizedValue(match.StageName));
  const { date, time } = parseFifaLocalDate(match.LocalDate || match.Date);
  const city = localizedValue(match.Stadium?.CityName);
  const stadium = localizedValue(match.Stadium?.Name);
  const homeTeam = resolveTeamName(match.Home, match.PlaceHolderA);
  const awayTeam = resolveTeamName(match.Away, match.PlaceHolderB);

  if (!homeTeam || !awayTeam || !date || !Number.isInteger(Number(match.MatchNumber))) {
    return null;
  }

  return normalizeFixtureCandidate(
    {
      id: `m${match.MatchNumber}`,
      matchNumber: Number(match.MatchNumber),
      stage,
      group: resolveGroup(stage, match.GroupName),
      homeTeam,
      awayTeam,
      date,
      time,
      venue: city ? `${stadium}, ${city}` : stadium,
      city: city || null,
      tournament,
      season,
      status: resolveStatus(match),
      confidence: stage === 'Group stage' ? 1 : 0.98
    },
    fifaSource
  );
}

async function fetchFifaCalendarMatches() {
  const response = await fetch(FIFA_CALENDAR_API, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (compatible; FootballPredictBot/1.0)'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`FIFA API trả về HTTP ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.Results) ? payload.Results : [];
}

export async function fetchFifaSchedule({ tournament, season }) {
  if (!String(tournament || '').toLowerCase().includes('world cup') || String(season || '') !== '2026') {
    return {
      source: fifaSource,
      rawExcerpt: '',
      fixtures: []
    };
  }

  try {
    const matches = await fetchFifaCalendarMatches();
    const fixtures = matches
      .map((match) => mapFifaMatch(match, { tournament, season }))
      .filter(Boolean)
      .sort((a, b) => a.matchNumber - b.matchNumber);

    if (fixtures.length === 0) {
      throw new Error('FIFA API không trả về trận nào.');
    }

    const r32Sample = fixtures
      .filter((fixture) => fixture.stage === 'Round of 32')
      .slice(0, 3)
      .map((fixture) => `M${fixture.matchNumber} ${fixture.homeTeam} vs ${fixture.awayTeam}`)
      .join('; ');

    return {
      source: fifaSource,
      rawExcerpt: `FIFA calendar API: ${fixtures.length} trận. R32 mẫu: ${r32Sample}`,
      fixtures
    };
  } catch (error) {
    const { fetchRoadtripsSchedule } = await import('./roadtrips.js');
    const fallback = await fetchRoadtripsSchedule({ tournament, season });
    console.warn(`⚠️ [FIFA schedule] Fallback Roadtrips: ${error.message}`);

    return {
      source: fifaSource,
      rawExcerpt: `FIFA API lỗi (${error.message}), dùng Roadtrips tạm thời.`,
      fixtures: fallback.fixtures.map((fixture) => normalizeFixtureCandidate(fixture, fifaSource))
    };
  }
}
