import test from 'node:test';
import assert from 'node:assert/strict';

import {
    validAttemptPurpose
} from '../src/purpose.js';

import {
    isActionAllowed
} from '../src/evidence.js';

import {
    createAttemptStore
} from '../src/attempt.js';

import {
    createSessionStore
} from '../src/session.js';

import {
    createProofStore
} from '../src/proof.js';

test('sensitive authentication purposes require TOTP', () => {
    for (const action of [
        'approve_enroll',
        'approve_replace',
        'face_enroll',
        'face_replace'
    ]) {
        const target = action.startsWith('approve_')
            ? 'target-account'
            : undefined;

        assert.equal(
            validAttemptPurpose('totp', action, target),
            true
        );

        assert.equal(
            validAttemptPurpose('face', action, target),
            false
        );
    }

    assert.equal(
        validAttemptPurpose('face', 'view'),
        true
    );

    assert.equal(
        validAttemptPurpose('totp', 'unknown'),
        false
    );
});

test('only approval purposes accept a valid target subject', () => {
    for (const target of [
        undefined,
        null,
        '',
        '   ',
        ' target-account ',
        123,
        'x'.repeat(1025)
    ]) {
        assert.equal(
            validAttemptPurpose(
                'totp',
                'approve_enroll',
                target
            ),
            false
        );
    }

    assert.equal(
        validAttemptPurpose(
            'totp',
            'face_enroll',
            'another-account'
        ),
        false
    );

    assert.equal(
        validAttemptPurpose(
            'totp',
            'view',
            'another-account'
        ),
        false
    );
});

test('only administrators may approve biometric operations', () => {
    for (const action of [
        'approve_enroll',
        'approve_replace'
    ]) {
        assert.equal(
            isActionAllowed(['regular_user'], action),
            false
        );

        assert.equal(
            isActionAllowed(['administrator'], action),
            true
        );
    }

    for (const role of [
        'regular_user',
        'administrator'
    ]) {
        assert.equal(
            isActionAllowed([role], 'face_enroll'),
            true
        );

        assert.equal(
            isActionAllowed([role], 'face_replace'),
            true
        );
    }

    assert.equal(
        isActionAllowed(['unknown'], 'face_enroll'),
        false
    );
});

test('approval target is bound to immutable authentication attempt', () => {
    const sessions = createSessionStore();
    const attempts = createAttemptStore();

    const { session } = sessions.create();

    const attempt = attempts.create(
        session,
        'totp',
        'approve_enroll',
        'target-account'
    );

    assert.equal(
        attempt.targetSubject,
        'target-account'
    );

    assert.ok(Object.isFrozen(attempt));

    assert.throws(() => {
        attempt.targetSubject = 'different-account';
    }, TypeError);

    const claimed = attempts.claimCallback(
        session.id,
        'totp',
        attempt.state
    );

    assert.equal(
        claimed.targetSubject,
        'target-account'
    );
});

test('approval proof rejects target substitution and self-approval', () => {
    const sessions = createSessionStore();
    const attempts = createAttemptStore();
    const proofs = createProofStore();

    const { session } = sessions.create();

    const attempt = attempts.create(
        session,
        'totp',
        'approve_enroll',
        'target-account'
    );

    const identity = {
        issuer: 'https://id.test/realms/lab',
        subject: 'admin-account',
        authTime: Math.floor(Date.now() / 1000)
    };

    const result = {
        status: 'identity_validated',
        authorized: false,
        session,
        identity,
        attempt,

        evidence: {
            issuer: identity.issuer,
            subject: identity.subject,
            method: 'totp',
            action: 'approve_enroll',
            targetSubject: 'target-account',
            status: 'totp_verified',
            authorized: false,
            roles: ['administrator'],

            factors: {
                passwordVerified: true,
                totpVerified: true,
                faceVerified: false
            },

            expiresAt: attempt.expiresAt
        },

        accessToken: 'synthetic-access-token',
        idToken: 'synthetic-id-token'
    };

    assert.throws(
        () => proofs.save(session, {
            ...result,

            evidence: {
                ...result.evidence,
                targetSubject: 'different-account'
            }
        }),
        /Authentication evidence mismatch/
    );

    assert.throws(
        () => proofs.save(session, {
            ...result,

            attempt: {
                ...attempt,
                targetSubject: 'admin-account'
            },

            evidence: {
                ...result.evidence,
                targetSubject: 'admin-account'
            }
        }),
        /Invalid proof purpose/
    );

    const saved = proofs.save(session, result);

    assert.equal(
        saved.evidence.targetSubject,
        'target-account'
    );

    assert.equal(
        saved.evidence.action,
        'approve_enroll'
    );

    assert.ok(Object.isFrozen(saved.evidence));
});
