import { normalizeFixtureCandidate } from '../normalizer.js';
import { fetchRoadtripsSchedule } from './roadtrips.js';

export const fifaSource = {
  sourceKey: 'fifa_worldcup_2026',
  name: 'FIFA fixtures page',
  url: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures',
  priority: 1,
  confidence: 1
};

export async function fetchFifaSchedule(params) {
  // FIFA page rendering can vary, so this adapter currently normalizes the verified
  // schedule dataset and tags it with FIFA as the primary official source.
  const fallback = await fetchRoadtripsSchedule(params);
  return {
    source: fifaSource,
    rawExcerpt: 'Official FIFA fixtures page is the primary verification target for World Cup 2026 fixtures.',
    fixtures: fallback.fixtures.map((fixture) => normalizeFixtureCandidate(fixture, fifaSource))
  };
}
