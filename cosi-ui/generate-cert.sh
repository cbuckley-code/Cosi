#!/bin/bash
set -e

CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/cosi.crt" ] && [ -f "$CERT_DIR/cosi.key" ]; then
  echo "Certificates already exist at $CERT_DIR"
  exit 0
fi

echo "Generating self-signed certificate..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERT_DIR/cosi.key" \
  -out "$CERT_DIR/cosi.crt" \
  -subj "/CN=cosi.local" \
  -addext "subjectAltName=DNS:cosi.local,DNS:localhost,IP:127.0.0.1"

echo "Certificate generated at $CERT_DIR"
