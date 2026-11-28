#!/usr/bin/env bash

set -euo pipefail
umask 022

if [[ $EUID -ne 0 ]]; then
    echo "Run this script using sudo."
    exit 1
fi

GATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BASE_DIR="/opt/mfa-lab"
INSTALL_DIR="$BASE_DIR/gate"

if systemctl is-active --quiet mfa-gate; then
    echo "Stop mfa-gate before updating."
    exit 1
fi

if ! id mfa-gate >/dev/null 2>&1; then
    echo "MFA service account does not exist."
    exit 1
fi

install -d -m 755 -o root -g root "$BASE_DIR"

STAGE_DIR="$(mktemp -d "$BASE_DIR/.gate-new.XXXXXX")"
CACHE_DIR="$(mktemp -d)"

trap 'rm -rf -- "$STAGE_DIR" "$CACHE_DIR"' EXIT

chmod 755 "$STAGE_DIR"

install -d -m 755 -o root -g root \
    "$STAGE_DIR/src"

echo "Installing package definitions..."

for file in package.json package-lock.json; do
    install -m 644 -o root -g root \
        "$GATE_DIR/$file" \
        "$STAGE_DIR/$file"
done

echo "Installing backend modules..."

for file in \
    app.js \
    config.js \
    session.js \
    attempt.js \
    oidc.js \
    callback.js \
    evidence.js \
    proof.js \
    resource.js \
    authorization.js \
    execution.js \
    server.js
do
    install -m 644 -o root -g root \
        "$GATE_DIR/src/$file" \
        "$STAGE_DIR/src/$file"
done

echo "Installing locked runtime dependencies..."

npm ci \
    --prefix "$STAGE_DIR" \
    --omit=dev \
    --ignore-scripts \
    --no-audit \
    --no-fund \
    --cache "$CACHE_DIR"

echo "Checking JavaScript syntax..."

for file in "$STAGE_DIR"/src/*.js; do
    /usr/bin/node --check "$file"
done

echo "Checking service account permissions..."

runuser -u mfa-gate -- \
    test -r "$STAGE_DIR/src/server.js"

runuser -u mfa-gate -- \
    test -r "$STAGE_DIR/node_modules/openid-client/package.json"

if runuser -u mfa-gate -- test -w "$STAGE_DIR/src/server.js"; then
    echo "ERROR: Service account can modify backend code."
    exit 1
fi

BACKUP_DIR=""

if [[ -d "$INSTALL_DIR" ]]; then
    BACKUP_DIR="$(mktemp -d "$BASE_DIR/gate-backup.XXXXXX")"

    mv -T "$INSTALL_DIR" "$BACKUP_DIR"

    echo "Previous deployment backed up to:"
    echo "$BACKUP_DIR"
fi

if ! mv -T "$STAGE_DIR" "$INSTALL_DIR"; then
    if [[ -n "$BACKUP_DIR" ]]; then
        mv -T "$BACKUP_DIR" "$INSTALL_DIR"
    fi

    echo "Deployment failed."
    exit 1
fi

echo "PASS: Backend deployment updated."
echo "Start the service using:"
echo "sudo systemctl start mfa-gate"
