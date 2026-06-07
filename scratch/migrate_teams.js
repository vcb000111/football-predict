const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function runMigration() {
  const dbPath = path.join(__dirname, '../worldcup_predictions.db');
  console.log(`Connecting to database at: ${dbPath}`);
  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Lấy thông tin các cột hiện tại của bảng teams
  const columnsInfo = await db.all("PRAGMA table_info(teams)");
  const columnNames = columnsInfo.map(col => col.name);
  console.log('Current columns in teams table:', columnNames);

  const newColumns = [
    { name: 'avg_corners_won', type: 'REAL DEFAULT 4.5' },
    { name: 'avg_corners_conceded', type: 'REAL DEFAULT 4.5' },
    { name: 'asian_handicap_form', type: "TEXT DEFAULT 'D,D,D,D,D'" },
    { name: 'play_style', type: "TEXT DEFAULT 'mixed'" }
  ];

  for (const col of newColumns) {
    if (!columnNames.includes(col.name)) {
      console.log(`Adding column: ${col.name} (${col.type})`);
      await db.exec(`ALTER TABLE teams ADD COLUMN ${col.name} ${col.type}`);
    } else {
      console.log(`Column ${col.name} already exists.`);
    }
  }

  console.log('Migration completed successfully.');
  await db.close();
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
