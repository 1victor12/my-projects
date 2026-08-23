#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  JARVIS PHONE CONTROL — Big Vee Edition
#  Controls BOTH your phone (itself) AND your PC.
#
#  ONE-TIME SETUP in Termux:
#    pkg update && pkg install curl termux-api -y
#    Install "Termux" + "Termux:API" apps from F-Droid
#    curl -sL https://raw.githubusercontent.com/1victor12/my-projects/main/jarvis/jarvis.sh -o $PREFIX/bin/jarvis && chmod +x $PREFIX/bin/jarvis
#
#  USE:
#    jarvis voice          <- FULL VOICE MODE: speak -> AI answers out loud
#    jarvis chat hello     <- type to AI brain
#    jarvis sms 0700.. hi  <- send SMS from phone
#    jarvis call 0700...   <- call from phone
#    jarvis photo          <- snap photo, AI describes it
#    jarvis app whatsapp   <- open any app on phone
#    jarvis batt           <- phone battery
#    jarvis pcinfo         <- PC system status
#    jarvis pcrun <cmd>    <- run ANY command on PC
# ============================================================

PC="https://192.168.10.90:8124"
J() { curl -sk --max-time 90 "$@"; }
POSTPC() { J -X POST "$PC$1" -H "Content-Type: application/json" -d "$2"; echo; }

say() { command -v termux-tts-speak >/dev/null && termux-tts-speak "$*" || echo "$*"; }

case "$1" in

  # ---------- VOICE MODE: real Jarvis conversation ----------
  voice|v)
    while true; do
      echo "🎙️  Speak now (Ctrl+C to exit)..."
      TEXT=$(termux-speech-to-text)
      [ -z "$TEXT" ] && continue
      echo "You: $TEXT"
      case "$(echo $TEXT | tr '[:upper:]' '[:lower:]')" in
        "stop"|"exit"|"goodbye") say "Goodbye Boss."; break ;;
      esac
      REPLY=$(POSTPC /api/chat "{\"messages\":[{\"role\":\"user\",\"content\":\"$TEXT\"}]}" | sed 's/^{"reply":"//;s/"}$//')
      echo "JARVIS: $REPLY"
      say "$REPLY"
    done ;;

  # ---------- PHONE SELF-CONTROL ----------
  sms)     shift; NUM=$1; shift; termux-sms-send -n "$NUM" "$*" && say "Message sent" ;;
  call)    shift; termux-call -n "$1";;
  batt)    termux-battery-status ;;
  photo)   shift; termux-camera-photo -c "$1" ~/photo.jpg && say "Photo taken. Sending to my eyes." && POSTPC /api/vision "{\"image\":\"$(base64 -w0 ~/photo.jpg)\",\"prompt\":\"Describe this photo briefly.\"}" ;;
  vibrate) termux-vibrate -d 500 ;;
  clip)    shift; termux-clipboard-set "$*"; say "Copied" ;;
  readclip) say "$(termux-clipboard-get)" ;;
  wifi)    cmd wifi status 2>/dev/null || termux-wifi-connectioninfo ;;
  bright)  shift; termux-brightness-set "$1";;
  vol)     shift; termux-volume music "$1" ;;
  torch)   termux-torch on 2>/dev/null || termux-torch off ;;
  apps)    pm list packages -3 | sed 's/package://' | grep -E 'whatsapp|instagram|youtube|spotify|telegram|tiktok|maps|chrome' ;;
  app)     shift; am start -a android.intent.action.VIEW -d "market://details?id=$1" 2>/dev/null || am start -n "$1";;
  location) termux-location -p network 2>/dev/null | head -20 ;;

  # ---------- BACKGROUND MODE (works while you use other apps) ----------
  # first time: disable battery optimization for Termux in Android settings!
  bgstart)
    termux-wake-lock
    nohup bash -c '
      while true; do
        R=$(curl -sk --max-time 15 "'"$PC"'/api/reminders")
        for DUE in $(echo "$R" | grep -o "\"Reminder:[^\"]*\"" | sed "s/\"//g"); do
          termux-notification --title "JARVIS" --content "$DUE" 2>/dev/null
          say "$DUE"
        done
        B=$(termux-battery-status 2>/dev/null | grep -o "\"percentage\":[0-9]*" | grep -o "[0-9]*")
        [ -n "$B" ] && [ "$B" -le 15 ] && say "Warning Boss, battery at $B percent"
        sleep 60
      done
    ' > /dev/null 2>&1 &
    echo $! > ~/jarvis_bg.pid
    say "Background mode active Boss. I will watch everything."
    echo "background watcher started (pid $(cat ~/jarvis_bg.pid))" ;;
  bgstop)
    [ -f ~/jarvis_bg.pid ] && kill $(cat ~/jarvis_bg.pid) 2>/dev/null && rm ~/jarvis_bg.pid
    termux-wake-unlock
    say "Background mode stopped." ;;
  log) cat ~/photo.jpg >/dev/null 2>&1; tail -5 ~/jarvis_bg.log 2>/dev/null || echo "no log yet" ;;

  # ---------- PHONE POWER CONTROL ----------
  lockphone) input keyevent 26 && say "Locking your phone Boss" ;;
  shutdown)
    say "Attempting shutdown Boss"
    if command -v termux-reboot >/dev/null 2>&1; then termux-reboot
    elif [ "$(id -u)" = "0" ]; then reboot
    else
      input keyevent 26
      say "Android blocks full shutdown without root Boss. Screen locked instead. For real shutdown: root the phone or use the power button."
    fi ;;
  restart)
    say "Attempting restart Boss"
    if command -v termux-reboot >/dev/null 2>&1; then termux-reboot
    elif [ "$(id -u)" = "0" ]; then su -c reboot
    else say "Restart needs root access Boss. Android security does not allow it otherwise."
    fi ;;
  close)
    shift
    if am force-stop "$1" 2>/dev/null; then say "$1 closed"
    else input keyevent 3; say "Force close needs root Boss. Sent $1 to background instead."
    fi ;;
  closeall) input keyevent 3; say "Home screen. All apps backgrounded." ;;

  # ---------- PC CONTROL ----------
  chat)    shift; REPLY=$(POSTPC /api/chat "{\"messages\":[{\"role\":\"user\",\"content\":\"$*\"}]}" | sed 's/^{"reply":"//;s/"}$//'); echo "$REPLY"; say "$REPLY" ;;
  pcinfo)  POSTPC /api/sysinfo "{}" ;;
  pcbatt)  J "$PC/api/battery"; echo ;;
  where)   J "$PC/api/track"; echo ;;
  me)      J "$PC/api/profile"; echo ;;
  open)    shift; POSTPC /api/open "{\"app\":\"$1\"}" ;;
  site)    shift; POSTPC /api/website "{\"url\":\"$1\"}" ;;
  routine) shift; POSTPC /api/routines "{\"action\":\"run\",\"name\":\"$1\"}" ;;
  organize) POSTPC /api/organize "{}" ;;
  pcrun)   shift; POSTPC /api/run "{\"cmd\":\"$*\",\"confirm\":\"yes-jarvis-run\"}" ;;
  lock)    POSTPC /api/lock "{}" ;;
  remind)  shift; POSTPC /api/remind "{\"text\":\"$1\",\"minutes\":$2}" ;;
  weather) shift; J "$PC/api/weather?city=$*"; echo ;;
  news)    shift; REPLY=$(J "$PC/api/search?q=$*"); echo "$REPLY" | head -c 600; echo ;;

  *)
    cat <<EOF
═══════════════════════════════════════
   JARVIS — Big Vee's Phone & PC
═══════════════════════════════════════
 🎙️  jarvis voice            VOICE MODE (talk to AI)
 📱 PHONE SELF:
    voice                    FULL VOICE MODE (talk to AI)
    bgstart / bgstop         BACKGROUND MODE - watches while you use other apps
    lockphone                turn screen off
    shutdown / restart       power control (needs root for full power-off)
    close <package>          close an app
    closeall                 background all apps
    sms <num> <msg>          send SMS
    call <num>               make call
    photo                    snap photo, AI describes it
    batt / torch / bright <0-255> / vol <0-15>
    clip <text> / readclip   clipboard
    apps                     list installed apps
    location                 GPS position
 💻 PC REMOTE:
    chat <message>           talk to AI brain
    info / pcbatt / me       PC status / battery / your profile
    open <app> / routine <name>
    pcrun <command>          ANY command on PC
    lock / organize / remind <txt> <min> / weather [city]
═══════════════════════════════════════
EOF
;;
esac
