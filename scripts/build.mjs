import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'src');
const out = resolve(root, 'docs/index.html');

const read = (p) => readFile(resolve(src, p), 'utf8');

// </script> 가 인라인 문자열 안에 있으면 HTML 파서가 스크립트를 조기 종료시킨다.
const escapeForScript = (text) => text.replace(/<\/(script)/gi, '<\\/$1');

const html = await read('index.html');
const css = await read('styles.css');
const js = await read('app.js');
const data = JSON.parse(await read('data/requirements.json'));

let output = html
  .replace(
    /<link\s+rel="stylesheet"\s+href="\.\/styles\.css"\s*\/?>/,
    `<style>\n${css.trim()}\n</style>`,
  )
  .replace(
    /<script id="requirements-data" type="application\/json">\s*<\/script>/,
    `<script id="requirements-data" type="application/json">\n${escapeForScript(JSON.stringify(data))}\n</script>`,
  )
  .replace(
    /<script src="\.\/app\.js"><\/script>/,
    `<script>\n${escapeForScript(js.trim())}\n</script>`,
  );

for (const [label, pattern] of [
  ['styles.css', '<style>'],
  ['requirements.json', '"sections"'],
  ['app.js', 'STORAGE_KEY'],
]) {
  if (!output.includes(pattern)) throw new Error(`인라인 실패: ${label}`);
}

output = output.replace('__BUILT_AT__', new Date().toISOString().slice(0, 10));

await mkdir(dirname(out), { recursive: true });
await writeFile(out, output, 'utf8');
console.log(`docs/index.html 생성 (${(output.length / 1024).toFixed(1)}KB)`);
