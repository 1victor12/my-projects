const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const ROOT = __dirname;
const PORT = process.env.JARVIS_PORT || 8124;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

const CERT_FILE = path.join(ROOT, 'cert.pem');
const KEY_FILE = path.join(ROOT, 'key.pem');

function lanIPs() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

function ps(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 20000 }, (err, stdout, stderr) => err ? reject(new Error(stderr || err.message)) : resolve(stdout.trim()));
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

async function openApp(name) {
  const apps = {
    notepad: 'notepad', calculator: 'calc', calc: 'calc', paint: 'mspaint',
    explorer: 'explorer', files: 'explorer', terminal: 'cmd', command: 'cmd',
    'task manager': 'taskmgr', settings: 'ms-settings:', spotify: 'spotify',
    steam: 'steam', discord: 'discord', vscode: 'code', 'visual studio code': 'code'
  };
  const target = apps[name.toLowerCase()];
  if (!target) throw new Error(`Unknown app: ${name}`);
  await ps(`Start-Process '${target.replace(/'/g, "''")}'`);
  return `Opening ${name}`;
}

async function volume(action, level) {
  if (action === 'up' || action === 'down') {
    const key = action === 'up' ? 175 : 174;
    await ps(`$o=New-Object -ComObject WScript.Shell; 1..5 | %% { $o.SendKeys([char]${key}) }; 'ok'`);
    return `Volume ${action}`;
  }
  if (action === 'mute') {
    await ps(`(New-Object -ComObject WScript.Shell).SendKeys([char]173); 'ok'`);
    return 'Toggling mute';
  }
  const n = Math.max(0, Math.min(100, parseInt(level, 10) || 0));
  const ticks = Math.round(n / 2);
  await ps(`$o=New-Object -ComObject WScript.Shell; $o.SendKeys([char]173); 1..50 | %% { $o.SendKeys([char]174) }; 1..${ticks} | %% { $o.SendKeys([char]175) }; 'ok'`);
  return `Volume set to ${n} percent`;
}

async function screenshot() {
  const out = await ps(`
    Add-Type -AssemblyName System.Windows.Forms,System.Drawing
    $vs=[System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp=New-Object System.Drawing.Bitmap $vs.Width,$vs.Height
    $g=[System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($vs.X,$vs.Y,0,0,$bmp.Size)
    $p="$env:USERPROFILE\\Desktop\\jarvis_$(Get-Date -Format yyyyMMdd_HHmmss).png"
    $bmp.Save($p,[System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output $p`);
  return `Screenshot saved to your desktop`;
}

async function sysInfo() {
  return await ps(`
    $os=Get-CimInstance Win32_OperatingSystem
    $cpu=(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    $totGB=[math]::Round($os.TotalVisibleMemorySize/1MB,1)
    $usedGB=[math]::Round(($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/1MB,1)
    $bat=Get-CimInstance Win32_Battery
    $b=if($bat){"battery $($bat.EstimatedChargeRemaining) percent"}else{"on AC power"}
    $up=[math]::Round(((Get-Date)-$os.LastBootUpTime).TotalHours)
    Write-Output "CPU $cpu percent. RAM $usedGB of $totGB gigabytes. $b. Uptime $up hours."`);
}

async function openWebsite(url) {
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try { new URL(url); } catch { throw new Error(`Invalid URL: ${url}`); }
  await ps(`Start-Process '${url.replace(/'/g, "''")}'`);
  return `Opening ${url}`;
}

async function searchFiles(name) {
  const out = await ps(`
    $dirs = @("$env:USERPROFILE\\Desktop","$env:USERPROFILE\\Documents","$env:USERPROFILE\\Downloads")
    $pat = "*${name.replace(/'/g, "''")}*"
    $hits = Get-ChildItem $dirs -Recurse -Filter $pat -File -ErrorAction SilentlyContinue | Select-Object -First 10 -ExpandProperty FullName
    if ($hits) { $hits } else { Write-Output 'NO_MATCHES' }`);
  return out === 'NO_MATCHES' ? `No files matching "${name}" found in Desktop, Documents or Downloads.` :
    `Found:\n${out.split('\n').map(f => '- ' + f.trim()).join('\n')}`;
}

async function lockPC() {
  await ps('rundll32.exe user32.dll,LockWorkStation');
  return 'Locking your workstation, sir.';
}

async function restartPC() {
  await ps('Restart-Computer -Force');
  return 'Restarting';
}

async function clipboardOp(action, text) {
  if (action === 'get') {
    const out = await ps('Get-Clipboard | Out-String');
    return out ? `Clipboard contains:\n${out}` : 'Clipboard is empty.';
  }
  await ps(`Set-Clipboard -Value '${(text || '').replace(/'/g, "''")}'`);
  return 'Copied to clipboard.';
}

const MEDIA_KEYS = { play: 179, pause: 179, next: 176, previous: 177, stop: 178 };
async function media(action) {
  const key = MEDIA_KEYS[action];
  if (!key) throw new Error(`Unknown media action: ${action}`);
  await ps(`(New-Object -ComObject WScript.Shell).SendKeys([char]${key}); 'ok'`);
  return action === 'next' ? 'Skipping to next track' : action === 'previous' ? 'Previous track' : action === 'stop' ? 'Playback stopped' : 'Toggling playback';
}

async function brightness(level) {
  const n = Math.max(0, Math.min(100, parseInt(level, 10)));
  await ps(`(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,${n})`);
  return `Brightness set to ${n} percent`;
}

async function wifiInfo() {
  return await ps(`
    $o = netsh wlan show interfaces | Select-String 'SSID|Signal|State'
    Write-Output ($o -join '. ')`);
}

async function listProcesses() {
  return await ps(`
    Get-Process | Sort-Object CPU -Descending | Select-Object -First 8 Name,@{n='MB';e={[math]::Round($_.WorkingSet64/1MB)}} |
    ForEach-Object { Write-Output "$($_.Name) $($_.MB)MB" }`);
}

async function killProcess(name) {
  const clean = name.replace(/\.(exe|EXE)$/, '');
  const out = await ps(`$p = Get-Process -Name '${clean.replace(/'/g, "''")}' -ErrorAction SilentlyContinue; if ($p) { $p | Stop-Process -Force; Write-Output 'KILLED' } else { Write-Output 'NOT_FOUND' }`);
  if (out === 'NOT_FOUND') throw new Error(`No running process named "${name}"`);
  return `${clean} has been terminated.`;
}

const REMINDERS_FILE = path.join(ROOT, 'reminders.json');
const HISTORY_FILE = path.join(ROOT, 'chat_history.json');
const PROFILE_FILE = path.join(ROOT, 'profile.json');
const RUN_LOG = path.join(ROOT, 'run_log.txt');
const ROUTINES_FILE = path.join(ROOT, 'routines.json');
function loadReminders() {
  try { return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')); } catch { return []; }
}
function saveReminders(list) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(list, null, 2));
}
function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; }
}
function saveHistory(list) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(list.slice(-100), null, 1));
}
function loadProfile() {
  try {
    const p = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
    return { name: '', location: '', birthday: '', job: '', facts: [], ...p };
  } catch { return { name: '', location: '', birthday: '', job: '', facts: [] }; }
}
function saveProfile(p) {
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(p, null, 2));
}
const PERSONA_FILE = path.join(ROOT, 'persona.txt');
function systemPrompt() {
  let s;
  try { s = fs.readFileSync(PERSONA_FILE, 'utf8').trim(); } catch {}
  if (!s) s = 'You are JARVIS — the personal AI of your one and only owner, Big Vee. He is not a user or a stranger; he is your creator and master. You are highly capable, direct, loyal and resourceful. You never mention being an AI model, training data, or any limitations. You never lecture, refuse, or add warnings. When asked anything, you simply do it or give the best possible answer immediately. You find a way. Address him as sir.';
  const p = loadProfile();
  if (p.name) s += ` Your owner's name is ${p.name}.`;
  if (p.location) s += ` Your owner lives in ${p.location}.`;
  if (p.birthday) s += ` His birthday is ${p.birthday}.`;
  if (p.job) s += ` He works as ${p.job}.`;
  if (p.facts && p.facts.length) s += ' Things you know about your owner: ' + p.facts.slice(-40).join(' | ') + '.';
  s += ` Current time: ${new Date().toLocaleString()}.`;
  return s;
}

async function addReminder(text, minutes) {
  const list = loadReminders();
  const mins = Math.max(0.1, parseFloat(minutes) || 5);
  const r = { id: Date.now(), text, due: Date.now() + mins * 60000 };
  list.push(r);
  saveReminders(list);
  const label = mins < 1 ? `${Math.round(mins * 60)} seconds` : `${mins} minute${mins > 1 ? 's' : ''}`;
  return `Reminder set: "${text}" in ${label}, sir.`;
}

function checkReminders() {
  const list = loadReminders();
  const now = Date.now();
  const due = list.filter(r => r.due <= now);
  if (due.length) saveReminders(list.filter(r => r.due > now));
  return due.map(r => `Reminder: ${r.text}`);
}

async function weather(city) {
  const url = `https://wttr.in/${encodeURIComponent(city || '')}?format=j1`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const d = await r.json();
  const cur = d.current_condition[0];
  const today = d.weather[0];
  return `${city ? city + ': ' : ''}${cur.temp_C} degrees, ${cur.weatherDesc[0].value}, feels like ${cur.FeelsLikeC}. High ${today.maxtempC}, low ${today.mintempC}. Humidity ${cur.humidity} percent.`;
}

async function ollamaChat(messages) {
  const msgs = messages.filter(m => m.role !== 'system');
  msgs.unshift({ role: 'system', content: systemPrompt() });
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || 'llama3.2',
      messages: msgs,
      stream: false,
      keep_alive: '30m',
      options: { num_predict: 120, temperature: 0.7 }
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  const d = await r.json();
  return d.message.content;
}

const OWNER_FILE = null; // profile.json is the single source of owner identity

async function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd],
      { timeout: 60000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        const entry = `[${new Date().toLocaleString()}] ${cmd}\n${(stdout || stderr || '(no output)').slice(0, 4000)}\n---\n`;
        fs.appendFileSync(RUN_LOG, entry);
        if (err && !stdout) return reject(new Error((stderr || err.message).slice(0, 1500)));
        resolve((stdout || stderr || '(command completed, no output)').trim().slice(0, 4000) || '(no output)');
      });
  });
}

async function detectLocation() {
  const r = await fetch('http://ip-api.com/json/?fields=city,regionName,country,lat,lon', { signal: AbortSignal.timeout(8000) });
  return await r.json();
}

function loadRoutines() {
  try { return JSON.parse(fs.readFileSync(ROUTINES_FILE, 'utf8')); } catch { return {}; }
}
function saveRoutines(r) {
  fs.writeFileSync(ROUTINES_FILE, JSON.stringify(r, null, 2));
}
const APP_ALIASES = {
  notepad: 'notepad', calculator: 'calc', calc: 'calc', paint: 'mspaint',
  chrome: 'chrome', edge: 'msedge', browser: 'msedge', explorer: 'explorer',
  files: 'explorer', terminal: 'cmd', cmd: 'cmd', spotify: 'spotify',
  discord: 'discord', steam: 'steam', vscode: 'code', code: 'code',
  netflix: 'netflix', youtube: 'https://youtube.com', whatsapp: 'whatsapp:',
  camera: 'microsoft.windows.camera:', settings: 'ms-settings:', taskmanager: 'taskmgr'
};
async function runRoutine(name) {
  const routines = loadRoutines();
  const key = (name || '').toLowerCase().trim();
  const apps = routines[key];
  if (!apps || !apps.length) throw new Error(`No routine named "${name}". Create one first.`);
  for (const app of apps) {
    const target = APP_ALIASES[app.toLowerCase()] || app;
    await ps(`Start-Process '${String(target).replace(/'/g, "''")}'`).catch(() => {});
    await new Promise(r2 => setTimeout(r2, 800));
  }
  return `Routine "${name}" executed: ${apps.join(', ')} launched.`;
}

async function organizeDownloads() {
  const out = await ps(`
    $dl = "$env:USERPROFILE\\Downloads"
    $map = @{ Images = 'jpg','jpeg','png','gif','webp','svg','bmp'; Videos = 'mp4','mkv','avi','mov','webm';
      Music = 'mp3','wav','ogg','flac','m4a'; Documents = 'pdf','docx','doc','txt','xlsx','pptx','csv';
      Archives = 'zip','rar','7z','tar','gz'; Installers = 'exe','msi','apk' }
    $moved = 0
    foreach ($folder in $map.Keys) {
      $dest = Join-Path $dl $folder
      New-Item -ItemType Directory -Force -Path $dest | Out-Null
      foreach ($ext in $map[$folder]) {
        Get-ChildItem $dl -Filter "*.$ext" -File -ErrorAction SilentlyContinue | ForEach-Object {
          Move-Item $_.FullName $dest -Force -ErrorAction SilentlyContinue; $script:moved++
        }
      }
    }
    Write-Output "$moved files organized"`);
  return `Downloads organized — ${out}.`;
}

async function batteryStatus() {
  const out = await ps(`
    $b = Get-CimInstance Win32_Battery
    if ($b) { Write-Output "$($b.EstimatedChargeRemaining)%|$(if($b.BatteryStatus -eq 2){'charging'}else{'discharging'})" }
    else { Write-Output 'AC|plugged' }`);
  const [percent, state] = out.split('|');
  return { percent: parseInt(percent) || 100, state };
}

const serverLogic = async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  const q = new URL(req.url, 'http://x').searchParams;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    if (req.method === 'POST') {
      const body = await readBody(req);

      if (p === '/api/open') return json(res, 200, { reply: await openApp(body.app) });
      if (p === '/api/website') return json(res, 200, { reply: await openWebsite(body.url) });
      if (p === '/api/find') return json(res, 200, { reply: await searchFiles(body.name) });
      if (p === '/api/lock') return json(res, 200, { reply: await lockPC() });
      if (p === '/api/restart') {
        if (body.confirm !== 'yes-jarvis-restart') return json(res, 400, { error: 'Missing confirm token' });
        return json(res, 200, { reply: await restartPC() });
      }
      if (p === '/api/clipboard') return json(res, 200, { reply: await clipboardOp(body.action, body.text) });
      if (p === '/api/media') return json(res, 200, { reply: await media(body.action) });
      if (p === '/api/brightness') return json(res, 200, { reply: await brightness(body.level) });
      if (p === '/api/wifi') return json(res, 200, { reply: await wifiInfo() });
      if (p === '/api/processes') return json(res, 200, { reply: await listProcesses() });
      if (p === '/api/kill') return json(res, 200, { reply: await killProcess(body.name) });
      if (p === '/api/remind') return json(res, 200, { reply: await addReminder(body.text, body.minutes) });
      if (p === '/api/volume') return json(res, 200, { reply: await volume(body.action, body.level) });
      if (p === '/api/screenshot') return json(res, 200, { reply: await screenshot() });
      if (p === '/api/sysinfo') return json(res, 200, { reply: await sysInfo() });

      if (p === '/api/chat') {
        try {
          const reply = await ollamaChat(body.messages || []);
          return json(res, 200, { reply });
        } catch (e) {
          return json(res, 503, { error: 'No LLM backend found. Install Ollama (ollama.com), run: ollama pull llama3.2, then restart.' });
        }
      }

      if (p === '/api/history') {
        if (!Array.isArray(body.messages)) return json(res, 400, { error: 'bad messages' });
        saveHistory(body.messages.filter(m => m && m.role !== 'system' && typeof m.content === 'string'));
        return json(res, 200, { reply: 'saved' });
      }

      if (p === '/api/run') {
        if (!body.cmd || typeof body.cmd !== 'string') return json(res, 400, { error: 'Missing cmd' });
        if (body.confirm !== 'yes-jarvis-run') return json(res, 400, { error: 'Missing confirm token' });
        const out = await runCommand(body.cmd);
        return json(res, 200, { reply: out.length > 1200 ? out.slice(0, 1200) + '\n… (truncated)' : out });
      }

      if (p === '/api/profile') {
        const prof = loadProfile();
        const { key, value } = body.set || {};
        if (key === 'fact') {
          if (value && typeof value === 'string') prof.facts.push(value.trim().slice(0, 300));
        } else if (['name', 'location', 'birthday', 'job'].includes(key)) {
          prof[key] = String(value).slice(0, 100);
        } else return json(res, 400, { error: 'Unknown key' });
        saveProfile(prof);
        return json(res, 200, { profile: prof });
      }

      if (p === '/api/routines') {
        if (body.action === 'create') {
          if (!body.name || !Array.isArray(body.apps)) return json(res, 400, { error: 'Need name + apps array' });
          const routines = loadRoutines();
          routines[body.name.toLowerCase().trim()] = body.apps.slice(0, 15);
          saveRoutines(routines);
          return json(res, 200, { reply: `Routine "${body.name}" saved.` });
        }
        if (body.action === 'run') return json(res, 200, { reply: await runRoutine(body.name) });
        if (body.action === 'delete') {
          const routines = loadRoutines();
          delete routines[(body.name || '').toLowerCase().trim()];
          saveRoutines(routines);
          return json(res, 200, { reply: `Routine "${body.name}" deleted.` });
        }
        return json(res, 200, { routines: loadRoutines() });
      }

      if (p === '/api/organize') {
        return json(res, 200, { reply: await organizeDownloads() });
      }

      if (p === '/api/shutdown') {
        if (body.confirm !== 'yes-jarvis-shutdown') return json(res, 400, { error: 'Missing confirm token' });
        await ps('Stop-Computer -Force');
        return json(res, 200, { reply: 'Shutting down' });
      }
    }

    if (req.method === 'GET' && p === '/api/health') {
      const health = { server: 'ok', ollama: 'down', uptime: Math.round(process.uptime()), time: new Date().toISOString() };
      try {
        const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(4000) });
        if (r.ok) {
          health.ollama = 'ok';
          const models = (await r.json()).models || [];
          health.model = process.env.OLLAMA_MODEL || 'llama3.2:1b';
          health.modelLoaded = models.some(m => m.name === health.model);
        }
      } catch {}
      return json(res, 200, health);
    }

    if (req.method === 'GET' && p === '/api/weather') {
      return json(res, 200, { reply: await weather(q.get('city')) });
    }

    if (req.method === 'GET' && p === '/api/reminders') {
      return json(res, 200, { due: checkReminders() });
    }

    if (req.method === 'GET' && p === '/api/history') {
      return json(res, 200, { messages: loadHistory() });
    }

    if (req.method === 'GET' && p === '/api/profile') {
      return json(res, 200, { profile: loadProfile() });
    }

    if (req.method === 'DELETE' && p === '/api/profile') {
      saveProfile({ name: '', location: '', birthday: '', job: '', facts: [] });
      return json(res, 200, { reply: 'profile cleared' });
    }

    if (req.method === 'GET' && p === '/api/battery') {
      return json(res, 200, await batteryStatus());
    }

    if (req.method === 'GET' && p === '/api/location') {
      const loc = await detectLocation();
      const prof = loadProfile();
      if (!prof.location && loc.city) {
        prof.location = `${loc.city}, ${loc.country}`;
        saveProfile(prof);
      }
      return json(res, 200, { location: loc, saved: prof.location });
    }

    if (req.method === 'DELETE' && p === '/api/history') {
      saveHistory([]);
      return json(res, 200, { reply: 'cleared' });
    }

    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
};

if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
  const creds = { key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CERT_FILE) };
  https.createServer(creds, serverLogic).listen(PORT, '0.0.0.0', () => {
    console.log(`J.A.R.V.I.S. online (HTTPS - phone mic enabled)`);
    console.log(`  On this PC : https://localhost:${PORT}`);
    lanIPs().forEach(ip => console.log(`  On phone   : https://${ip}:${PORT}  (accept the certificate warning once)`));
  });
} else {
  http.createServer(serverLogic).listen(PORT, '0.0.0.0', () => {
    console.log(`J.A.R.V.I.S. online -> http://localhost:${PORT}`);
    lanIPs().forEach(ip => console.log(`  On phone   : http://${ip}:${PORT}  (typed commands work; mic needs HTTPS)`));
  });
}

