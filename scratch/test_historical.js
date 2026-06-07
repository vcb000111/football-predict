const fs = require('fs');
const path = require('path');

function reconstructHistoricalStats(homeTeam, awayTeam, matchId) {
  try {
    const fixturesPath = path.join(__dirname, '../src/data/fixtures.json');
    if (!fs.existsSync(fixturesPath)) return null;
    
    const fixturesData = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
    const allFixtures = fixturesData.fixtures || [];
    
    // Tìm trận đấu hiện tại
    const currentMatch = allFixtures.find(f => f.id === matchId) || 
                         allFixtures.find(f => f.homeTeam === homeTeam && f.awayTeam === awayTeam);
                         
    if (!currentMatch) return null;
    
    const matchDate = currentMatch.date;
    console.log(`Current match: ${currentMatch.homeTeam} vs ${currentMatch.awayTeam} on ${matchDate}`);
    
    // Lọc các trận đấu đã diễn ra trước trận này (có kết quả thực tế)
    const pastMatches = allFixtures.filter(f => 
      f.date < matchDate && 
      f.actualHomeScore !== null && 
      f.actualHomeScore !== undefined
    );
    console.log(`Found ${pastMatches.length} past matches with actual results.`);
    
    const getStatsForTeam = (teamName) => {
      const teamMatches = pastMatches.filter(f => f.homeTeam === teamName || f.awayTeam === teamName);
      
      // Sắp xếp ngày giảm dần
      teamMatches.sort((a, b) => new Date(b.date) - new Date(a.date));
      console.log(`- Past matches for ${teamName}: ${teamMatches.length}`);
      
      const recentMatches = teamMatches.slice(0, 5);
      const formArray = [];
      const handicapFormArray = [];
      
      recentMatches.forEach(m => {
        const isHome = m.homeTeam === teamName;
        const goalsFor = isHome ? m.actualHomeScore : m.actualAwayScore;
        const goalsAgainst = isHome ? m.actualAwayScore : m.actualHomeScore;
        
        if (goalsFor > goalsAgainst) formArray.push('W');
        else if (goalsFor === goalsAgainst) formArray.push('D');
        else formArray.push('L');
        
        if (m.marketHandicap !== undefined && m.marketHandicap !== null) {
          const hLine = parseFloat(m.marketHandicap);
          const diff = m.actualHomeScore - m.actualAwayScore;
          const homeHandicapResult = diff + hLine;
          
          if (isHome) {
            if (homeHandicapResult > 0) handicapFormArray.push('W');
            else if (homeHandicapResult === 0) handicapFormArray.push('D');
            else handicapFormArray.push('L');
          } else {
            if (homeHandicapResult < 0) handicapFormArray.push('W');
            else if (homeHandicapResult === 0) handicapFormArray.push('D');
            else handicapFormArray.push('L');
          }
        } else {
          handicapFormArray.push('D');
        }
      });
      
      while (formArray.length < 5) formArray.push('D');
      while (handicapFormArray.length < 5) handicapFormArray.push('D');
      
      const matches10 = teamMatches.slice(0, 10);
      let totalGoalsFor = 0;
      let totalGoalsAgainst = 0;
      
      matches10.forEach(m => {
        const isHome = m.homeTeam === teamName;
        totalGoalsFor += isHome ? m.actualHomeScore : m.actualAwayScore;
        totalGoalsAgainst += isHome ? m.actualAwayScore : m.actualHomeScore;
      });
      
      const avgGoalsFor = matches10.length > 0 ? parseFloat((totalGoalsFor / matches10.length).toFixed(2)) : 1.2;
      const avgGoalsAgainst = matches10.length > 0 ? parseFloat((totalGoalsAgainst / matches10.length).toFixed(2)) : 1.2;
      
      return {
        recent_form: formArray.join(','),
        asian_handicap_form: handicapFormArray.join(','),
        avg_goals_scored: avgGoalsFor,
        avg_goals_conceded: avgGoalsAgainst
      };
    };
    
    return {
      home: getStatsForTeam(homeTeam),
      away: getStatsForTeam(awayTeam)
    };
  } catch (err) {
    console.error('Lỗi khi reconstructHistoricalStats:', err);
    return null;
  }
}

console.log('--- TEST RECONSTRUCT STATS CHO TRẬN MU vs LIVERPOOL (pl5 - 2024-09-01) ---');
const stats = reconstructHistoricalStats('Manchester United', 'Liverpool', 'pl5');
console.log('Kết quả reconstruct:', JSON.stringify(stats, null, 2));
