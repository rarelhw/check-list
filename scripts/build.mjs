import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'src');
const docs = resolve(root, 'docs');
const SITE = 'https://rarelhw.github.io/check-list/';

const PAGES = [
  {
    file: 'index.html',
    data: 'data/requirements.json',
    nav: '컴퓨터교육',
    title: '교직이수 체크리스트',
    desc: '숙명여대 교육대학원 컴퓨터교육전공 · 들은 수업을 체크하면 남은 과목과 조건을 영역별로 알려줍니다.',
  },
  {
    file: 'psychology.html',
    data: 'data/requirements-psychology.json',
    nav: '상담교육',
    title: '교직이수 체크리스트 — 상담교육전공',
    desc: '숙명여대 교육대학원 상담교육전공(전문상담교사 2급) · 들은 수업을 체크하면 남은 과목과 조건을 영역별로 알려줍니다.',
  },
];

const read = (p) => readFile(resolve(src, p), 'utf8');

// </script> 가 인라인 문자열 안에 있으면 HTML 파서가 스크립트를 조기 종료시킨다.
const escapeForScript = (text) => text.replace(/<\/(script)/gi, '<\\/$1');

const template = await read('index.html');
const css = await read('styles.css');
const js = await read('app.js');

const nav = (current) =>
  `<nav class="tabs">${PAGES.map(
    (p) => `<a href="./${p.file}"${p.file === current ? ' class="on" aria-current="page"' : ''}>${p.nav}</a>`,
  ).join('')}</nav>`;

await mkdir(docs, { recursive: true });

for (const page of PAGES) {
  const data = JSON.parse(await read(page.data));

  let output = template
    .replace(
      /<link\s+rel="stylesheet"\s+href="\.\/styles\.css"\s*\/?>/,
      `<style>\n${css.trim()}\n</style>`,
    )
    .replace(
      /<script id="requirements-data" type="application\/json">\s*<\/script>/,
      `<script id="requirements-data" type="application/json">\n${escapeForScript(JSON.stringify(data))}\n</script>`,
    )
    .replace(/<script src="\.\/app\.js"><\/script>/, `<script>\n${escapeForScript(js.trim())}\n</script>`)
    .replaceAll('__PAGE_TITLE__', page.title)
    .replaceAll('__PAGE_DESC__', page.desc)
    .replaceAll('__PAGE_URL__', SITE + (page.file === 'index.html' ? '' : page.file))
    .replace('__NAV__', nav(page.file))
    .replace('__BUILT_AT__', new Date().toISOString().slice(0, 10));

  // 인라인 대상이 남아 있으면 치환이 실패한 것이다 (내용이 아니라 참조 여부로 검증)
  for (const [label, leftover] of [
    ['styles.css', 'href="./styles.css"'],
    ['app.js', 'src="./app.js"'],
    ['치환되지 않은 플레이스홀더', '__PAGE_'],
  ]) {
    if (output.includes(leftover)) throw new Error(`${page.file} 인라인 실패: ${label}`);
  }
  if (!/<script id="requirements-data" type="application\/json">\s*\S/.test(output)) {
    throw new Error(`${page.file} 인라인 실패: ${page.data}`);
  }

  await writeFile(resolve(docs, page.file), output, 'utf8');
  console.log(`docs/${page.file} 생성 (${(output.length / 1024).toFixed(1)}KB)`);
}

// OG 이미지는 인라인할 수 없으므로 파일로 복사한다 (크롤러가 절대 URL로 받아감)
await copyFile(resolve(src, 'og.png'), resolve(docs, 'og.png'));
console.log('docs/og.png 복사');
