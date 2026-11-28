import test from 'node:test';
import assert from 'node:assert/strict';

import { createProofStore } from '../src/proof.js';
import { createSessionStore } from '../src/session.js';
import { createAttemptStore } from '../src/attempt.js';

function setup(method = 'totp', action = 'view', options = {}) {
    let clock = Date.now();

    const now = () => clock;

    const sessions = createSessionStore({ now });
    const attempts = createAttemptStore({ now });

    const original = sessions.create();

    const attempt = attempts.create(
        original.session,
        method,
        action
    );

    const rotated = sessions.rotate(original.token);

    const identity = {
        issuer:
            'https://id.test:8443/realms/multi-factor-authentication',
        subject: 'test-account',
        authTime: Math.floor(clock / 1000)
    };

    const result = {
        status: 'identity_validated',
        authorized: false,

        session: rotated.session,
        identity,

        attempt: {
            id: attempt.id,
            method,
            action,
            expiresAt: attempt.expiresAt
        },

        evidence: {
            issuer: identity.issuer,
            subject: identity.subject,
            method,
            action,
            authorized: false,

            status: method === 'totp'
                ? 'totp_verified'
                : 'pending_face',

            roles: action === 'admin'
                ? ['administrator']
                : ['regular_user'],

            factors: {
                passwordVerified: true,
                totpVerified: method === 'totp',
                faceVerified: false
            },

            expiresAt: attempt.expiresAt
        },

        accessToken: 'test-access-token',
        idToken: 'test-id-token'
    };

    const store = createProofStore({
        now,
        ...options
    });

    return {
        store,
        sessions,
        session: rotated.session,
        result,

        advance: milliseconds => {
            clock += milliseconds;
        }
    };
}

test('validated TOTP evidence creates a session-bound proof', () => {
    const data = setup();

    const record = data.store.save(
        data.session,
        data.result
    );

    assert.equal(record.sessionId, data.session.id);
    assert.equal(record.attemptId, data.result.attempt.id);
    assert.equal(record.identity.subject, 'test-account');
    assert.equal(record.evidence.method, 'totp');
    assert.equal(record.evidence.action, 'view');
    assert.equal(record.evidence.authorized, false);

    assert.ok(Object.isFrozen(record));
    assert.ok(Object.isFrozen(record.evidence));
    assert.ok(Object.isFrozen(record.evidence.factors));
    assert.ok(Object.isFrozen(record.evidence.roles));
});

test('pending face evidence cannot be claimed', () => {
    const data = setup('face');

    data.store.save(data.session, data.result);

    assert.equal(
        data.store.get(data.session).evidence.status,
        'pending_face'
    );

    assert.equal(
        data.store.claim(data.session),
        null
    );
});

test('mismatched account identity is rejected', () => {
    const data = setup();

    data.result.evidence.subject = 'another-account';

    assert.throws(
        () => data.store.save(data.session, data.result),
        /Authentication evidence mismatch/
    );
});

test('changing the original action is rejected', () => {
    const data = setup();

    data.result.evidence.action = 'admin';

    assert.throws(
        () => data.store.save(data.session, data.result),
        /Authentication evidence mismatch/
    );
});

test('incomplete TOTP authentication is rejected', () => {
    const data = setup();

    data.result.evidence.factors.totpVerified = false;

    assert.throws(
        () => data.store.save(data.session, data.result),
        /TOTP verification incomplete/
    );
});

test('regular user cannot create an admin proof', () => {
    const data = setup('totp', 'admin');

    data.result.evidence.roles = ['regular_user'];

    assert.throws(
        () => data.store.save(data.session, data.result),
        /Insufficient proof role/
    );
});

test('another session cannot access or consume a proof', () => {
    const data = setup();

    data.store.save(data.session, data.result);

    const claimed = data.store.claim(data.session);

    const other = data.sessions.create().session;

    assert.equal(data.store.get(other), null);
    assert.equal(data.store.claim(other), null);
    assert.equal(data.store.consume(other, claimed), null);

    assert.equal(
        data.store.isClaimCurrent(data.session, claimed),
        true
    );
});

test('only one concurrent claim is permitted', () => {
    const data = setup();

    data.store.save(data.session, data.result);

    assert.ok(data.store.claim(data.session));

    assert.equal(
        data.store.claim(data.session),
        null
    );
});

test('a proof can be consumed only once', () => {
    const data = setup();

    data.store.save(data.session, data.result);

    const claimed = data.store.claim(data.session);

    assert.ok(
        data.store.consume(data.session, claimed)
    );

    assert.equal(
        data.store.consume(data.session, claimed),
        null
    );

    assert.equal(data.store.claim(data.session), null);
    assert.equal(data.store.get(data.session), null);
});

test('revocation invalidates a claimed proof', () => {
    const data = setup();

    data.store.save(data.session, data.result);

    const claimed = data.store.claim(data.session);

    data.store.revoke(data.session.id);

    assert.equal(
        data.store.isClaimCurrent(data.session, claimed),
        false
    );

    assert.equal(
        data.store.consume(data.session, claimed),
        null
    );
});

test('expired proofs cannot be consumed', () => {
    const data = setup();

    data.store.save(data.session, data.result);

    const claimed = data.store.claim(data.session);

    data.advance(300001);

    assert.equal(
        data.store.consume(data.session, claimed),
        null
    );

    assert.equal(data.store.get(data.session), null);
});

test('proof cannot extend the original attempt lifetime', () => {
    const data = setup();

    data.result.evidence.expiresAt += 600000;

    const record = data.store.save(
        data.session,
        data.result
    );

    assert.equal(
        record.evidence.expiresAt,
        data.result.attempt.expiresAt
    );
});

test('an existing proof cannot be silently replaced', () => {
    const data = setup();

    data.store.save(data.session, data.result);

    assert.throws(
        () => data.store.save(data.session, data.result),
        /Proof already exists/
    );
});

test('proof store enforces its capacity limit', () => {
    const data = setup('totp', 'view', {
        maxRecords: 1
    });

    data.store.save(data.session, data.result);

    const other = setup();

    assert.throws(
        () => data.store.save(
            other.session,
            other.result
        ),
        /Proof capacity reached/
    );
});
