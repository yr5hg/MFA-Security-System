import { isActionAllowed } from './evidence.js';

const SESSION_ID_PATTERN = /^[a-f0-9]{64}$/;
const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createProofStore({
    maxRecords = 1000,
    now = Date.now
} = {}) {
    if (
        !Number.isSafeInteger(maxRecords) ||
        maxRecords <= 0
    ) {
        throw new Error('Invalid proof capacity');
    }

    const records = new Map();

    function validSession(session) {
        return Boolean(
            session &&
            typeof session.id === 'string' &&
            SESSION_ID_PATTERN.test(session.id) &&
            Number.isSafeInteger(session.expiresAt) &&
            session.expiresAt > now()
        );
    }

    function purgeExpired() {
        const currentTime = now();

        for (const [id, entry] of records) {
            if (entry.record.evidence.expiresAt <= currentTime) {
                records.delete(id);
            }
        }
    }

    function getEntry(session) {
        if (!validSession(session)) {
            return null;
        }

        const entry = records.get(session.id);

        if (!entry) {
            return null;
        }

        if (entry.record.evidence.expiresAt <= now()) {
            records.delete(session.id);
            return null;
        }

        return entry;
    }

    function save(session, result) {
        purgeExpired();

        if (!validSession(session)) {
            throw new Error('Invalid proof session');
        }

        if (
            !result ||
            result.status !== 'identity_validated' ||
            result.authorized !== false ||
            result.session?.id !== session.id
        ) {
            throw new Error('Invalid callback result');
        }

        const {
            identity,
            attempt,
            evidence,
            accessToken,
            idToken
        } = result;

        if (
            !identity ||
            typeof identity.issuer !== 'string' ||
            !identity.issuer ||
            typeof identity.subject !== 'string' ||
            !identity.subject ||
            !Number.isSafeInteger(identity.authTime)
        ) {
            throw new Error('Invalid proof identity');
        }

        if (
            !attempt ||
            typeof attempt.id !== 'string' ||
            !ATTEMPT_ID_PATTERN.test(attempt.id) ||
            !Number.isSafeInteger(attempt.expiresAt) ||
            attempt.expiresAt <= now()
        ) {
            throw new Error('Invalid proof attempt');
        }

        if (
            !evidence ||
            evidence.authorized !== false ||
            evidence.issuer !== identity.issuer ||
            evidence.subject !== identity.subject ||
            evidence.method !== attempt.method ||
            evidence.action !== attempt.action
        ) {
            throw new Error('Authentication evidence mismatch');
        }

        if (
            !Array.isArray(evidence.roles) ||
            !evidence.roles.every(role =>
                typeof role === 'string'
            ) ||
            !isActionAllowed(
                evidence.roles,
                evidence.action
            )
        ) {
            throw new Error('Insufficient proof role');
        }

        if (
            typeof accessToken !== 'string' ||
            !accessToken ||
            typeof idToken !== 'string' ||
            !idToken
        ) {
            throw new Error('Missing proof tokens');
        }

        const factors = evidence.factors;

        if (
            !factors ||
            factors.passwordVerified !== true ||
            factors.faceVerified !== false
        ) {
            throw new Error('Invalid proof factors');
        }

        if (evidence.method === 'totp') {
            if (
                evidence.status !== 'totp_verified' ||
                factors.totpVerified !== true
            ) {
                throw new Error('TOTP verification incomplete');
            }

        } else if (evidence.method === 'face') {
            if (
                evidence.status !== 'pending_face' ||
                factors.totpVerified !== false
            ) {
                throw new Error('Invalid pending face evidence');
            }

        } else {
            throw new Error('Unsupported proof method');
        }

        if (
            !Number.isSafeInteger(evidence.expiresAt) ||
            evidence.expiresAt <= now()
        ) {
            throw new Error('Authentication proof expired');
        }

        if (records.has(session.id)) {
            throw new Error('Proof already exists');
        }

        if (records.size >= maxRecords) {
            throw new Error('Proof capacity reached');
        }

        const expiresAt = Math.min(
            session.expiresAt,
            attempt.expiresAt,
            evidence.expiresAt
        );

        const record = Object.freeze({
            sessionId: session.id,
            attemptId: attempt.id,

            identity: Object.freeze({
                issuer: identity.issuer,
                subject: identity.subject,
                authTime: identity.authTime
            }),

            evidence: Object.freeze({
                issuer: evidence.issuer,
                subject: evidence.subject,
                method: evidence.method,
                action: evidence.action,
                status: evidence.status,
                authorized: false,

                roles: Object.freeze([
                    ...evidence.roles
                ]),

                factors: Object.freeze({
                    passwordVerified:
                        factors.passwordVerified,
                    totpVerified:
                        factors.totpVerified,
                    faceVerified:
                        factors.faceVerified
                }),

                expiresAt
            }),

            accessToken,
            idToken
        });

        records.set(session.id, {
            record,
            claim: null
        });

        return record;
    }

    function get(session) {
        return getEntry(session)?.record ?? null;
    }

    function completeFace(
        session,
        original,
        referenceVersion,
        tokenExpiresAt
    ) {
        const entry = getEntry(session);

        if (
            !entry ||
            entry.record !== original ||
            entry.claim !== null ||
            original.evidence.method !== 'face' ||
            original.evidence.status !== 'pending_face' ||
            original.evidence.factors.passwordVerified !== true ||
            original.evidence.factors.totpVerified !== false ||
            original.evidence.factors.faceVerified !== false ||
            !Number.isSafeInteger(referenceVersion) ||
            referenceVersion < 1 ||
            !Number.isSafeInteger(tokenExpiresAt) ||
            tokenExpiresAt <= now()
        ) {
            return null;
        }

        const completed = Object.freeze({
            ...original,

            evidence: Object.freeze({
                ...original.evidence,
                status: 'face_verified',
                authorized: false,
                referenceVersion,

                expiresAt: Math.min(
                    original.evidence.expiresAt,
                    tokenExpiresAt
                ),

                factors: Object.freeze({
                    passwordVerified: true,
                    totpVerified: false,
                    faceVerified: true
                })
            })
        });

        entry.record = completed;

        return completed;
    }

    function claim(session) {
        const entry = getEntry(session);

        if (!entry || entry.claim !== null) {
            return null;
        }

        const { record } = entry;

        if (
            record.evidence.method !== 'totp' ||
            record.evidence.status !== 'totp_verified' ||
            record.evidence.factors.passwordVerified !== true ||
            record.evidence.factors.totpVerified !== true
        ) {
            return null;
        }

        // Synchronous claim prevents concurrent execution.
        const claimed = Object.freeze({
            record
        });

        entry.claim = claimed;

        return claimed;
    }

    function isClaimCurrent(session, claimed) {
        const entry = getEntry(session);

        return Boolean(
            entry &&
            claimed &&
            entry.claim === claimed &&
            entry.record === claimed.record
        );
    }

    function consume(session, claimed) {
        if (!isClaimCurrent(session, claimed)) {
            return null;
        }

        const record = claimed.record;

        // Remove before permitting a protected effect.
        records.delete(session.id);

        return record;
    }

    function revoke(sessionId) {
        return records.delete(sessionId);
    }

    return Object.freeze({
        save,
        get,
        completeFace,
        claim,
        isClaimCurrent,
        consume,
        revoke,
        purgeExpired
    });
}
