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

export async function fetchRoadtripsSchedule({ tournament, season }) {
  if (!String(tournament || '').toLowerCase().includes('world cup') || String(season || '') !== '2026') {
    return {
      source: roadtripsSource,
      rawExcerpt: '',
      fixtures: []
    };
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
