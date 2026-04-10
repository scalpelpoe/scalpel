const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://raw.githubusercontent.com/deathbeam/maps-of-exile/master/site/src/data/';
const OUT_DIR = path.join(__dirname, '..', 'src', 'renderer', 'src', 'data');

const FILES = [
  { remote: 'cards.json', local: 'div-cards.json' },
  { remote: 'maps.json', local: 'div-maps.json' },
  { remote: 'globals.json', local: 'div-globals.json' },
];

async function downloadFile(remote, local) {
  const url = BASE_URL + remote;
  const outPath = path.join(OUT_DIR, local);
  console.log(`Fetching ${url} ...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  fs.writeFileSync(outPath, text, 'utf-8');
  console.log(`  Saved to ${local} (${(text.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  console.log(`Output directory: ${OUT_DIR}\n`);

  let failures = 0;
  for (const { remote, local } of FILES) {
    try {
      await downloadFile(remote, local);
    } catch (err) {
      console.error(`  FAILED ${remote}: ${err.message}`);
      failures++;
    }
  }

  console.log('');
  if (failures > 0) {
    console.error(`Done with ${failures} failure(s).`);
    process.exit(1);
  } else {
    console.log('All files updated successfully.');
  }
}

main();
