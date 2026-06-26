export const TEAM_ALIASES = {
  usa: 'united states',
  'united states': 'united states',
  turkey: 'turkey',
  'türkiye': 'turkey',
  'ivory coast': 'ivory coast',
  "côte d'ivoire": 'ivory coast',
  'cote d\'ivoire': 'ivory coast',
  'south korea': 'south korea',
  'korea republic': 'south korea',
  'republic of korea': 'south korea',
  'cape verde': 'cape verde',
  'cabo verde': 'cape verde',
  'dr congo': 'dr congo',
  'congo dr': 'dr congo',
  curacao: 'curacao',
  'curaçao': 'curacao'
};

export function normalizeTeamName(name) {
  if (!name) return '';
  const key = String(name).trim().toLowerCase();
  return TEAM_ALIASES[key] || key;
}

export function normalizeTimeValue(value) {
  const raw = String(value || '').trim().toLowerCase().replace('h', ':');
  if (!raw) return '';

  const timeMatch = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!timeMatch) return '';

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || 0);
  const period = timeMatch[3];

  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function fixtureIdentity(fixture) {
  const teams = [
    normalizeTeamName(fixture.homeTeam ?? fixture.home_team),
    normalizeTeamName(fixture.awayTeam ?? fixture.away_team)
  ].sort().join('|');
  const date = fixture.date ?? fixture.match_date;
  const tournament = fixture.tournament;
  const season = fixture.season;
  return `${teams}|${date}|${tournament}|${season}`;
}

export function normalizeFixtureCandidate(fixture, source = {}) {
  const matchNumber = Number(fixture.matchNumber ?? fixture.match_number);
  const stage = fixture.stage || (fixture.group || fixture.group_name ? 'Group stage' : 'Unknown');
  const group = fixture.group || fixture.group_name || null;
  const city = fixture.city || null;
  const venue = fixture.venue || (fixture.stadium && city ? `${fixture.stadium}, ${city}` : fixture.stadium) || null;

  return {
    id: fixture.id || (Number.isInteger(matchNumber) ? `m${matchNumber}` : undefined),
    matchNumber: Number.isInteger(matchNumber) ? matchNumber : null,
    stage,
    group,
    homeTeam: fixture.homeTeam ?? fixture.home_team ?? null,
    awayTeam: fixture.awayTeam ?? fixture.away_team ?? null,
    date: fixture.date ?? fixture.match_date ?? null,
    time: normalizeTimeValue(fixture.time ?? fixture.match_time) || null,
    venue,
    city,
    tournament: fixture.tournament,
    season: fixture.season,
    status: fixture.status || 'scheduled',
    confidence: Number(fixture.confidence ?? source.confidence ?? 1),
    sourceKey: source.sourceKey || fixture.sourceKey || fixture.source_key || null,
    sourceName: source.name || fixture.sourceName || fixture.source_name || null,
    sourceUrl: source.url || fixture.sourceUrl || fixture.source_url || null,
    sourceHash: source.sourceHash || fixture.sourceHash || fixture.source_hash || null
  };
}
