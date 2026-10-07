import { build } from 'esbuild';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';

const result = await build({
  bundle: true,
  entryPoints: ['src/app.js'],
  format: 'iife',
  minify: true,
  platform: 'browser',
  target: ['es2020'],
  write: false,
});
const [template, css] = await Promise.all([readFile('src/index.html', 'utf8'), readFile('src/style.css', 'utf8')]);
const js = result.outputFiles[0].text;
const html = template
  .replace('<style>/* INLINE_CSS */</style>', '<link rel="stylesheet" href="miniplan.css">')
  .replace('<script>/* INLINE_JS */</script>', '<script src="miniplan.js"></script>');
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await Promise.all([
  writeFile('dist/index.html', html),
  writeFile('dist/miniplan.html', html),
  writeFile('dist/miniplan.css', css),
  writeFile('dist/miniplan.js', js),
]);
console.log('dist/index.html und dist/miniplan.html erstellt');
