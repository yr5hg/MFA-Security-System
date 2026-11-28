import {
    openSync,
    closeSync,
    fstatSync,
    readSync,
    constants
} from 'node:fs';

import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

import { isActionAllowed } from './evidence.js';

const MAX_RESOURCE_BYTES = 65536;

export function createProtectedOperations({
    resourceFile
}) {
    if (
        typeof resourceFile !== 'string' ||
        !isAbsolute(resourceFile)
    ) {
        throw new Error('Invalid protected resource path');
    }

    function readResource() {
        let fd;

        try {
            fd = openSync(
                resourceFile,
                constants.O_RDONLY |
                constants.O_NOFOLLOW |
                constants.O_NONBLOCK
            );

            const stats = fstatSync(fd);

            if (
                !stats.isFile() ||
                stats.size > MAX_RESOURCE_BYTES
            ) {
                throw new Error('Invalid protected resource');
            }

            const buffer = Buffer.alloc(
                MAX_RESOURCE_BYTES + 1
            );

            let total = 0;

            while (total < buffer.length) {
                const count = readSync(
                    fd,
                    buffer,
                    total,
                    buffer.length - total,
                    null
                );

                if (count === 0) {
                    break;
                }

                total += count;
            }

            if (total > MAX_RESOURCE_BYTES) {
                throw new Error('Protected resource too large');
            }

            return buffer.subarray(0, total);

        } catch {
            throw new Error('Protected resource unavailable');

        } finally {
            if (fd !== undefined) {
                closeSync(fd);
            }
        }
    }

    function execute(record, currentRoles) {
        const evidence = record?.evidence;

        if (!evidence) {
            throw new Error('Missing authentication proof');
        }

        if (
            !Number.isSafeInteger(evidence.expiresAt) ||
            evidence.expiresAt <= Date.now()
        ) {
            throw new Error('Authentication proof expired');
        }

        // Only TOTP is supported for execution in Part 4.
        if (
            evidence.method !== 'totp' ||
            evidence.status !== 'totp_verified' ||
            evidence.factors?.passwordVerified !== true ||
            evidence.factors?.totpVerified !== true ||
            evidence.factors?.faceVerified !== false
        ) {
            throw new Error('Authentication factors incomplete');
        }

        const action = evidence.action;

        if (!['view', 'admin'].includes(action)) {
            throw new Error('Unsupported protected action');
        }

        // Require both the original and revalidated roles.
        if (
            !isActionAllowed(evidence.roles, action) ||
            !isActionAllowed(currentRoles, action)
        ) {
            throw new Error('Insufficient application role');
        }

        const content = readResource();

        if (action === 'view') {
            return Object.freeze({
                status: 'executed',
                action: 'view',
                content: content.toString('utf8')
            });
        }

        if (action === 'admin') {
            return Object.freeze({
                status: 'executed',
                action: 'admin',
                resourceIntegrity: Object.freeze({
                    algorithm: 'SHA-256',
                    digest: createHash('sha256')
                        .update(content)
                        .digest('hex'),
                    sizeBytes: content.length
                })
            });
        }

        throw new Error('Unsupported protected action');
    }

    return Object.freeze({
        execute
    });
}
