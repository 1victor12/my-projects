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

  # ---------- PC CONTROL ----------
  chat)    shift; REPLY=$(POSTPC /api/chat "{\"messages\":[{\"role\":\"user\",\"content\":\"$*\"}]}" | sed 's/^{"reply":"//;s/"}$//'); echo "$REPLY"; say "$REPLY" ;;
  pcinfo)  POSTPC /api/sysinfo "{}" ;;
  pcbatt)  J "$PC/api/battery"; echo ;;
  where)   J "$PC/api/track"; echo ;;
  me)      J "$PC/api/profile"; echo ;;
  open)    shift; POSTPC /api/open "{\"app\":\"$1\"}" ;;
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
    sms <num> <msg>          send SMS
    call <num>               make call
    photo                    snap + AI describes it
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
