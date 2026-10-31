const esbuild = require('esbuild');
const path = require('path');

/** The figure worker as one script, for the sandbox to start from a blob URL. */
function buildFigureWorker() {
  return esbuild.buildSync({
    entryPoints: ['src/renderer/figure/workerMain.ts'],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    minify: true,
    write: false,
    platform: 'browser',
    absWorkingDir: path.resolve(__dirname, '..'),
  }).outputFiles[0].text;
}

module.exports = { buildFigureWorker };
