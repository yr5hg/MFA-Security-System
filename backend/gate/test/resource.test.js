import test from 'node:test';
import assert from 'node:assert/strict';

import {
    mkdtempSync,
    writeFileSync,
    rmSync,
    symlinkSync
} from 'node:fs';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import {
    createProtectedOperations
} from '../src/resource.js';

const CONTENT = 'CONFIDENTIAL TEST RESOURCE';

function setup(t) {
    const directory = mkdtempSync(
        join(tmpdir(), 'mfa-resource-test-')
    );

    const resourceFile = join(
        directory,
        'confidential.txt'
    );

    writeFileSync(resourceFile, CONTENT, {
        mode: 0o600
    });

    t.after(() => {
        rmSync(directory, {
            recursive: true,
            force: true
        });
    });

    return {
        directory,
        resourceFile,

        operations: createProtectedOperations({
            resourceFile
        })
    };
}

function proof(
    action = 'view',
    roles = ['regular_user']
) {
    return {
        evidence: {
            method: 'totp',
            action,
            status: 'totp_verified',

            roles,

            factors: {
                passwordVerified: true,
                totpVerified: true,
                faceVerified: false
            },

            expiresAt: Date.now() + 300000
        }
    };
}

test('regular user can read protected resource', t => {
    const { operations } = setup(t);

    const result = operations.execute(
        proof(),
        ['regular_user']
    );

    assert.equal(result.status, 'executed');
    assert.equal(result.action, 'view');
    assert.equal(result.content, CONTENT);
});

test('administrator can read protected resource', t => {
    const { operations } = setup(t);

    const result = operations.execute(
        proof('view', ['administrator']),
        ['administrator']
    );

    assert.equal(result.content, CONTENT);
});

test('administrator can inspect resource integrity', t => {
    const { operations } = setup(t);

    const result = operations.execute(
        proof('admin', ['administrator']),
        ['administrator']
    );

    const expectedDigest = createHash('sha256')
        .update(CONTENT)
        .digest('hex');

    assert.equal(result.status, 'executed');
    assert.equal(result.action, 'admin');

    assert.equal(
        result.resourceIntegrity.algorithm,
        'SHA-256'
    );

    assert.equal(
        result.resourceIntegrity.digest,
        expectedDigest
    );

    assert.equal(
        result.resourceIntegrity.sizeBytes,
        Buffer.byteLength(CONTENT)
    );

    assert.equal(result.content, undefined);
});

test('regular user cannot execute admin operation', t => {
    const { operations } = setup(t);

    assert.throws(
        () => operations.execute(
            proof('admin', ['regular_user']),
            ['regular_user']
        ),
        /Insufficient application role/
    );
});

test('removed administrator role prevents execution', t => {
    const { operations } = setup(t);

    assert.throws(
        () => operations.execute(
            proof('admin', ['administrator']),
            ['regular_user']
        ),
        /Insufficient application role/
    );
});

test('unknown protected action is rejected', t => {
    const { operations } = setup(t);

    assert.throws(
        () => operations.execute(
            proof('delete', ['administrator']),
            ['administrator']
        ),
        /Unsupported protected action/
    );
});

test('pending face authentication cannot execute', t => {
    const { operations } = setup(t);

    const record = proof();

    record.evidence.method = 'face';
    record.evidence.status = 'pending_face';
    record.evidence.factors.totpVerified = false;

    assert.throws(
        () => operations.execute(
            record,
            ['regular_user']
        ),
        /Authentication factors incomplete/
    );
});

test('expired proof cannot execute', t => {
    const { operations } = setup(t);

    const record = proof();

    record.evidence.expiresAt = Date.now() - 1;

    assert.throws(
        () => operations.execute(
            record,
            ['regular_user']
        ),
        /Authentication proof expired/
    );
});

test('missing protected resource fails closed', t => {
    const { operations, resourceFile } = setup(t);

    rmSync(resourceFile);

    assert.throws(
        () => operations.execute(
            proof(),
            ['regular_user']
        ),
        /Protected resource unavailable/
    );
});

test('symbolic link resource is rejected', t => {
    const { directory, resourceFile } = setup(t);

    const link = join(directory, 'resource-link');

    symlinkSync(resourceFile, link);

    const operations = createProtectedOperations({
        resourceFile: link
    });

    assert.throws(
        () => operations.execute(
            proof(),
            ['regular_user']
        ),
        /Protected resource unavailable/
    );
});

test('oversized protected resource is rejected', t => {
    const { operations, resourceFile } = setup(t);

    writeFileSync(
        resourceFile,
        Buffer.alloc(65537)
    );

    assert.throws(
        () => operations.execute(
            proof(),
            ['regular_user']
        ),
        /Protected resource unavailable/
    );
});

test('directory cannot be used as protected resource', t => {
    const { directory } = setup(t);

    const operations = createProtectedOperations({
        resourceFile: directory
    });

    assert.throws(
        () => operations.execute(
            proof(),
            ['regular_user']
        ),
        /Protected resource unavailable/
    );
});
