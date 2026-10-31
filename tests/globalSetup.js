const { mkdirSync, writeFileSync } = require('fs');
const path = require('path');

const { buildFigureWorker } = require('../scripts/buildFigureWorker.js');

// Built here, in plain Node: esbuild's buildSync fails inside jsdom test environments.
module.exports = () => {
  const dir = path.join(__dirname, '../node_modules/.cache/clew');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'figure-worker.js'), buildFigureWorker());
};
