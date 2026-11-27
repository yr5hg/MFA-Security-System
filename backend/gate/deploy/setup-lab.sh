#!/usr/bin/env bash

set -euo pipefail
umask 077

if [[ $EUID -ne 0 ]]; then
    echo "Run this script using sudo."
    exit 1
fi

GATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$GATE_DIR/../.." && pwd)"
INSTALL_DIR="/opt/mfa-lab/gate"

echo "Preparing MFA service account..."

if ! id mfa-gate >/dev/null 2>&1; then
    useradd \
        --system \
        --user-group \
        --no-create-home \
        --home-dir /var/lib/mfa-lab \
        --shell /usr/sbin/nologin \
        mfa-gate
fi

echo "Preparing private directories..."

install -d -m 700 \
    -o mfa-gate -g mfa-gate \
    /var/lib/mfa-lab

install -d -m 750 \
    -o root -g mfa-gate \
    /etc/mfa-lab

install -d -m 755 \
    -o root -g root \
    /srv/mfa-lab

install -d -m 750 \
    -o root -g mfa-gate \
    /srv/mfa-lab/protected

RESOURCE="/srv/mfa-lab/protected/confidential.txt"

if [[ ! -e "$RESOURCE" ]]; then
    printf '%s\n' \
        "CONFIDENTIAL MFA LAB RESOURCE - Authorized access only." \
        > "$RESOURCE"
fi

chown root:mfa-gate "$RESOURCE"
chmod 640 "$RESOURCE"

echo "Installing trusted backend files..."

install -d -m 755 \
    -o root -g root \
    "$INSTALL_DIR" "$INSTALL_DIR/src"

install -m 644 -o root -g root \
    "$GATE_DIR/package.json" \
    "$INSTALL_DIR/package.json"

for file in app.js config.js session.js attempt.js server.js; do
    install -m 644 -o root -g root \
        "$GATE_DIR/src/$file" \
        "$INSTALL_DIR/src/$file"
done

echo "Preparing temporary HTTPS test certificate..."

CERT="/etc/mfa-lab/gate-smoke.crt"
KEY="/etc/mfa-lab/gate-smoke.key"

if [[ ! -e "$CERT" && ! -e "$KEY" ]]; then
    openssl req \
        -x509 \
        -newkey rsa:2048 \
        -noenc \
        -sha256 \
        -days 7 \
        -subj "/CN=gate.test" \
        -addext "subjectAltName=DNS:gate.test" \
        -addext "extendedKeyUsage=serverAuth" \
        -keyout "$KEY" \
        -out "$CERT"

elif [[ ! -f "$CERT" || ! -f "$KEY" ]]; then
    echo "Incomplete TLS certificate configuration."
    exit 1
fi

chown root:mfa-gate "$CERT" "$KEY"
chmod 640 "$CERT" "$KEY"

echo "Preparing temporary service configuration..."

sed \
    -e 's|^GATE_TLS_CERT_FILE=.*|GATE_TLS_CERT_FILE=/etc/mfa-lab/gate-smoke.crt|' \
    -e 's|^GATE_TLS_KEY_FILE=.*|GATE_TLS_KEY_FILE=/etc/mfa-lab/gate-smoke.key|' \
    "$REPO_DIR/.env.example" \
    > /etc/mfa-lab/gate-smoke.env

chown root:root /etc/mfa-lab/gate-smoke.env
chmod 600 /etc/mfa-lab/gate-smoke.env

echo "Installing systemd service..."

install -m 644 -o root -g root \
    "$GATE_DIR/deploy/mfa-gate.service" \
    /etc/systemd/system/mfa-gate.service

systemctl daemon-reload

echo "Deployment completed successfully."
echo "Start the service using:"
echo "sudo systemctl start mfa-gate"
