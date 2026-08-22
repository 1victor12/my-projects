const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname;
const PORT = 8124;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
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

async function weather(city) {
  const url = `https://wttr.in/${encodeURIComponent(city || '')}?format=j1`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const d = await r.json();
  const cur = d.current_condition[0];
  const today = d.weather[0];
  return `${city ? city + ': ' : ''}${cur.temp_C} degrees, ${cur.weatherDesc[0].value}, feels like ${cur.FeelsLikeC}. High ${today.maxtempC}, low ${today.mintempC}. Humidity ${cur.humidity} percent.`;
}

async function ollamaChat(messages) {
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'llama3.2', messages, stream: false }),
    signal: AbortSignal.timeout(120000)
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  const d = await r.json();
  return d.message.content;
}

const server = http.createServer(async (req, res) => {
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

      if (p === '/api/shutdown') {
        if (body.confirm !== 'yes-jarvis-shutdown') return json(res, 400, { error: 'Missing confirm token' });
        await ps('Stop-Computer -Force');
        return json(res, 200, { reply: 'Shutting down' });
      }
    }

    if (req.method === 'GET' && p === '/api/weather') {
      return json(res, 200, { reply: await weather(q.get('city')) });
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
});

server.listen(PORT, () => console.log(`J.A.R.V.I.S. online -> http://localhost:${PORT}`));
