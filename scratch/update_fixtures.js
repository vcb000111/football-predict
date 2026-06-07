const fs = require('fs');
const path = require('path');

const fixturesPath = path.join(__dirname, '..', 'src', 'data', 'fixtures.json');
const fileContent = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

// 1. Cập nhật tournament cho fixtures cũ
fileContent.fixtures = fileContent.fixtures.map(f => {
  if (!f.tournament) {
    if (f.id.startsWith('m')) {
      f.tournament = 'World Cup 2026';
    } else if (f.id.startsWith('t')) {
      f.tournament = 'Warm-up Friendly';
    } else {
      f.tournament = 'Friendly';
    }
  }
  return f;
});

// 2. Định nghĩa danh sách 51 trận đấu Euro 2024 thực tế
const euroFixtures = [
  { id: "e1", homeTeam: "Germany", awayTeam: "Scotland", date: "2024-06-14", time: "21:00", group: "Group A", venue: "Munich Football Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 5, actualAwayScore: 1 },
  { id: "e2", homeTeam: "Hungary", awayTeam: "Switzerland", date: "2024-06-15", time: "15:00", group: "Group A", venue: "Cologne Stadium", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 3 },
  { id: "e3", homeTeam: "Spain", awayTeam: "Croatia", date: "2024-06-15", time: "18:00", group: "Group B", venue: "Olympiastadion Berlin", tournament: "Euro 2024", isTest: true, actualHomeScore: 3, actualAwayScore: 0 },
  { id: "e4", homeTeam: "Italy", awayTeam: "Albania", date: "2024-06-15", time: "21:00", group: "Group B", venue: "BVB Stadion Dortmund", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 1 },
  { id: "e5", homeTeam: "Poland", awayTeam: "Netherlands", date: "2024-06-16", time: "15:00", group: "Group D", venue: "Volksparkstadion Hamburg", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 2 },
  { id: "e6", homeTeam: "Slovenia", awayTeam: "Denmark", date: "2024-06-16", time: "18:00", group: "Group C", venue: "Stuttgart Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 1 },
  { id: "e7", homeTeam: "Serbia", awayTeam: "England", date: "2024-06-16", time: "21:00", group: "Group C", venue: "Arena AufSchalke Gelsenkirchen", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 1 },
  { id: "e8", homeTeam: "Romania", awayTeam: "Ukraine", date: "2024-06-17", time: "15:00", group: "Group E", venue: "Munich Football Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 3, actualAwayScore: 0 },
  { id: "e9", homeTeam: "Belgium", awayTeam: "Slovakia", date: "2024-06-17", time: "18:00", group: "Group E", venue: "Frankfurt Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 1 },
  { id: "e10", homeTeam: "Austria", awayTeam: "France", date: "2024-06-17", time: "21:00", group: "Group D", venue: "Düsseldorf Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 1 },
  { id: "e11", homeTeam: "Turkey", awayTeam: "Georgia", date: "2024-06-18", time: "18:00", group: "Group F", venue: "BVB Stadion Dortmund", tournament: "Euro 2024", isTest: true, actualHomeScore: 3, actualAwayScore: 1 },
  { id: "e12", homeTeam: "Portugal", awayTeam: "Czechia", date: "2024-06-18", time: "21:00", group: "Group F", venue: "Leipzig Stadium", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 1 },
  { id: "e13", homeTeam: "Croatia", awayTeam: "Albania", date: "2024-06-19", time: "15:00", group: "Group B", venue: "Volksparkstadion Hamburg", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 2 },
  { id: "e14", homeTeam: "Germany", awayTeam: "Hungary", date: "2024-06-19", time: "18:00", group: "Group A", venue: "Stuttgart Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 0 },
  { id: "e15", homeTeam: "Scotland", awayTeam: "Switzerland", date: "2024-06-19", time: "21:00", group: "Group A", venue: "Cologne Stadium", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 1 },
  { id: "e16", homeTeam: "Slovenia", awayTeam: "Serbia", date: "2024-06-20", time: "15:00", group: "Group C", venue: "Munich Football Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 1 },
  { id: "e17", homeTeam: "Denmark", awayTeam: "England", date: "2024-06-20", time: "18:00", group: "Group C", venue: "Frankfurt Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 1 },
  { id: "e18", homeTeam: "Spain", awayTeam: "Italy", date: "2024-06-20", time: "21:00", group: "Group B", venue: "Arena AufSchalke Gelsenkirchen", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 0 },
  { id: "e19", homeTeam: "Slovakia", awayTeam: "Ukraine", date: "2024-06-21", time: "15:00", group: "Group E", venue: "Düsseldorf Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 2 },
  { id: "e20", homeTeam: "Poland", awayTeam: "Austria", date: "2024-06-21", time: "18:00", group: "Group D", venue: "Olympiastadion Berlin", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 3 },
  { id: "e21", homeTeam: "Netherlands", awayTeam: "France", date: "2024-06-21", time: "21:00", group: "Group D", venue: "Leipzig Stadium", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 0 },
  { id: "e22", homeTeam: "Georgia", awayTeam: "Czechia", date: "2024-06-22", time: "15:00", group: "Group F", venue: "Volksparkstadion Hamburg", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 1 },
  { id: "e23", homeTeam: "Turkey", awayTeam: "Portugal", date: "2024-06-22", time: "18:00", group: "Group F", venue: "BVB Stadion Dortmund", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 3 },
  { id: "e24", homeTeam: "Belgium", awayTeam: "Romania", date: "2024-06-22", time: "21:00", group: "Group E", venue: "Cologne Stadium", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 0 },
  { id: "e25", homeTeam: "Switzerland", awayTeam: "Germany", date: "2024-06-23", time: "21:00", group: "Group A", venue: "Frankfurt Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 1 },
  { id: "e26", homeTeam: "Scotland", awayTeam: "Hungary", date: "2024-06-23", time: "21:00", group: "Group A", venue: "Stuttgart Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 1 },
  { id: "e27", homeTeam: "Albania", awayTeam: "Spain", date: "2024-06-24", time: "21:00", group: "Group B", venue: "Düsseldorf Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 1 },
  { id: "e28", homeTeam: "Croatia", awayTeam: "Italy", date: "2024-06-24", time: "21:00", group: "Group B", venue: "Leipzig Stadium", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 1 },
  { id: "e29", homeTeam: "Netherlands", awayTeam: "Austria", date: "2024-06-25", time: "18:00", group: "Group D", venue: "Olympiastadion Berlin", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 3 },
  { id: "e30", homeTeam: "France", awayTeam: "Poland", date: "2024-06-25", time: "18:00", group: "Group D", venue: "BVB Stadion Dortmund", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 1 },
  { id: "e31", homeTeam: "England", awayTeam: "Slovenia", date: "2024-06-25", time: "21:00", group: "Group C", venue: "Cologne Stadium", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 0 },
  { id: "e32", homeTeam: "Denmark", awayTeam: "Serbia", date: "2024-06-25", time: "21:00", group: "Group C", venue: "Munich Football Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 0 },
  { id: "e33", homeTeam: "Slovakia", awayTeam: "Romania", date: "2024-06-26", time: "18:00", group: "Group E", venue: "Frankfurt Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 1 },
  { id: "e34", homeTeam: "Ukraine", awayTeam: "Belgium", date: "2024-06-26", time: "18:00", group: "Group E", venue: "Stuttgart Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 0 },
  { id: "e35", homeTeam: "Georgia", awayTeam: "Portugal", date: "2024-06-26", time: "21:00", group: "Group F", venue: "Arena AufSchalke Gelsenkirchen", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 0 },
  { id: "e36", homeTeam: "Czechia", awayTeam: "Turkey", date: "2024-06-26", time: "21:00", group: "Group F", venue: "Volksparkstadion Hamburg", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 2 },
  { id: "e37", homeTeam: "Switzerland", awayTeam: "Italy", date: "2024-06-29", time: "18:00", group: "Round of 16", venue: "Olympiastadion Berlin", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 0 },
  { id: "e38", homeTeam: "Germany", awayTeam: "Denmark", date: "2024-06-29", time: "21:00", group: "Round of 16", venue: "BVB Stadion Dortmund", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 0 },
  { id: "e39", homeTeam: "England", awayTeam: "Slovakia", date: "2024-06-30", time: "18:00", group: "Round of 16", venue: "Arena AufSchalke Gelsenkirchen", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 1 },
  { id: "e40", homeTeam: "Spain", awayTeam: "Georgia", date: "2024-06-30", time: "21:00", group: "Round of 16", venue: "Cologne Stadium", tournament: "Euro 2024", isTest: true, actualHomeScore: 4, actualAwayScore: 1 },
  { id: "e41", homeTeam: "France", awayTeam: "Belgium", date: "2024-07-01", time: "18:00", group: "Round of 16", venue: "Düsseldorf Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 0 },
  { id: "e42", homeTeam: "Portugal", awayTeam: "Slovenia", date: "2024-07-01", time: "21:00", group: "Round of 16", venue: "Frankfurt Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 0 },
  { id: "e43", homeTeam: "Romania", awayTeam: "Netherlands", date: "2024-07-02", time: "18:00", group: "Round of 16", venue: "Munich Football Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 3 },
  { id: "e44", homeTeam: "Austria", awayTeam: "Turkey", date: "2024-07-02", time: "21:00", group: "Round of 16", venue: "Leipzig Stadium", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 2 },
  { id: "e45", homeTeam: "Spain", awayTeam: "Germany", date: "2024-07-05", time: "18:00", group: "Quarter-finals", venue: "Stuttgart Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 1 },
  { id: "e46", homeTeam: "Portugal", awayTeam: "France", date: "2024-07-05", time: "21:00", group: "Quarter-finals", venue: "Volksparkstadion Hamburg", tournament: "Euro 2024", isTest: true, actualHomeScore: 0, actualAwayScore: 0 },
  { id: "e47", homeTeam: "England", awayTeam: "Switzerland", date: "2024-07-06", time: "18:00", group: "Quarter-finals", venue: "Düsseldorf Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 1 },
  { id: "e48", homeTeam: "Netherlands", awayTeam: "Turkey", date: "2024-07-06", time: "21:00", group: "Quarter-finals", venue: "Olympiastadion Berlin", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 1 },
  { id: "e49", homeTeam: "Spain", awayTeam: "France", date: "2024-07-09", time: "21:00", group: "Semi-finals", venue: "Munich Football Arena", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 1 },
  { id: "e50", homeTeam: "Netherlands", awayTeam: "England", date: "2024-07-10", time: "21:00", group: "Semi-finals", venue: "BVB Stadion Dortmund", tournament: "Euro 2024", isTest: true, actualHomeScore: 1, actualAwayScore: 2 },
  { id: "e51", homeTeam: "Spain", awayTeam: "England", date: "2024-07-14", time: "21:00", group: "Final", venue: "Olympiastadion Berlin", tournament: "Euro 2024", isTest: true, actualHomeScore: 2, actualAwayScore: 1 }
];

fileContent.fixtures.push(...euroFixtures);

fs.writeFileSync(fixturesPath, JSON.stringify(fileContent, null, 2), 'utf8');
console.log('✅ Cập nhật fixtures.json thành công!');
