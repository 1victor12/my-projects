const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA = path.join(__dirname, 'kanban-app', 'data');
const BOARDS = path.join(DATA, 'boards');
const USERS_FILE = path.join(DATA, 'users.json');
const SESSIONS_FILE = path.join(DATA, 'sessions.json');

for (const d of [DATA, BOARDS]) fs.mkdirSync(d, { recursive: true });
for (const f of [USERS_FILE, SESSIONS_FILE]) if (!fs.existsSync(f)) fs.writeFileSync(f, '{}');

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));

function hash(pw, salt) {
  return crypto.scryptSync(pw, salt, 32).toString('hex');
}
function safeEqual(a, b) {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon'
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 300000) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > limit) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

function userFromToken(req) {
  const token = (req.headers['x-token'] || '').trim();
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const sess = readJson(SESSIONS_FILE)[token];
  return sess ? sess.user : null;
}

async function api(req, res, p) {
  if (req.method === 'POST' && p === '/api/register') {
    const { u, pw } = await readBody(req, 2000);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(u || '')) return json(res, 400, { error: 'Username: 3-20 letters/numbers/_ only' });
    if (typeof pw !== 'string' || pw.length < 4) return json(res, 400, { error: 'Password must be at least 4 characters' });
    const users = readJson(USERS_FILE);
    const key = u.toLowerCase();
    if (users[key]) return json(res, 409, { error: 'Username already taken' });
    const salt = crypto.randomBytes(16).toString('hex');
    users[key] = { name: u, salt, hash: hash(pw, salt), created: Date.now() };
    writeJson(USERS_FILE, users);
    const token = crypto.randomBytes(32).toString('hex');
    const sess = readJson(SESSIONS_FILE);
    sess[token] = { user: key, created: Date.now() };
    writeJson(SESSIONS_FILE, sess);
    return json(res, 200, { token, user: u });
  }

  if (req.method === 'POST' && p === '/api/login') {
    const { u, pw } = await readBody(req, 2000);
    const users = readJson(USERS_FILE);
    const rec = users[(u || '').toLowerCase()];
    if (!rec) return json(res, 401, { error: 'Wrong username or password' });
    if (!safeEqual(hash(pw || '', rec.salt), rec.hash)) return json(res, 401, { error: 'Wrong username or password' });
    const token = crypto.randomBytes(32).toString('hex');
    const sess = readJson(SESSIONS_FILE);
    sess[token] = { user: rec.name.toLowerCase(), created: Date.now() };
    writeJson(SESSIONS_FILE, sess);
    return json(res, 200, { token, user: rec.name });
  }

  const user = userFromToken(req);

  if (p === '/api/me') {
    if (!user) return json(res, 401, { error: 'Not logged in' });
    return json(res, 200, { user });
  }

  if (p === '/api/board') {
    if (!user) return json(res, 401, { error: 'Not logged in' });
    const file = path.join(BOARDS, user.replace(/[^a-z0-9_]/gi, '_') + '.json');
    if (req.method === 'GET') {
      try { return json(res, 200, JSON.parse(fs.readFileSync(file, 'utf8'))); }
      catch { return json(res, 200, null); }
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      for (const col of ['todo', 'doing', 'done']) {
        if (!Array.isArray(body[col])) return json(res, 400, { error: 'bad board' });
        for (const c of body[col]) {
          if (typeof c.id !== 'string' || typeof c.text !== 'string') return json(res, 400, { error: 'bad card' });
        }
      }
      writeJson(file, { todo: body.todo.slice(0, 200), doing: body.doing.slice(0, 200), done: body.done.slice(0, 200) });
      return json(res, 200, { ok: true });
    }
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const handled = await api(req, res, p);
    if (handled !== false) return;
  } catch (e) {
    return json(res, 500, { error: e.message });
  }

  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(8123, () => console.log('FlowBoard server -> http://localhost:8123'));
