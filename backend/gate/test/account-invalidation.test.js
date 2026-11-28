import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createSessionStore
} from '../src/session.js';

import {
    createAttemptStore
} from '../src/attempt.js';

import {
    createProofStore
} from '../src/proof.js';

import {
    createApprovalStore
} from '../src/approval-store.js';

import {
    invalidateAccount
} from '../src/account-invalidation.js';

const issuer = 'https://id.test/realms/lab';

const owner = {
    issuer,
    subject: 'owner-account'
};

const other = {
    issuer,
    subject: 'other-account'
};

const admin = {
    issuer,
    subject: 'administrator-account'
};

test('verified session account binding is immutable', () => {
    const sessions = createSessionStore();

    const anonymous = sessions.create();

    assert.equal(anonymous.session.account, null);

    const identity = { ...owner };

    const authenticated = sessions.rotate(
        anonymous.token,
        identity
    );

    assert.equal(
        sessions.get(anonymous.token),
        null
    );

    assert.deepEqual(
        authenticated.session.account,
        owner
    );

    assert.ok(
        Object.isFrozen(
            authenticated.session.account
        )
    );

    identity.subject = 'changed-account';

    assert.equal(
        authenticated.session.account.subject,
        owner.subject
    );
});

test('account revocation invalidates all matching sessions only', () => {
    const sessions = createSessionStore();

    const first = sessions.create(owner);
    const second = sessions.create(owner);
    const unrelated = sessions.create(other);
    const anonymous = sessions.create();

    const differentIssuer = sessions.create({
        issuer: 'https://different.test/realms/lab',
        subject: owner.subject
    });

    const revoked = sessions.revokeAccount(owner);

    assert.deepEqual(
        new Set(revoked),
        new Set([
            first.session.id,
            second.session.id
        ])
    );

    assert.equal(sessions.get(first.token), null);
    assert.equal(sessions.get(second.token), null);

    assert.ok(sessions.get(unrelated.token));
    assert.ok(sessions.get(anonymous.token));
    assert.ok(sessions.get(differentIssuer.token));
});

test('session rotation preserves or updates verified account binding', () => {
    const sessions = createSessionStore();

    const initial = sessions.create(owner);

    const preserved = sessions.rotate(
        initial.token
    );

    assert.deepEqual(
        preserved.session.account,
        owner
    );

    const switched = sessions.rotate(
        preserved.token,
        other
    );

    assert.deepEqual(
        switched.session.account,
        other
    );

    assert.equal(
        sessions.revokeAccount(owner).length,
        0
    );

    assert.ok(sessions.get(switched.token));

    assert.equal(
        sessions.revokeAccount(other).length,
        1
    );

    assert.equal(
        sessions.get(switched.token),
        null
    );
});

test('invalid identity cannot revoke unrelated sessions', () => {
    const sessions = createSessionStore();

    const existing = sessions.create(owner);

    for (const identity of [
        null,
        undefined,
        {},
        { issuer, subject: '' },
        { issuer: '', subject: owner.subject }
    ]) {
        assert.throws(
            () => sessions.revokeAccount(identity),
            /Invalid session account identity/
        );
    }

    assert.ok(
        sessions.get(existing.token)
    );
});

test('account invalidation clears affected sessions and proofs', () => {
    const sessions = createSessionStore();
    const attempts = createAttemptStore();
    const proofs = createProofStore();

    const approvals = createApprovalStore({
        issuer
    });

    function createAuthenticatedProof(account) {
        const created = sessions.create(account);

        const attempt = attempts.create(
            created.session,
            'totp',
            'view'
        );

        attempts.cancel(created.session.id);

        proofs.save(created.session, {
            status: 'identity_validated',
            authorized: false,
            session: created.session,

            identity: {
                ...account,
                authTime: Math.floor(
                    Date.now() / 1000
                )
            },

            attempt,

            evidence: {
                issuer: account.issuer,
                subject: account.subject,
                method: 'totp',
                action: 'view',
                status: 'totp_verified',
                authorized: false,
                roles: ['regular_user'],

                factors: {
                    passwordVerified: true,
                    totpVerified: true,
                    faceVerified: false
                },

                expiresAt: attempt.expiresAt
            },

            accessToken: 'synthetic-access-token',
            idToken: 'synthetic-id-token'
        });

        return created;
    }

    const first = createAuthenticatedProof(owner);
    const second = sessions.create(owner);
    const unrelated = createAuthenticatedProof(other);
    const anonymous = sessions.create();

    const pending = attempts.create(
        anonymous.session,
        'face',
        'view'
    );

    const claimed = proofs.claim(first.session);

    assert.ok(claimed);

    approvals.issue({
        approver: admin,
        target: owner,
        operation: 'enroll',
        referenceVersion: 0
    });

    const result = invalidateAccount({
        sessions,
        attempts,
        proofs,
        approvals
    }, owner);

    assert.deepEqual(result, {
        revokedSessions: 2,
        revokedProofs: 1,
        cancelledAttempts: 1,
        revokedApprovals: 1
    });

    assert.equal(
        sessions.get(first.token),
        null
    );

    assert.equal(
        sessions.get(second.token),
        null
    );

    assert.equal(
        proofs.get(first.session),
        null
    );

    assert.equal(
        proofs.isClaimCurrent(
            first.session,
            claimed
        ),
        false
    );

    assert.equal(
        approvals.get(owner),
        null
    );

    assert.equal(
        attempts.claimCallback(
            anonymous.session.id,
            'face',
            pending.state
        ),
        null
    );

    // Unrelated authenticated sessions and proofs
    // must remain valid.
    assert.ok(sessions.get(unrelated.token));
    assert.ok(proofs.get(unrelated.session));
    assert.ok(sessions.get(anonymous.token));
});

test('account invalidation revokes approvals issued and received', () => {
    const approvals = createApprovalStore({
        issuer
    });

    const fourth = {
        issuer,
        subject: 'fourth-account'
    };

    approvals.issue({
        approver: admin,
        target: owner,
        operation: 'enroll',
        referenceVersion: 0
    });

    approvals.issue({
        approver: owner,
        target: other,
        operation: 'replace',
        referenceVersion: 1
    });

    const unrelated = approvals.issue({
        approver: admin,
        target: fourth,
        operation: 'enroll',
        referenceVersion: 0
    });

    const claimed = approvals.claim(
        other,
        'replace',
        1
    );

    assert.ok(claimed);

    assert.equal(
        approvals.revokeForAccount(owner),
        2
    );

    assert.equal(approvals.get(owner), null);

    assert.equal(
        approvals.isClaimCurrent(other, claimed),
        false
    );

    assert.equal(
        approvals.consume(other, claimed),
        null
    );

    assert.equal(
        approvals.get(fourth),
        unrelated
    );
});
