#!/data/data/com.termux/files/usr/bin/bash
# JARVIS Remote — Big Vee's PC control from Termux
# Install: pkg install curl -y
# Setup:   curl -sL https://raw.githubusercontent.com/1victor12/my-projects/main/jarvis/jarvis.sh -o $PREFIX/bin/jarvis && chmod +x $PREFIX/bin/jarvis
# Use:     jarvis chat hello boss

PC="https://192.168.10.90:8124"

J() { curl -sk --max-time 120 "$@"; }
POST() { J -X POST "$PC$1" -H "Content-Type: application/json" -d "$2"; echo; }

case "$1" in
  chat)    shift; POST /api/chat "{\"messages\":[{\"role\":\"user\",\"content\":\"$*\"}]}" ;;
  info)    J "$PC/api/sysinfo"; echo ;;
  battery) J "$PC/api/battery"; echo ;;
  where)   J "$PC/api/location"; echo ;;
  me)      J "$PC/api/profile"; echo ;;
  open)    shift; POST /api/open "{\"app\":\"$1\"}" ;;
  routine) shift; POST /api/routines "{\"action\":\"run\",\"name\":\"$1\"}" ;;
  routines) J "$PC/api/routines"; echo ;;
  organize) POST /api/organize "{}" ;;
  run)     shift; POST /api/run "{\"cmd\":\"$*\",\"confirm\":\"yes-jarvis-run\"}" ;;
  lock)    POST /api/lock "{}" ;;
  remind)  shift; POST /api/remind "{\"text\":\"$1\",\"minutes\":$2}" ;;
  weather) shift; J "$PC/api/weather?city=$*"; echo ;;
  screenshot) POST /api/screenshot "{}" ;;
  *)
    cat <<EOF
JARVIS Remote — Big Vee's PC
usage: jarvis <command>

  chat <message>        talk to the AI brain
  info                  PC system status
  battery               battery check
  where                 your location
  me                    what JARVIS knows about you
  open <app>            launch app on PC (chrome, notepad...)
  routine <name>        run an app routine (morning, work...)
  routines              list saved routines
  organize              auto-organize Downloads folder
  run <command>         execute ANY command on the PC
  lock                  lock the PC now
  remind <text> <min>   set a reminder
  weather [city]        weather report
  screenshot            capture PC screen

first time? run: pkg install curl -y
EOF
;;
esac
