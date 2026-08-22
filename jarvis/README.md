# J.A.R.V.I.S.

Voice-controlled assistant that runs in your browser and controls your PC.
Works on desktop Chrome/Edge, and installable as an app on Android (PWA over HTTPS).

## Run

```bash
cd jarvis
node server.js
```

Open the printed URL:

- On this PC: `https://localhost:8124`
- On phone (same WiFi): the LAN URL shown at startup, e.g. `https://192.168.x.x:8124`
  - Accept the self-signed certificate warning once
  - Tap "Install App" (or Chrome menu -> Add to Home screen) to install it like a native app

## First-time setup (HTTPS cert)

Required once so the microphone works from your phone (browsers only allow mic on secure origins).

```bash
bash gen-cert.sh        # Linux / macOS / Termux
```

On Windows with Git installed:

```powershell
& "C:\Program Files\Git\usr\bin\openssl.exe" req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 825 -nodes -subj "/CN=jarvis-local" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

Without certs the server falls back to HTTP (typed commands work; mic does not).

## Optional: LLM chat backend

Install [Ollama](https://ollama.com), then:

```bash
ollama pull llama3.2
```

## Voice commands

Wake mode: say "jarvis" first, then the command.

| Command examples | What it does |
|---|---|
| open notepad / calculator / spotify / vscode | Launch Windows apps |
| open youtube.com / go to github.com | Open any website |
| find file resume | Search Desktop/Documents/Downloads |
| volume up / down / set volume to 40 / mute | Volume control |
| pause / next song / previous song | Media keys |
| brightness to 50 | Screen brightness |
| screenshot | Saves PNG to desktop |
| system status / battery / cpu | System report |
| weather / weather in London | Weather via wttr.in |
| wifi status | WiFi signal/state |
| list processes / kill chrome | Process control |
| copy some text / read clipboard | Clipboard |
| remind me to stretch in 10 minutes | Persistent reminder |
| timer for 5 minutes | Timer announcement |
| play lofi beats on youtube / search cats | Web searches |
| lock / restart confirm / shutdown confirm | Power actions |
| joke / flip a coin / roll a dice | Fun extras |

Anything else goes to the Ollama LLM if installed.

## Notes

- PC-control commands (open apps, volume, shutdown...) execute on the machine running `server.js`, so controlling from your phone controls your PC remotely.
- `reminders.json`, `cert.pem`/`key.pem` are local-only and gitignored. Regenerate certs with `gen-cert.sh` on any new machine.
