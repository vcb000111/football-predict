import { fixtureIdentity, normalizeTeamName } from '@/lib/schedule/normalizer';

function canonicalRowToFixture(row) {
  if (!row) return null;
  return {
    id: row.id,
    tournament: row.tournament,
    season: row.season,
    matchNumber: row.match_number,
    stage: row.stage,
    group: row.group_name,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    date: row.match_date,
    time: row.match_time,
    venue: row.venue,
    city: row.city,
    status: row.status,
    confidence: row.confidence,
    sourceKey: row.source_key,
    sourceUrl: row.source_url,
    sourceHash: row.source_hash
  };
}

function isFixtureChanged(candidate, canonical) {
  if (!canonical) return true;
  const fields = ['stage', 'group', 'homeTeam', 'awayTeam', 'date', 'time', 'venue', 'city', 'status'];
  return fields.some((field) => (candidate[field] || '') !== (canonical[field] || ''));
}

export function validateFixtureCandidate(candidate, canonicalRows = []) {
  const requiredFields = ['matchNumber', 'homeTeam', 'awayTeam', 'date', 'time', 'venue', 'tournament', 'season'];
  const missingField = requiredFields.find((field) => candidate[field] === null || candidate[field] === undefined || candidate[field] === '');
  if (missingField) {
    return {
      validationStatus: 'rejected',
      validationReason: `Thiếu trường bắt buộc: ${missingField}.`,
      diffType: 'rejected'
    };
  }

  if (normalizeTeamName(candidate.homeTeam) === normalizeTeamName(candidate.awayTeam)) {
    return {
      validationStatus: 'rejected',
      validationReason: 'Đội nhà và đội khách trùng nhau.',
      diffType: 'rejected'
    };
  }

  const canonicalByMatchNumber = canonicalRows.find((row) => Number(row.match_number) === Number(candidate.matchNumber));
  const canonicalByIdentity = canonicalRows.find((row) => fixtureIdentity(canonicalRowToFixture(row)) === fixtureIdentity(candidate));
  const canonical = canonicalByMatchNumber || canonicalByIdentity;

  if (!canonical) {
    return {
      validationStatus: candidate.confidence >= 0.8 ? 'valid' : 'manual_review',
      validationReason: '',
      diffType: 'added'
    };
  }

  if (canonicalByMatchNumber) {
    const sameTeams =
      normalizeTeamName(candidate.homeTeam) === normalizeTeamName(canonicalByMatchNumber.home_team) &&
      normalizeTeamName(candidate.awayTeam) === normalizeTeamName(canonicalByMatchNumber.away_team);
    if (!sameTeams && candidate.stage === 'Group stage') {
      return {
        validationStatus: 'manual_review',
        validationReason: 'Match number đã tồn tại nhưng cặp đội thay đổi, cần rà soát.',
        diffType: 'updated'
      };
    }
  }

  return {
    validationStatus: candidate.confidence >= 0.7 ? 'valid' : 'manual_review',
    validationReason: '',
    diffType: isFixtureChanged(candidate, canonicalRowToFixture(canonical)) ? 'updated' : 'unchanged'
  };
}

export function candidateToPreview(candidate) {
  return {
    id: candidate.id,
    syncRunId: candidate.syncRunId,
    candidateId: candidate.id,
    matchNumber: candidate.payload.matchNumber,
    stage: candidate.payload.stage,
    group: candidate.payload.group,
    homeTeam: candidate.payload.homeTeam,
    awayTeam: candidate.payload.awayTeam,
    date: candidate.payload.date,
    time: candidate.payload.time,
    venue: candidate.payload.venue,
    tournament: candidate.payload.tournament,
    season: candidate.payload.season,
    sourceName: candidate.payload.sourceName,
    sourceUrl: candidate.payload.sourceUrl,
    confidence: candidate.confidence,
    diffType: candidate.diffType,
    validationStatus: candidate.validationStatus,
    validationReason: candidate.validationReason,
    isValidated: candidate.validationStatus === 'valid' && candidate.diffType !== 'rejected'
  };
}
