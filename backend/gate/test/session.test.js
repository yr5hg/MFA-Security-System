import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createSessionStore,
    buildSessionCookie,
    clearSessionCookie,
    readSessionCookie,
    verifyCsrf,
    verifySameOrigin
} from '../src/session.js';

test('session creation and retrieval work', () => {
    const store = createSessionStore();
    const { token, session } = store.create();

    assert.equal(token.length, 43);
    assert.equal(session.id.length, 64);
    assert.notEqual(session.id, token);
    assert.equal(store.get(token), session);
});

test('sessions have unique tokens and CSRF tokens', () => {
    const store = createSessionStore();

    const first = store.create();
    const second = store.create();

    assert.notEqual(first.token, second.token);

    assert.notEqual(
        first.session.csrfToken,
        second.session.csrfToken
    );
});

test('unknown or malformed sessions are rejected', () => {
    const store = createSessionStore();

    assert.equal(store.get('invalid'), null);
    assert.equal(store.get(null), null);
    assert.equal(store.get('A'.repeat(43)), null);
});

test('expired sessions are rejected', () => {
    let currentTime = 1000000;

    const store = createSessionStore({
        ttlSeconds: 10,
        now: () => currentTime
    });

    const { token } = store.create();

    assert.notEqual(store.get(token), null);

    currentTime += 10000;

    assert.equal(store.get(token), null);
});

test('revoked sessions cannot be reused', () => {
    const store = createSessionStore();
    const { token } = store.create();

    assert.equal(store.revoke(token), true);
    assert.equal(store.get(token), null);
});

test('session rotation invalidates the old token', () => {
    const store = createSessionStore();

    const original = store.create();
    const rotated = store.rotate(original.token);

    assert.notEqual(rotated.token, original.token);
    assert.equal(store.get(original.token), null);
    assert.notEqual(store.get(rotated.token), null);

    assert.notEqual(
        original.session.csrfToken,
        rotated.session.csrfToken
    );

    assert.equal(store.rotate(original.token), null);
});

test('session capacity is limited', () => {
    const store = createSessionStore({
        maxSessions: 1
    });

    store.create();

    assert.throws(
        () => store.create(),
        /Session capacity reached/
    );
});

test('session cookies include required security flags', () => {
    const store = createSessionStore();
    const { token } = store.create();

    const cookie = buildSessionCookie(token);

    assert.ok(cookie.startsWith('__Host-mfa_session='));
    assert.ok(cookie.includes('HttpOnly'));
    assert.ok(cookie.includes('Secure'));
    assert.ok(cookie.includes('SameSite=Lax'));
    assert.ok(cookie.includes('Path=/'));
    assert.ok(cookie.includes('Max-Age=900'));
    assert.ok(!cookie.includes('Domain='));
});

test('cookie parser accepts only a valid session cookie', () => {
    const store = createSessionStore();
    const { token } = store.create();

    assert.equal(
        readSessionCookie(
            `theme=dark; __Host-mfa_session=${token}`
        ),
        token
    );

    assert.equal(
        readSessionCookie('__Host-mfa_session=invalid'),
        null
    );

    assert.equal(readSessionCookie(undefined), null);
});

test('duplicate session cookies are rejected', () => {
    const store = createSessionStore();
    const { token } = store.create();

    assert.equal(
        readSessionCookie(
            `__Host-mfa_session=${token}; __Host-mfa_session=${token}`
        ),
        null
    );
});

test('logout cookie removes the browser session', () => {
    const cookie = clearSessionCookie();

    assert.ok(cookie.startsWith('__Host-mfa_session=;'));
    assert.ok(cookie.includes('Max-Age=0'));
    assert.ok(cookie.includes('Secure'));
    assert.ok(cookie.includes('HttpOnly'));
});

test('CSRF verification accepts only the matching token', () => {
    const store = createSessionStore();

    const first = store.create();
    const second = store.create();

    assert.equal(
        verifyCsrf(first.session, first.session.csrfToken),
        true
    );

    assert.equal(
        verifyCsrf(first.session, second.session.csrfToken),
        false
    );

    assert.equal(verifyCsrf(first.session, undefined), false);
    assert.equal(verifyCsrf(null, 'invalid'), false);
});

test('requests from unauthorized origins are rejected', () => {
    const expected = 'https://gate.test:8444';

    assert.equal(
        verifySameOrigin(expected, expected),
        true
    );

    assert.equal(
        verifySameOrigin('https://attacker.test', expected),
        false
    );

    assert.equal(
        verifySameOrigin('http://gate.test:8444', expected),
        false
    );

    assert.equal(
        verifySameOrigin(undefined, expected),
        false
    );
});

test('expired sessions release session capacity', () => {
    let currentTime = 1000000;

    const store = createSessionStore({
        ttlSeconds: 10,
        maxSessions: 1,
        now: () => currentTime
    });

    store.create();

    currentTime += 10000;

    assert.doesNotThrow(() => store.create());
});
