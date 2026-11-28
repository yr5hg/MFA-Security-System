import {
    mkdirSync,
    lstatSync,
    openSync,
    closeSync,
    fstatSync,
    readSync,
    writeFileSync,
    fsyncSync,
    renameSync,
    unlinkSync,
    constants
} from 'node:fs';

import {
    createHash,
    randomBytes
} from 'node:crypto';

import { join, isAbsolute } from 'node:path';

const MAX_RECORD_BYTES = 65536;

export function createReferenceStore({
    privateStateDir,
    issuer,
    policyVersion,
    validateReference
}) {
    if (
        typeof privateStateDir !== 'string' ||
        !isAbsolute(privateStateDir) ||
        typeof issuer !== 'string' ||
        !issuer ||
        typeof policyVersion !== 'string' ||
        !policyVersion ||
        typeof validateReference !== 'function'
    ) {
        throw new Error('Invalid reference store configuration');
    }

    const uid = process.getuid();

    const directory = join(
        privateStateDir,
        'references'
    );

    function requirePrivateDirectory(path) {
        const stats = lstatSync(path);

        if (
            !stats.isDirectory() ||
            stats.uid !== uid ||
            (stats.mode & 0o777) !== 0o700
        ) {
            throw new Error('Unsafe reference directory');
        }
    }

    requirePrivateDirectory(privateStateDir);

    try {
        mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }

    requirePrivateDirectory(directory);

    function accountKey(identity) {
        if (
            !identity ||
            identity.issuer !== issuer ||
            typeof identity.subject !== 'string' ||
            !identity.subject.trim() ||
            Buffer.byteLength(identity.subject) > 1024
        ) {
            throw new Error('Invalid reference identity');
        }

        return createHash('sha256')
            .update(JSON.stringify([
                identity.issuer,
                identity.subject
            ]))
            .digest('hex');
    }

    function filePath(identity) {
        return join(
            directory,
            `${accountKey(identity)}.json`
        );
    }

    function copyReference(reference) {
        if (
            !reference ||
            reference.policyVersion !== policyVersion ||
            !Array.isArray(reference.descriptor)
        ) {
            throw new Error('Invalid biometric reference');
        }

        const copy = {
            policyVersion,
            descriptor: [
                ...reference.descriptor
            ]
        };

        if (!validateReference(copy)) {
            throw new Error('Invalid biometric reference');
        }

        return Object.freeze({
            policyVersion,
            descriptor: Object.freeze(
                copy.descriptor
            )
        });
    }

    function emptyRecord(identity) {
        return Object.freeze({
            issuer: identity.issuer,
            subject: identity.subject,
            version: 0,
            reference: null
        });
    }

    function readRecord(identity) {
        const file = filePath(identity);

        requirePrivateDirectory(privateStateDir);
        requirePrivateDirectory(directory);

        let fd;

        try {
            fd = openSync(
                file,
                constants.O_RDONLY |
                constants.O_NOFOLLOW |
                constants.O_NONBLOCK
            );

        } catch (error) {
            if (error.code === 'ENOENT') {
                return emptyRecord(identity);
            }

            throw new Error('Reference storage unavailable');
        }

        try {
            const stats = fstatSync(fd);

            if (
                !stats.isFile() ||
                stats.uid !== uid ||
                stats.nlink !== 1 ||
                (stats.mode & 0o777) !== 0o600 ||
                stats.size <= 0 ||
                stats.size > MAX_RECORD_BYTES
            ) {
                throw new Error('Unsafe reference file');
            }

            const buffer = Buffer.alloc(
                MAX_RECORD_BYTES + 1
            );

            try {
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

                if (total > MAX_RECORD_BYTES) {
                    throw new Error('Reference file too large');
                }

                const parsed = JSON.parse(
                    buffer.subarray(0, total)
                        .toString('utf8')
                );

                if (
                    !parsed ||
                    parsed.issuer !== identity.issuer ||
                    parsed.subject !== identity.subject ||
                    !Number.isSafeInteger(parsed.version) ||
                    parsed.version < 1 ||
                    !Object.hasOwn(parsed, 'reference')
                ) {
                    throw new Error(
                        'Invalid reference record'
                    );
                }

                const reference = parsed.reference === null
                    ? null
                    : copyReference(parsed.reference);

                return Object.freeze({
                    issuer: parsed.issuer,
                    subject: parsed.subject,
                    version: parsed.version,
                    reference
                });

            } finally {
                buffer.fill(0);
            }

        } catch {
            throw new Error(
                'Corrupted or unsafe reference record'
            );

        } finally {
            closeSync(fd);
        }
    }

    function atomicWrite(identity, record) {
        const target = filePath(identity);

        requirePrivateDirectory(privateStateDir);
        requirePrivateDirectory(directory);

        const temporary = join(
            directory,
            `.tmp-${randomBytes(24).toString('hex')}`
        );

        const serialized = Buffer.from(
            JSON.stringify(record),
            'utf8'
        );

        let fd;
        let directoryFd;
        let created = false;

        try {
            if (serialized.length > MAX_RECORD_BYTES) {
                throw new Error('Reference record too large');
            }

            fd = openSync(
                temporary,
                constants.O_WRONLY |
                constants.O_CREAT |
                constants.O_EXCL |
                constants.O_NOFOLLOW,
                0o600
            );

            created = true;

            writeFileSync(fd, serialized);

            fsyncSync(fd);

            closeSync(fd);
            fd = undefined;

            // Atomically replace the previous record.
            renameSync(temporary, target);
            created = false;

            // Persist the directory entry.
            directoryFd = openSync(
                directory,
                constants.O_RDONLY |
                constants.O_DIRECTORY |
                constants.O_NOFOLLOW
            );

            fsyncSync(directoryFd);

        } finally {
            serialized.fill(0);

            if (fd !== undefined) {
                closeSync(fd);
            }

            if (directoryFd !== undefined) {
                closeSync(directoryFd);
            }

            if (created) {
                try {
                    unlinkSync(temporary);
                } catch (error) {
                    if (error.code !== 'ENOENT') {
                        throw error;
                    }
                }
            }
        }
    }

    function nextVersion(current, expectedVersion) {
        if (
            !Number.isSafeInteger(expectedVersion) ||
            expectedVersion < 0 ||
            current.version !== expectedVersion
        ) {
            throw new Error('Reference version conflict');
        }

        if (
            current.version >= Number.MAX_SAFE_INTEGER
        ) {
            throw new Error('Reference version exhausted');
        }

        return current.version + 1;
    }

    function get(identity) {
        return readRecord(identity);
    }

    function save(identity, reference, expectedVersion) {
        const current = readRecord(identity);

        const version = nextVersion(
            current,
            expectedVersion
        );

        const validated = copyReference(reference);

        const record = Object.freeze({
            issuer: identity.issuer,
            subject: identity.subject,
            version,
            reference: validated
        });

        atomicWrite(identity, record);

        return record;
    }

    function remove(identity, expectedVersion) {
        const current = readRecord(identity);

        const version = nextVersion(
            current,
            expectedVersion
        );

        if (!current.reference) {
            throw new Error('No active reference');
        }

        // Retain version metadata, but remove the descriptor.
        const record = Object.freeze({
            issuer: identity.issuer,
            subject: identity.subject,
            version,
            reference: null
        });

        atomicWrite(identity, record);

        return record;
    }

    function isCurrent(identity, version) {
        if (
            !Number.isSafeInteger(version) ||
            version < 1
        ) {
            return false;
        }

        const current = readRecord(identity);

        return Boolean(
            current.reference &&
            current.version === version
        );
    }

    return Object.freeze({
        get,
        save,
        remove,
        isCurrent
    });
}
