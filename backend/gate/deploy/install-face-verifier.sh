#!/usr/bin/env bash

set -euo pipefail
umask 022

if [[ $EUID -ne 0 ]]; then
    echo "Run this script using sudo."
    exit 1
fi

GATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FACE_DIR="$(cd "$GATE_DIR/../face-verifier" && pwd)"

BASE_DIR="/opt/mfa-lab"
INSTALL_DIR="$BASE_DIR/face-verifier"
MODEL_DIR="$BASE_DIR/models"

if ! id mfa-gate >/dev/null 2>&1; then
    echo "MFA service account does not exist."
    exit 1
fi

install -d -m 755 -o root -g root "$BASE_DIR"

# Initial installation only. Never overwrite an existing
# verifier or model installation silently.
for directory in "$INSTALL_DIR" "$MODEL_DIR"; do
    if [[ -e "$directory" || -L "$directory" ]]; then
        echo "Existing installation detected: $directory"
        echo "Stop and review the existing installation."
        exit 1
    fi
done

STAGE_DIR="$(mktemp -d "$BASE_DIR/.face-stage.XXXXXX")"

trap 'rm -rf -- "$STAGE_DIR"' EXIT

chmod 755 "$STAGE_DIR"

STAGED_FACE="$STAGE_DIR/face-verifier"
STAGED_MODELS="$STAGE_DIR/models"

install -d -m 755 -o root -g root \
    "$STAGED_FACE/src" \
    "$STAGED_FACE/scripts" \
    "$STAGED_MODELS"

echo "Installing face-verifier package definitions..."

for file in index.js package.json package-lock.json; do
    install -m 644 -o root -g root \
        "$FACE_DIR/$file" \
        "$STAGED_FACE/$file"
done

echo "Installing private verifier modules..."

for file in \
    face-comparison.js \
    face-detector.js \
    human-runtime.js \
    image-validator.js \
    verification-policy.js \
    verification-worker.js \
    worker-runner.js
do
    install -m 644 -o root -g root \
        "$FACE_DIR/src/$file" \
        "$STAGED_FACE/src/$file"
done

install -m 644 -o root -g root \
    "$FACE_DIR/scripts/test-verification.js" \
    "$STAGED_FACE/scripts/test-verification.js"

echo "Installing pinned runtime dependencies..."

npm ci \
    --prefix "$STAGED_FACE" \
    --omit=dev \
    --ignore-scripts \
    --no-audit \
    --no-fund \
    --cache "$STAGE_DIR/npm-cache"

echo "Locating packaged Human models..."

SOURCE_MODELS="$(
    cd "$STAGED_FACE"

    /usr/bin/node -p '
        const path = require("node:path");

        path.join(
            path.dirname(
                path.dirname(
                    require.resolve("@vladmandic/human")
                )
            ),
            "models"
        )
    '
)"

echo "Installing six required model files..."

for file in \
    blazeface.json \
    blazeface.bin \
    facemesh.json \
    facemesh.bin \
    faceres.json \
    faceres.bin
do
    install -m 644 -o root -g root \
        "$SOURCE_MODELS/$file" \
        "$STAGED_MODELS/$file"
done

echo "Verifying model checksums against frozen policy..."

/usr/bin/node - "$STAGED_FACE" "$STAGED_MODELS" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [verifierDirectory, modelDirectory] =
    process.argv.slice(2);

const { POLICY } = require(
    path.join(
        verifierDirectory,
        'src',
        'verification-policy.js'
    )
);

if (Object.keys(POLICY.modelChecksums).length !== 6) {
    throw new Error('Unexpected model policy');
}

for (const [file, expected] of Object.entries(
    POLICY.modelChecksums
)) {
    const content = fs.readFileSync(
        path.join(modelDirectory, file)
    );

    const actual = crypto
        .createHash('sha256')
        .update(content)
        .digest('hex');

    if (actual !== expected) {
        throw new Error(`Checksum mismatch: ${file}`);
    }

    console.log(`PASS: ${file}`);
}

console.log('PASS: All six model checksums verified');
NODE

echo "Checking JavaScript syntax..."

for file in \
    "$STAGED_FACE/index.js" \
    "$STAGED_FACE"/src/*.js \
    "$STAGED_FACE"/scripts/*.js
do
    /usr/bin/node --check "$file"
done

echo "Applying installation permissions..."

chown -R root:root \
    "$STAGED_FACE" \
    "$STAGED_MODELS"

chmod -R go-w \
    "$STAGED_FACE" \
    "$STAGED_MODELS"

echo "Checking service account access..."

runuser -u mfa-gate -- \
    test -r "$STAGED_FACE/index.js"

for file in "$STAGED_MODELS"/*; do
    runuser -u mfa-gate -- test -r "$file"
done

for directory in "$STAGED_FACE" "$STAGED_MODELS"; do
    if runuser -u mfa-gate -- test -w "$directory"; then
        echo "ERROR: Service account can modify installation."
        exit 1
    fi
done

echo "Activating verified installation..."

mv -T "$STAGED_MODELS" "$MODEL_DIR"

if ! mv -T "$STAGED_FACE" "$INSTALL_DIR"; then
    mv -T "$MODEL_DIR" "$STAGED_MODELS"
    echo "Face-verifier installation failed."
    exit 1
fi

echo "PASS: Face-verifier deployment completed."
echo "Verifier: $INSTALL_DIR"
echo "Models: $MODEL_DIR"
echo "Live gate configuration has not been modified."
