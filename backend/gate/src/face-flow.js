import { randomBytes } from 'node:crypto';

import {
    inspectAccessToken,
    isActionAllowed
} from './evidence.js';

const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const biometricErrors = new Set([
    'FACE_MISMATCH',
    'INVALID_IMAGE_FORMAT',
    'INVALID_JPEG',
    'INVALID_DIMENSIONS',
    'INVALID_PIXEL_DATA',
    'NO_FACE',
    'MULTIPLE_FACES',
    'LOW_CONFIDENCE',
    'INVALID_FACE_SCORE',
    'INVALID_FACE_BOX',
    'FACE_TOO_SMALL',
    'FACE_OUT_OF_FRAME',
    'LOW_MESH_CONFIDENCE'
]);

const tokenErrors = new Set([
    'Access token is inactive',
    'Incorrect access token issuer',
    'Access token subject mismatch',
    'Access token client mismatch',
    'Incorrect access token audience',
    'Access token expired',
    'Access token is not yet valid',
    'Missing or invalid realm roles',
    'No permitted application role'
]);

function failure(httpStatus, error, extra = {}) {
    return {
        httpStatus,
        body: { error, ...extra }
    };
}

export async function readFaceJpeg(req, maxBytes) {
    const type = req.headers['content-type'];

    const encoding =
        req.headers['content-encoding'];

    if (
        type !== 'image/jpeg' ||
        (encoding && encoding !== 'identity')
    ) {
        req.resume();

        return failure(
            415,
            'unsupported_image_type'
        );
    }

    const length = req.headers['content-length'];

    if (
        length !== undefined &&
        Number(length) > maxBytes
    ) {
        req.resume();

        return failure(413, 'image_too_large');
    }

    const chunks = [];
    let total = 0;

    try {
        for await (const chunk of req.iterator({
            destroyOnReturn: false
        })) {
            total += chunk.length;

            if (total > maxBytes) {
                req.resume();

                return failure(
                    413,
                    'image_too_large'
                );
            }

            chunks.push(chunk);
        }

        if (total === 0) {
            return failure(400, 'empty_image');
        }

        return {
            image: Buffer.concat(chunks, total)
        };

    } catch {
        return failure(400, 'invalid_image_body');

    } finally {
        for (const chunk of chunks) {
            chunk.fill(0);
        }
    }
}

export function createFaceFlow({
    config,
    clients,
    sessions,
    proofs,
    references,
    verifier,
    policyVersion,
    introspect,
    now = Date.now
}) {
    if (
        config.faceSimilarityThreshold !== 0.66 ||
        typeof verifier?.verify !== 'function' ||
        typeof references?.get !== 'function' ||
        typeof references?.isCurrent !== 'function' ||
        typeof policyVersion !== 'string' ||
        !policyVersion
    ) {
        throw new Error(
            'Invalid face verification configuration'
        );
    }

    // One challenge per immutable authentication record.
    const challenges = new WeakMap();

    // Account-based failures survive browser session changes.
    const failures = new Map();

    const failureWindow =
        config.faceFailureWindowSeconds * 1000;

    const cooldown =
        config.faceCooldownSeconds * 1000;

    const maxTrackedAccounts = 1000;

    let busy = false;

    function key(identity) {
        return JSON.stringify([
            identity.issuer,
            identity.subject
        ]);
    }

    function purgeFailures() {
        const time = now();

        for (const [id, entry] of failures) {
            if (entry.until > time) {
                continue;
            }

            entry.timestamps = entry.timestamps.filter(
                stamp => stamp > time - failureWindow
            );

            if (entry.until || !entry.timestamps.length) {
                failures.delete(id);
            }
        }
    }

    function retryAfter(identity) {
        purgeFailures();

        const entry = failures.get(key(identity));

        return entry?.until > now()
            ? Math.ceil((entry.until - now()) / 1000)
            : 0;
    }

    function capacityAvailable(identity) {
        purgeFailures();

        return (
            failures.has(key(identity)) ||
            failures.size < maxTrackedAccounts
        );
    }

    function recordFailure(identity) {
        purgeFailures();

        const id = key(identity);

        const entry = failures.get(id) ?? {
            timestamps: [],
            until: 0
        };

        entry.timestamps.push(now());

        if (
            entry.timestamps.length >=
            config.faceFailureLimit
        ) {
            entry.until = now() + cooldown;
        }

        failures.set(id, entry);

        return retryAfter(identity);
    }

    function pending(record) {
        return Boolean(
            record &&
            record.evidence.method === 'face' &&
            record.evidence.status === 'pending_face' &&
            record.evidence.factors.passwordVerified === true &&
            record.evidence.factors.totpVerified === false &&
            record.evidence.factors.faceVerified === false &&
            record.evidence.expiresAt > now()
        );
    }

    function current(sessionToken, record) {
        const session = sessions.get(sessionToken);

        if (
            !session ||
            !pending(record) ||
            proofs.get(session) !== record
        ) {
            return null;
        }

        return session;
    }

    function revokeIfCurrent(session, record) {
        if (proofs.get(session) === record) {
            proofs.revoke(session.id);
        }
    }

    function issueChallenge(session, record) {
        if (
            !pending(record) ||
            proofs.get(session) !== record
        ) {
            return {};
        }

        const retry = retryAfter(record.identity);

        if (retry) {
            return {
                faceError: 'face_cooldown',
                retryAfterSeconds: retry
            };
        }

        if (!capacityAvailable(record.identity)) {
            return {
                faceError: 'face_unavailable'
            };
        }

        try {
            const stored = references.get(
                record.identity
            );

            if (
                !stored.reference ||
                stored.issuer !== record.identity.issuer ||
                stored.subject !== record.identity.subject ||
                !Number.isSafeInteger(stored.version) ||
                stored.version < 1 ||
                stored.reference.policyVersion !== policyVersion
            ) {
                return {
                    faceError: 'face_not_enrolled'
                };
            }

            let challenge = challenges.get(record);

            if (challenge) {
                if (challenge.used) {
                    return {
                        faceError: 'capture_in_progress'
                    };
                }

                if (
                    challenge.expiresAt <= now() ||
                    challenge.referenceVersion !== stored.version
                ) {
                    revokeIfCurrent(session, record);

                    return {
                        faceError: 'capture_expired'
                    };
                }

            } else {
                challenge = {
                    token: randomBytes(32)
                        .toString('base64url'),

                    referenceVersion: stored.version,

                    expiresAt: Math.min(
                        record.evidence.expiresAt,
                        now() +
                            config.captureChallengeTtlSeconds * 1000
                    ),

                    used: false
                };

                challenges.set(record, challenge);
            }

            return {
                captureChallenge: challenge.token,
                captureChallengeExpiresAt:
                    challenge.expiresAt
            };

        } catch {
            return {
                faceError: 'face_unavailable'
            };
        }
    }

    async function verifyCapture({
        sessionToken,
        record,
        challengeToken,
        image
    }) {
        const session = current(
            sessionToken,
            record
        );

        if (!session) {
            return failure(409, 'face_attempt_unavailable');
        }

        const retry = retryAfter(record.identity);

        if (retry) {
            revokeIfCurrent(session, record);

            return failure(429, 'face_cooldown', {
                retryAfterSeconds: retry
            });
        }

        if (!capacityAvailable(record.identity)) {
            revokeIfCurrent(session, record);

            return failure(503, 'face_unavailable');
        }

        const challenge = challenges.get(record);

        if (
            !challenge ||
            challenge.used ||
            typeof challengeToken !== 'string' ||
            !CHALLENGE_PATTERN.test(challengeToken) ||
            challenge.token !== challengeToken
        ) {
            return failure(409, 'invalid_capture_challenge');
        }

        if (challenge.expiresAt <= now()) {
            revokeIfCurrent(session, record);

            return failure(409, 'capture_expired');
        }

        // Consume synchronously before any asynchronous work.
        challenge.used = true;

        if (busy) {
            revokeIfCurrent(session, record);

            return failure(503, 'face_unavailable');
        }

        busy = true;

        try {
            const stored = references.get(
                record.identity
            );

            if (
                !stored.reference ||
                stored.issuer !== record.identity.issuer ||
                stored.subject !== record.identity.subject ||
                stored.version !== challenge.referenceVersion ||
                stored.reference.policyVersion !== policyVersion
            ) {
                return failure(409, 'reference_changed');
            }

            const outcome = await verifier.verify(
                image,
                stored.reference
            );

            if (
                outcome?.policyVersion !== policyVersion
            ) {
                return failure(503, 'face_unavailable');
            }

            // Count legitimate failed biometric submissions.
            if (
                outcome.ok === false &&
                outcome.matched === false &&
                biometricErrors.has(outcome.code)
            ) {
                const wait = recordFailure(
                    record.identity
                );

                if (wait) {
                    return failure(429, 'face_cooldown', {
                        retryAfterSeconds: wait
                    });
                }

                return failure(403, 'face_verification_failed');
            }

            const matched = (
                outcome.ok === true &&
                outcome.matched === true &&
                outcome.code === 'MATCH' &&
                outcome.threshold === 0.66 &&
                Number.isFinite(outcome.similarity) &&
                outcome.similarity >= 0.66 &&
                outcome.similarity <= 1
            );

            if (!matched) {
                return failure(503, 'face_unavailable');
            }

            // The worker's match alone is not authorization.
            if (!current(sessionToken, record)) {
                return failure(409, 'face_attempt_unavailable');
            }

            if (!references.isCurrent(
                record.identity,
                stored.version
            )) {
                return failure(409, 'reference_changed');
            }

            const tokenEvidence = await inspectAccessToken({
                config,
                clients,
                method: 'face',
                identity: record.identity,
                accessToken: record.accessToken,
                introspect
            });

            const liveSession = current(
                sessionToken,
                record
            );

            if (!liveSession) {
                return failure(409, 'face_attempt_unavailable');
            }

            if (
                !isActionAllowed(
                    record.evidence.roles,
                    record.evidence.action
                ) ||
                !isActionAllowed(
                    tokenEvidence.roles,
                    record.evidence.action
                ) ||
                tokenEvidence.expiresAt <= now()
            ) {
                return failure(403, 'authorization_failed');
            }

            if (!references.isCurrent(
                record.identity,
                stored.version
            )) {
                return failure(409, 'reference_changed');
            }

            const completed = proofs.completeFace(
                liveSession,
                record,
                stored.version,
                tokenEvidence.expiresAt
            );

            if (!completed) {
                return failure(409, 'face_attempt_unavailable');
            }

            return {
                httpStatus: 200,
                body: { status: 'face_verified' }
            };

        } catch (error) {
            if (tokenErrors.has(error?.message)) {
                return failure(403, 'authorization_failed');
            }

            return failure(503, 'face_unavailable');

        } finally {
            busy = false;

            // On failure remove only this original proof.
            // A successful transition replaces the record.
            revokeIfCurrent(session, record);
        }
    }

    return Object.freeze({
        issueChallenge,
        verifyCapture
    });
}
