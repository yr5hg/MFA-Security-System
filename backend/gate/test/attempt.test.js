import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createSessionStore } from '../src/session.js';
import { createAttemptStore } from '../src/attempt.js';

function newSession() {
    return createSessionStore().create().session;
}

test('valid authentication attempt is created', () => {
    const store = createAttemptStore();
    const session = newSession();

    const attempt = store.create(
        session,
        'totp',
        'view'
    );

    assert.equal(attempt.method, 'totp');
    assert.equal(attempt.action, 'view');
    assert.equal(attempt.sessionId, session.id);
    assert.equal(attempt.status, 'pending_oidc');
    assert.equal(attempt.state.length, 43);
    assert.equal(attempt.nonce.length, 43);
    assert.equal(attempt.codeVerifier.length, 43);

    assert.equal(
        attempt.expiresAt - attempt.createdAt,
        300000
    );
});

test('PKCE challenge uses SHA-256 and Base64URL', () => {
    const store = createAttemptStore();

    const attempt = store.create(
        newSession(),
        'face',
        'view'
    );

    const expected = createHash('sha256')
        .update(attempt.codeVerifier)
        .digest('base64url');

    assert.equal(attempt.codeChallenge, expected);
    assert.notEqual(
        attempt.codeChallenge,
        attempt.codeVerifier
    );
});

test('invalid methods actions and sessions are rejected', () => {
    const store = createAttemptStore();
    const session = newSession();

    assert.throws(
        () => store.create(session, 'password', 'view'),
        /Invalid authentication method/
    );

    assert.throws(
        () => store.create(session, 'totp', 'delete'),
        /Invalid protected action/
    );

    assert.throws(
        () => store.create(null, 'totp', 'view'),
        /Invalid or expired session/
    );
});

test('different sessions have independent attempts', () => {
    const store = createAttemptStore();

    const first = newSession();
    const second = newSession();

    const a = store.create(first, 'totp', 'view');
    const b = store.create(second, 'face', 'admin');

    assert.notEqual(a.id, b.id);
    assert.notEqual(a.state, b.state);
    assert.notEqual(a.nonce, b.nonce);
    assert.notEqual(a.codeVerifier, b.codeVerifier);

    assert.equal(
        store.getStatus(first.id).method,
        'totp'
    );

    assert.equal(
        store.getStatus(second.id).method,
        'face'
    );
});

test('method switching invalidates the previous attempt', () => {
    const store = createAttemptStore();
    const session = newSession();

    const previous = store.create(
        session,
        'totp',
        'view'
    );

    const current = store.create(
        session,
        'face',
        'view'
    );

    assert.notEqual(previous.id, current.id);

    assert.equal(
        store.claimCallback(
            session.id,
            'totp',
            previous.state
        ),
        null
    );

    assert.equal(
        store.getStatus(session.id).method,
        'face'
    );
});

test('expired attempts are rejected', () => {
    let currentTime = 1000000;
    const clock = () => currentTime;

    const session = createSessionStore({
        now: clock
    }).create().session;

    const store = createAttemptStore({
        now: clock
    });

    const attempt = store.create(
        session,
        'totp',
        'view'
    );

    currentTime += 300000;

    assert.equal(store.getStatus(session.id), null);

    assert.equal(
        store.claimCallback(
            session.id,
            'totp',
            attempt.state
        ),
        null
    );
});

test('attempt cannot outlive its originating session', () => {
    let currentTime = 1000000;
    const clock = () => currentTime;

    const session = createSessionStore({
        ttlSeconds: 30,
        now: clock
    }).create().session;

    const store = createAttemptStore({
        now: clock
    });

    const attempt = store.create(
        session,
        'face',
        'view'
    );

    assert.equal(
        attempt.expiresAt,
        session.expiresAt
    );

    currentTime += 30000;

    assert.equal(store.getStatus(session.id), null);
});

test('incorrect callback state is rejected', () => {
    const store = createAttemptStore();
    const session = newSession();

    store.create(session, 'totp', 'view');

    assert.equal(
        store.claimCallback(
            session.id,
            'totp',
            'invalid'
        ),
        null
    );
});

test('callback cannot switch sessions or methods', () => {
    const store = createAttemptStore();

    const owner = newSession();
    const other = newSession();

    const attempt = store.create(
        owner,
        'totp',
        'view'
    );

    assert.equal(
        store.claimCallback(
            other.id,
            'totp',
            attempt.state
        ),
        null
    );

    assert.equal(
        store.claimCallback(
            owner.id,
            'face',
            attempt.state
        ),
        null
    );
});

test('valid callback is accepted only once', () => {
    const store = createAttemptStore();
    const session = newSession();

    const attempt = store.create(
        session,
        'totp',
        'view'
    );

    const claimed = store.claimCallback(
        session.id,
        'totp',
        attempt.state
    );

    assert.equal(claimed.id, attempt.id);

    assert.equal(
        store.getStatus(session.id).status,
        'callback_claimed'
    );

    assert.equal(
        store.claimCallback(
            session.id,
            'totp',
            attempt.state
        ),
        null
    );
});

test('cancellation invalidates a claimed callback', () => {
    const store = createAttemptStore();
    const session = newSession();

    const attempt = store.create(
        session,
        'totp',
        'view'
    );

    store.claimCallback(
        session.id,
        'totp',
        attempt.state
    );

    assert.equal(
        store.isClaimCurrent(session.id, attempt.id),
        true
    );

    assert.equal(store.cancel(session.id), true);

    assert.equal(store.getStatus(session.id), null);

    assert.equal(
        store.isClaimCurrent(session.id, attempt.id),
        false
    );
});

test('attempt capacity is limited', () => {
    const store = createAttemptStore({
        maxAttempts: 1
    });

    const first = newSession();
    const second = newSession();

    store.create(first, 'totp', 'view');

    assert.throws(
        () => store.create(second, 'face', 'view'),
        /Attempt capacity reached/
    );

    // Replacing the current attempt is permitted.
    assert.doesNotThrow(
        () => store.create(first, 'face', 'view')
    );

    store.cancel(first.id);

    assert.doesNotThrow(
        () => store.create(second, 'totp', 'view')
    );
});

test('public attempt status contains no OIDC secrets', () => {
    const store = createAttemptStore();
    const session = newSession();

    store.create(session, 'face', 'view');

    const status = store.getStatus(session.id);

    assert.deepEqual(
        Object.keys(status).sort(),
        ['action', 'expiresAt', 'method', 'status']
    );

    assert.equal(status.state, undefined);
    assert.equal(status.nonce, undefined);
    assert.equal(status.codeVerifier, undefined);
    assert.equal(status.sessionId, undefined);
});
