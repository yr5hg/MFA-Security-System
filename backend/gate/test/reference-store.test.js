import test from 'node:test';
import assert from 'node:assert/strict';

import {
    mkdtempSync,
    rmSync,
    readFileSync,
    writeFileSync,
    readdirSync,
    statSync,
    chmodSync,
    symlinkSync,
    copyFileSync
} from 'node:fs';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import {
    createReferenceStore
} from '../src/reference-store.js';

import verifierPolicy from
    '../../face-verifier/src/verification-policy.js';

const {
    POLICY,
    validReference
} = verifierPolicy;

const ISSUER =
    'https://id.test:8443/realms/multi-factor-authentication';

function identity(subject = 'account-a') {
    return {
        issuer: ISSUER,
        subject
    };
}

function reference(value = 1) {
    return {
        policyVersion: POLICY.version,
        descriptor: Array(
            POLICY.descriptorLength
        ).fill(value)
    };
}

function setup(t) {
    const privateStateDir = mkdtempSync(
        join(tmpdir(), 'mfa-reference-test-')
    );

    chmodSync(privateStateDir, 0o700);

    const options = {
        privateStateDir,
        issuer: ISSUER,
        policyVersion: POLICY.version,
        validateReference: validReference
    };

    const store = createReferenceStore(options);

    const directory = join(
        privateStateDir,
        'references'
    );

    function fileFor(account) {
        const key = createHash('sha256')
            .update(JSON.stringify([
                account.issuer,
                account.subject
            ]))
            .digest('hex');

        return join(directory, `${key}.json`);
    }

    t.after(() => {
        rmSync(privateStateDir, {
            recursive: true,
            force: true
        });
    });

    return {
        store,
        options,
        directory,
        privateStateDir,
        fileFor
    };
}

test('unenrolled account has no active reference', t => {
    const { store } = setup(t);

    const result = store.get(identity());

    assert.equal(result.version, 0);
    assert.equal(result.reference, null);

    assert.equal(
        store.isCurrent(identity(), 0),
        false
    );
});

test('reference persists across store recreation', t => {
    const { store, options } = setup(t);

    const result = store.save(
        identity(),
        reference(),
        0
    );

    assert.equal(result.version, 1);

    const reopened = createReferenceStore(options);

    const stored = reopened.get(identity());

    assert.equal(stored.version, 1);

    assert.deepEqual(
        stored.reference,
        reference()
    );
});

test('different accounts have independent references', t => {
    const { store } = setup(t);

    store.save(
        identity('account-a'),
        reference(1),
        0
    );

    store.save(
        identity('account-b'),
        reference(2),
        0
    );

    assert.equal(
        store.get(identity('account-a'))
            .reference.descriptor[0],
        1
    );

    assert.equal(
        store.get(identity('account-b'))
            .reference.descriptor[0],
        2
    );

    assert.equal(
        store.get(identity('account-c'))
            .reference,
        null
    );
});

test('unexpected issuer is rejected', t => {
    const { store } = setup(t);

    assert.throws(
        () => store.get({
            issuer: 'https://untrusted.test',
            subject: 'account-a'
        }),
        /Invalid reference identity/
    );
});

test('invalid account subject is rejected', t => {
    const { store } = setup(t);

    assert.throws(
        () => store.get(identity('')),
        /Invalid reference identity/
    );

    assert.throws(
        () => store.get(identity('   ')),
        /Invalid reference identity/
    );
});

test('malformed descriptor cannot be stored', t => {
    const { store } = setup(t);

    for (const descriptor of [
        [1, 2, 3],
        Array(1024).fill(0),
        Array(1024).fill(NaN)
    ]) {
        assert.throws(
            () => store.save(
                identity(),
                {
                    policyVersion: POLICY.version,
                    descriptor
                },
                0
            ),
            /Invalid biometric reference/
        );
    }

    assert.equal(
        store.get(identity()).version,
        0
    );
});

test('incompatible biometric policy is rejected', t => {
    const { store } = setup(t);

    assert.throws(
        () => store.save(
            identity(),
            {
                ...reference(),
                policyVersion: 'old-policy'
            },
            0
        ),
        /Invalid biometric reference/
    );
});

test('stale version cannot overwrite an existing reference', t => {
    const { store } = setup(t);

    store.save(identity(), reference(1), 0);

    assert.throws(
        () => store.save(
            identity(),
            reference(2),
            0
        ),
        /Reference version conflict/
    );

    assert.equal(
        store.get(identity())
            .reference.descriptor[0],
        1
    );
});

test('replacement advances version and invalidates old reference', t => {
    const { store } = setup(t);

    store.save(identity(), reference(1), 0);

    const replaced = store.save(
        identity(),
        reference(2),
        1
    );

    assert.equal(replaced.version, 2);

    assert.equal(
        replaced.reference.descriptor[0],
        2
    );

    assert.equal(
        store.isCurrent(identity(), 1),
        false
    );

    assert.equal(
        store.isCurrent(identity(), 2),
        true
    );
});

test('removing a reference deletes its stored descriptor', t => {
    const { store, fileFor } = setup(t);

    store.save(identity(), reference(), 0);

    const removed = store.remove(
        identity(),
        1
    );

    assert.equal(removed.version, 2);
    assert.equal(removed.reference, null);

    const stored = JSON.parse(
        readFileSync(fileFor(identity()), 'utf8')
    );

    assert.equal(stored.reference, null);

    assert.equal(
        store.isCurrent(identity(), 1),
        false
    );

    assert.equal(
        store.isCurrent(identity(), 2),
        false
    );
});

test('reenrollment cannot reuse an old reference version', t => {
    const { store } = setup(t);

    store.save(identity(), reference(), 0);

    store.remove(identity(), 1);

    const enrolled = store.save(
        identity(),
        reference(2),
        2
    );

    assert.equal(enrolled.version, 3);

    assert.equal(
        store.isCurrent(identity(), 1),
        false
    );

    assert.equal(
        store.isCurrent(identity(), 3),
        true
    );
});

test('private directory and reference file have restrictive permissions', t => {
    const { store, directory, fileFor } = setup(t);

    store.save(identity(), reference(), 0);

    assert.equal(
        statSync(directory).mode & 0o777,
        0o700
    );

    assert.equal(
        statSync(fileFor(identity())).mode & 0o777,
        0o600
    );

    assert.equal(
        readdirSync(directory).length,
        1
    );
});

test('symbolic link reference file is rejected', t => {
    const { store, directory, fileFor } = setup(t);

    const target = join(directory, 'other.json');

    writeFileSync(target, '{}', {
        mode: 0o600
    });

    symlinkSync(
        target,
        fileFor(identity())
    );

    assert.throws(
        () => store.get(identity()),
        /Reference storage unavailable/
    );
});

test('corrupted reference file fails closed', t => {
    const { store, fileFor } = setup(t);

    store.save(identity(), reference(), 0);

    writeFileSync(
        fileFor(identity()),
        'invalid-json'
    );

    assert.throws(
        () => store.get(identity()),
        /Corrupted or unsafe reference record/
    );
});

test('insecure reference directory permissions are rejected', t => {
    const { store, directory } = setup(t);

    chmodSync(directory, 0o755);

    assert.throws(
        () => store.get(identity()),
        /Unsafe reference directory/
    );
});

test('copied reference cannot impersonate another account', t => {
    const { store, fileFor } = setup(t);

    const first = identity('account-a');
    const second = identity('account-b');

    store.save(first, reference(), 0);

    copyFileSync(
        fileFor(first),
        fileFor(second)
    );

    chmodSync(fileFor(second), 0o600);

    assert.throws(
        () => store.get(second),
        /Corrupted or unsafe reference record/
    );
});

test('only required biometric fields are persisted', t => {
    const { store, fileFor } = setup(t);

    const input = {
        ...reference(),
        image: 'synthetic-image-placeholder',
        similarity: 0.90
    };

    const saved = store.save(
        identity(),
        input,
        0
    );

    input.descriptor[0] = 99;

    assert.equal(
        saved.reference.descriptor[0],
        1
    );

    assert.ok(
        Object.isFrozen(
            saved.reference.descriptor
        )
    );

    const stored = JSON.parse(
        readFileSync(fileFor(identity()), 'utf8')
    );

    assert.deepEqual(
        Object.keys(stored.reference).sort(),
        ['descriptor', 'policyVersion']
    );
});
