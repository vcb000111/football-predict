export const WORLD_CUP_2026_TOURNAMENT = 'World Cup 2026';
export const WORLD_CUP_2026_SEASON = '2026';
export const WORLD_CUP_2026_SOURCE = {
  name: 'Roadtrips schedule table',
  url: 'https://www.roadtrips.com/world-cup/2026-world-cup-packages/schedule/'
};

const TEAM_ALIASES = {
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

function toIsoDate(dateValue) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;
  const [day, monthName, year] = String(dateValue).split('-');
  const monthMap = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
  };
  return `20${year}-${monthMap[monthName]}-${day.padStart(2, '0')}`;
}

function venueWithCity(venue, city) {
  return `${venue}, ${city}`;
}

const RAW_WORLD_CUP_2026_GROUP_STAGE = [
  [1, '11-Jun-26', '13:00', 'Mexico', 'South Africa', 'Group A', 'Estadio Azteca', 'Mexico City'],
  [2, '11-Jun-26', '20:00', 'South Korea', 'Czechia', 'Group A', 'Estadio Akron', 'Guadalajara'],
  [3, '12-Jun-26', '15:00', 'Canada', 'Bosnia and Herzegovina', 'Group B', 'BMO Field', 'Toronto'],
  [4, '12-Jun-26', '18:00', 'United States', 'Paraguay', 'Group D', 'SoFi Stadium', 'Los Angeles'],
  [5, '13-Jun-26', '21:00', 'Haiti', 'Scotland', 'Group C', 'Gillette Stadium', 'Boston'],
  [6, '13-Jun-26', '21:00', 'Australia', 'Türkiye', 'Group D', 'BC Place', 'Vancouver'],
  [7, '13-Jun-26', '18:00', 'Brazil', 'Morocco', 'Group C', 'MetLife Stadium', 'New York/New Jersey'],
  [8, '13-Jun-26', '12:00', 'Qatar', 'Switzerland', 'Group B', "Levi's Stadium", 'San Francisco Bay Area'],
  [9, '14-Jun-26', '19:00', 'Ivory Coast', 'Ecuador', 'Group E', 'Lincoln Financial Field', 'Philadelphia'],
  [10, '14-Jun-26', '12:00', 'Germany', 'Curaçao', 'Group E', 'NRG Stadium', 'Houston'],
  [11, '14-Jun-26', '15:00', 'Netherlands', 'Japan', 'Group F', 'AT&T Stadium', 'Dallas'],
  [12, '14-Jun-26', '20:00', 'Sweden', 'Tunisia', 'Group F', 'Estadio BBVA', 'Monterrey'],
  [13, '15-Jun-26', '18:00', 'Saudi Arabia', 'Uruguay', 'Group H', 'Hard Rock Stadium', 'Miami'],
  [14, '15-Jun-26', '12:00', 'Spain', 'Cape Verde', 'Group H', 'Mercedes-Benz Stadium', 'Atlanta'],
  [15, '15-Jun-26', '18:00', 'Iran', 'New Zealand', 'Group G', 'SoFi Stadium', 'Los Angeles'],
  [16, '15-Jun-26', '12:00', 'Belgium', 'Egypt', 'Group G', 'Lumen Field', 'Seattle'],
  [17, '16-Jun-26', '15:00', 'France', 'Senegal', 'Group I', 'MetLife Stadium', 'New York/New Jersey'],
  [18, '16-Jun-26', '18:00', 'Iraq', 'Norway', 'Group I', 'Gillette Stadium', 'Boston'],
  [19, '16-Jun-26', '20:00', 'Argentina', 'Algeria', 'Group J', 'Arrowhead Stadium', 'Kansas City'],
  [20, '16-Jun-26', '21:00', 'Austria', 'Jordan', 'Group J', "Levi's Stadium", 'San Francisco Bay Area'],
  [21, '17-Jun-26', '19:00', 'Ghana', 'Panama', 'Group L', 'BMO Field', 'Toronto'],
  [22, '17-Jun-26', '15:00', 'England', 'Croatia', 'Group L', 'AT&T Stadium', 'Dallas'],
  [23, '17-Jun-26', '12:00', 'Portugal', 'DR Congo', 'Group K', 'NRG Stadium', 'Houston'],
  [24, '17-Jun-26', '20:00', 'Uzbekistan', 'Colombia', 'Group K', 'Estadio Azteca', 'Mexico City'],
  [25, '18-Jun-26', '12:00', 'Czechia', 'South Africa', 'Group A', 'Mercedes-Benz Stadium', 'Atlanta'],
  [26, '18-Jun-26', '12:00', 'Switzerland', 'Bosnia and Herzegovina', 'Group B', 'SoFi Stadium', 'Los Angeles'],
  [27, '18-Jun-26', '15:00', 'Canada', 'Qatar', 'Group B', 'BC Place', 'Vancouver'],
  [28, '18-Jun-26', '19:00', 'Mexico', 'South Korea', 'Group A', 'Estadio Akron', 'Guadalajara'],
  [29, '19-Jun-26', '21:00', 'Brazil', 'Haiti', 'Group C', 'Lincoln Financial Field', 'Philadelphia'],
  [30, '19-Jun-26', '18:00', 'Scotland', 'Morocco', 'Group C', 'Gillette Stadium', 'Boston'],
  [31, '19-Jun-26', '20:00', 'Türkiye', 'Paraguay', 'Group D', "Levi's Stadium", 'San Francisco Bay Area'],
  [32, '19-Jun-26', '12:00', 'United States', 'Australia', 'Group D', 'Lumen Field', 'Seattle'],
  [33, '20-Jun-26', '16:00', 'Germany', 'Ivory Coast', 'Group E', 'BMO Field', 'Toronto'],
  [34, '20-Jun-26', '19:00', 'Ecuador', 'Curaçao', 'Group E', 'Arrowhead Stadium', 'Kansas City'],
  [35, '20-Jun-26', '12:00', 'Netherlands', 'Sweden', 'Group F', 'NRG Stadium', 'Houston'],
  [36, '20-Jun-26', '22:00', 'Tunisia', 'Japan', 'Group F', 'Estadio BBVA', 'Monterrey'],
  [37, '21-Jun-26', '18:00', 'Uruguay', 'Cape Verde', 'Group H', 'Hard Rock Stadium', 'Miami'],
  [38, '21-Jun-26', '12:00', 'Spain', 'Saudi Arabia', 'Group H', 'Mercedes-Benz Stadium', 'Atlanta'],
  [39, '21-Jun-26', '12:00', 'Belgium', 'Iran', 'Group G', 'SoFi Stadium', 'Los Angeles'],
  [40, '21-Jun-26', '18:00', 'New Zealand', 'Egypt', 'Group G', 'BC Place', 'Vancouver'],
  [41, '22-Jun-26', '20:00', 'Norway', 'Senegal', 'Group I', 'MetLife Stadium', 'New York/New Jersey'],
  [42, '22-Jun-26', '17:00', 'France', 'Iraq', 'Group I', 'Lincoln Financial Field', 'Philadelphia'],
  [43, '22-Jun-26', '12:00', 'Argentina', 'Austria', 'Group J', 'AT&T Stadium', 'Dallas'],
  [44, '22-Jun-26', '20:00', 'Jordan', 'Algeria', 'Group J', "Levi's Stadium", 'San Francisco Bay Area'],
  [45, '23-Jun-26', '16:00', 'England', 'Ghana', 'Group L', 'Gillette Stadium', 'Boston'],
  [46, '23-Jun-26', '19:00', 'Panama', 'Croatia', 'Group L', 'BMO Field', 'Toronto'],
  [47, '23-Jun-26', '12:00', 'Portugal', 'Uzbekistan', 'Group K', 'NRG Stadium', 'Houston'],
  [48, '23-Jun-26', '20:00', 'Colombia', 'DR Congo', 'Group K', 'Estadio Akron', 'Guadalajara'],
  [49, '24-Jun-26', '18:00', 'Scotland', 'Brazil', 'Group C', 'Hard Rock Stadium', 'Miami'],
  [50, '24-Jun-26', '18:00', 'Morocco', 'Haiti', 'Group C', 'Mercedes-Benz Stadium', 'Atlanta'],
  [51, '24-Jun-26', '12:00', 'Switzerland', 'Canada', 'Group B', 'BC Place', 'Vancouver'],
  [52, '24-Jun-26', '12:00', 'Bosnia and Herzegovina', 'Qatar', 'Group B', 'Lumen Field', 'Seattle'],
  [53, '24-Jun-26', '19:00', 'Czechia', 'Mexico', 'Group A', 'Estadio Azteca', 'Mexico City'],
  [54, '24-Jun-26', '19:00', 'South Africa', 'South Korea', 'Group A', 'Estadio BBVA', 'Monterrey'],
  [55, '25-Jun-26', '16:00', 'Curaçao', 'Ivory Coast', 'Group E', 'Lincoln Financial Field', 'Philadelphia'],
  [56, '25-Jun-26', '16:00', 'Ecuador', 'Germany', 'Group E', 'MetLife Stadium', 'New York/New Jersey'],
  [57, '25-Jun-26', '18:00', 'Japan', 'Sweden', 'Group F', 'AT&T Stadium', 'Dallas'],
  [58, '25-Jun-26', '18:00', 'Tunisia', 'Netherlands', 'Group F', 'Arrowhead Stadium', 'Kansas City'],
  [59, '25-Jun-26', '19:00', 'Türkiye', 'United States', 'Group D', 'SoFi Stadium', 'Los Angeles'],
  [60, '25-Jun-26', '19:00', 'Paraguay', 'Australia', 'Group D', "Levi's Stadium", 'San Francisco Bay Area'],
  [61, '26-Jun-26', '15:00', 'Norway', 'France', 'Group I', 'Gillette Stadium', 'Boston'],
  [62, '26-Jun-26', '15:00', 'Senegal', 'Iraq', 'Group I', 'BMO Field', 'Toronto'],
  [63, '26-Jun-26', '20:00', 'Egypt', 'Iran', 'Group G', 'Lumen Field', 'Seattle'],
  [64, '26-Jun-26', '20:00', 'New Zealand', 'Belgium', 'Group G', 'BC Place', 'Vancouver'],
  [65, '26-Jun-26', '19:00', 'Cape Verde', 'Saudi Arabia', 'Group H', 'NRG Stadium', 'Houston'],
  [66, '26-Jun-26', '18:00', 'Uruguay', 'Spain', 'Group H', 'Estadio Akron', 'Guadalajara'],
  [67, '27-Jun-26', '17:00', 'Panama', 'England', 'Group L', 'MetLife Stadium', 'New York/New Jersey'],
  [68, '27-Jun-26', '17:00', 'Croatia', 'Ghana', 'Group L', 'Lincoln Financial Field', 'Philadelphia'],
  [69, '27-Jun-26', '21:00', 'Algeria', 'Austria', 'Group J', 'Arrowhead Stadium', 'Kansas City'],
  [70, '27-Jun-26', '21:00', 'Jordan', 'Argentina', 'Group J', 'AT&T Stadium', 'Dallas'],
  [71, '27-Jun-26', '19:30', 'Colombia', 'Portugal', 'Group K', 'Hard Rock Stadium', 'Miami'],
  [72, '27-Jun-26', '19:30', 'DR Congo', 'Uzbekistan', 'Group K', 'Mercedes-Benz Stadium', 'Atlanta']
];

export function getWorldCup2026OfficialFixtures() {
  return RAW_WORLD_CUP_2026_GROUP_STAGE.map(([matchNumber, date, time, homeTeam, awayTeam, group, venue, city]) => ({
    id: `m${matchNumber}`,
    matchNumber,
    homeTeam,
    awayTeam,
    date: toIsoDate(date),
    time,
    group,
    venue: venueWithCity(venue, city),
    tournament: WORLD_CUP_2026_TOURNAMENT,
    season: WORLD_CUP_2026_SEASON,
    sourceName: WORLD_CUP_2026_SOURCE.name,
    sourceUrl: WORLD_CUP_2026_SOURCE.url,
    isValidated: true
  }));
}

export function isWorldCup2026Request(tournament, season) {
  return String(tournament || '').toLowerCase().includes('world cup') && String(season || '') === WORLD_CUP_2026_SEASON;
}

export function fixtureIdentity(fixture) {
  const teams = [
    normalizeTeamName(fixture.homeTeam ?? fixture.home_team),
    normalizeTeamName(fixture.awayTeam ?? fixture.away_team)
  ].sort().join('|');
  const date = fixture.date ?? fixture.match_date;
  const tournament = fixture.tournament ?? WORLD_CUP_2026_TOURNAMENT;
  const season = fixture.season ?? WORLD_CUP_2026_SEASON;
  return `${teams}|${date}|${tournament}|${season}`;
}

export function matchNumberFromFixture(fixture) {
  const explicit = Number(fixture.matchNumber ?? fixture.match_number);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const idMatch = String(fixture.id || '').match(/^m(\d+)$/i);
  return idMatch ? Number(idMatch[1]) : null;
}

export function validateWorldCup2026Fixture(fixture) {
  const matchNumber = matchNumberFromFixture(fixture);
  const officialFixtures = getWorldCup2026OfficialFixtures();
  const official = matchNumber
    ? officialFixtures.find((item) => item.matchNumber === matchNumber)
    : officialFixtures.find((item) => fixtureIdentity(item) === fixtureIdentity(fixture));

  if (!official) {
    return { valid: false, reason: 'Fixture không tồn tại trong lịch chuẩn World Cup 2026.' };
  }

  const checks = [
    [normalizeTeamName(fixture.homeTeam ?? fixture.home_team) === normalizeTeamName(official.homeTeam), 'Đội nhà không khớp lịch chuẩn.'],
    [normalizeTeamName(fixture.awayTeam ?? fixture.away_team) === normalizeTeamName(official.awayTeam), 'Đội khách không khớp lịch chuẩn.'],
    [(fixture.date ?? fixture.match_date) === official.date, 'Ngày thi đấu không khớp lịch chuẩn.'],
    [(fixture.time ?? fixture.match_time) === official.time, 'Giờ địa phương không khớp lịch chuẩn.'],
    [(fixture.group ?? fixture.group_name) === official.group, 'Bảng đấu không khớp lịch chuẩn.']
  ];

  const failed = checks.find(([passed]) => !passed);
  if (failed) return { valid: false, reason: failed[1], official };

  return { valid: true, official };
}

export function getMissingWorldCup2026Fixtures(existingFixtures = []) {
  const existingKeys = new Set(existingFixtures.map(fixtureIdentity));
  return getWorldCup2026OfficialFixtures().filter((fixture) => !existingKeys.has(fixtureIdentity(fixture)));
}

export function mapDbFixtureToClientFixture(row) {
  return {
    id: row.id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    date: row.match_date,
    time: row.match_time,
    group: row.group_name,
    venue: row.venue,
    tournament: row.tournament,
    season: row.season,
    isTest: row.is_test === 1,
    actualHomeScore: row.actual_home_score,
    actualAwayScore: row.actual_away_score,
    actualFirstHalfScore: row.actual_first_half_home_score !== null && row.actual_first_half_away_score !== null ? {
      home: row.actual_first_half_home_score,
      away: row.actual_first_half_away_score
    } : null
  };
}
