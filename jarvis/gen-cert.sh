#!/usr/bin/env bash
# Regenerates the self-signed HTTPS cert for JARVIS (needed for phone mic).
# Works on Linux, macOS and Termux (pkg install openssl nodejs).
cd "$(dirname "$0")"
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 825 -nodes \
  -subj "/CN=jarvis-local" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
echo "Done. Restart the server: node server.js"
