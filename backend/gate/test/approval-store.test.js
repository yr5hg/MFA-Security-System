import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createApprovalStore
} from '../src/approval-store.js';

const issuer = 'https://id.test/realms/lab';

const admin = {
    issuer,
    subject: 'administrator-account'
};

const owner = {
    issuer,
    subject: 'owner-account'
};

const other = {
    issuer,
    subject: 'other-account'
};

function setup(options = {}) {
    let time = 1000000;

    const store = createApprovalStore({
        issuer,
        now: () => time,
        ...options
    });

    function issue(overrides = {}) {
        return store.issue({
            approver: admin,
            target: owner,
            operation: 'enroll',
            referenceVersion: 0,
            ...overrides
        });
    }

    return {
        store,
        issue,

        advance(milliseconds) {
            time += milliseconds;
        }
    };
}

test('approval is account-bound and expires after ten minutes', () => {
    const { store, issue } = setup();

    const approval = issue();

    assert.equal(approval.subject, owner.subject);
    assert.equal(approval.approvedBy, admin.subject);
    assert.equal(approval.operation, 'enroll');
    assert.equal(approval.referenceVersion, 0);

    assert.equal(
        approval.expiresAt - approval.createdAt,
        600000
    );

    assert.ok(Object.isFrozen(approval));

    assert.equal(store.get(owner), approval);
    assert.equal(store.get(other), null);
});

test('invalid approval requests and self-approval are rejected', () => {
    const { issue } = setup();

    for (const overrides of [
        { target: admin },
        { operation: 'delete' },
        { referenceVersion: -1 },
        { operation: 'replace', referenceVersion: 0 },
        { target: { issuer, subject: '' } },

        {
            target: {
                issuer: 'https://untrusted.test',
                subject: owner.subject
            }
        }
    ]) {
        assert.throws(
            () => issue(overrides),
            /Invalid approval request/
        );
    }
});

test('existing approval cannot be silently overwritten', () => {
    const { store, issue } = setup();

    const first = issue();

    assert.equal(issue(), null);
    assert.equal(store.get(owner), first);
});

test('approval cannot be claimed by wrong identity operation or version', () => {
    const { store, issue } = setup();

    issue({
        operation: 'replace',
        referenceVersion: 3
    });

    assert.equal(
        store.claim(other, 'replace', 3),
        null
    );

    assert.equal(
        store.claim(owner, 'enroll', 3),
        null
    );

    assert.equal(
        store.claim(owner, 'replace', 2),
        null
    );

    assert.ok(
        store.claim(owner, 'replace', 3)
    );
});

test('approval is claimable and consumable only once', () => {
    const { store, issue } = setup();

    const approval = issue();

    const claimed = store.claim(
        owner,
        'enroll',
        0
    );

    assert.ok(claimed);

    assert.equal(
        store.claim(owner, 'enroll', 0),
        null
    );

    assert.equal(store.get(owner), null);

    assert.equal(
        store.consume(other, claimed),
        null
    );

    assert.equal(
        store.consume(owner, claimed),
        approval
    );

    assert.equal(
        store.consume(owner, claimed),
        null
    );
});

test('expired approval cannot be consumed even after claiming', () => {
    const { store, issue, advance } = setup();

    issue();

    const claimed = store.claim(
        owner,
        'enroll',
        0
    );

    advance(600000);

    assert.equal(
        store.isClaimCurrent(owner, claimed),
        false
    );

    assert.equal(
        store.consume(owner, claimed),
        null
    );

    assert.equal(store.get(owner), null);

    assert.ok(issue());
});

test('revoked approval cannot consume a newer replacement approval', () => {
    const { store, issue } = setup();

    issue();

    const oldClaim = store.claim(
        owner,
        'enroll',
        0
    );

    assert.equal(store.revoke(owner), true);

    const newer = issue();

    assert.equal(
        store.consume(owner, oldClaim),
        null
    );

    assert.equal(store.get(owner), newer);
});

test('approval capacity is limited and expired entries release capacity', () => {
    const { issue, advance } = setup({
        maxApprovals: 1
    });

    issue();

    assert.throws(
        () => issue({ target: other }),
        /Approval capacity reached/
    );

    advance(600000);

    assert.ok(issue({ target: other }));
});
