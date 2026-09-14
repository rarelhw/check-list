// 로컬 미리보기용 정적 서버 — docs/ 를 그대로 띄운다. npm run serve
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const port = Number(process.env.PORT || 8765);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(root, '.' + path);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}/`));
