import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/src', { recursive: true });
await cp('index.html', 'dist/index.html');
await cp('favicon.png', 'dist/favicon.png');
await cp('src/app.mjs', 'dist/src/app.mjs');
await cp('src/saveParser.mjs', 'dist/src/saveParser.mjs');
await cp('src/styles.css', 'dist/src/styles.css');

console.log('Built static site in dist');
