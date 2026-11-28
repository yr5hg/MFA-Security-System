import { validTargetSubject } from './purpose.js';

export const APPROVAL_TTL_SECONDS = 600;

export function createApprovalStore({
    issuer,
    ttlSeconds = APPROVAL_TTL_SECONDS,
    maxApprovals = 1000,
    now = Date.now
}) {
    if (
        typeof issuer !== 'string' ||
        !issuer ||
        !Number.isSafeInteger(ttlSeconds) ||
        ttlSeconds < 1 ||
        ttlSeconds > APPROVAL_TTL_SECONDS ||
        !Number.isSafeInteger(maxApprovals) ||
        maxApprovals < 1
    ) {
        throw new Error('Invalid approval configuration');
    }

    const entries = new Map();

    function validIdentity(identity) {
        return (
            identity?.issuer === issuer &&
            validTargetSubject(identity.subject)
        );
    }

    function validOperation(operation) {
        return ['enroll', 'replace'].includes(operation);
    }

    function validVersion(version) {
        return (
            Number.isSafeInteger(version) &&
            version >= 0
        );
    }

    function purgeExpired() {
        const time = now();

        for (const [subject, entry] of entries) {
            if (entry.approval.expiresAt <= time) {
                entries.delete(subject);
            }
        }
    }

    function getEntry(identity) {
        purgeExpired();

        if (!validIdentity(identity)) {
            return null;
        }

        return entries.get(identity.subject) ?? null;
    }

    function issue({
        approver,
        target,
        operation,
        referenceVersion
    }) {
        if (
            !validIdentity(approver) ||
            !validIdentity(target) ||
            approver.subject === target.subject ||
            !validOperation(operation) ||
            !validVersion(referenceVersion) ||
            (
                operation === 'replace' &&
                referenceVersion === 0
            )
        ) {
            throw new Error('Invalid approval request');
        }

        purgeExpired();

        // Never silently overwrite another approval.
        if (entries.has(target.subject)) {
            return null;
        }

        if (entries.size >= maxApprovals) {
            throw new Error('Approval capacity reached');
        }

        const createdAt = now();

        const approval = Object.freeze({
            issuer,
            subject: target.subject,
            approvedBy: approver.subject,
            operation,
            referenceVersion,
            createdAt,
            expiresAt:
                createdAt + ttlSeconds * 1000
        });

        entries.set(target.subject, {
            approval,
            claim: null
        });

        return approval;
    }

    function get(identity) {
        const entry = getEntry(identity);

        if (!entry || entry.claim !== null) {
            return null;
        }

        return entry.approval;
    }

    function claim(identity, operation, referenceVersion) {
        const entry = getEntry(identity);

        if (
            !entry ||
            entry.claim !== null ||
            entry.approval.operation !== operation ||
            entry.approval.referenceVersion !== referenceVersion
        ) {
            return null;
        }

        // Claim synchronously before biometric inference.
        const claimed = Object.freeze({
            approval: entry.approval
        });

        entry.claim = claimed;

        return claimed;
    }

    function isClaimCurrent(identity, claimed) {
        const entry = getEntry(identity);

        return Boolean(
            entry &&
            claimed &&
            entry.claim === claimed &&
            entry.approval === claimed.approval
        );
    }

    function consume(identity, claimed) {
        if (!isClaimCurrent(identity, claimed)) {
            return null;
        }

        entries.delete(identity.subject);

        return claimed.approval;
    }

    function revoke(identity) {
        if (!validIdentity(identity)) {
            return false;
        }

        return entries.delete(identity.subject);
    }

    function revokeForAccount(identity) {
        if (!validIdentity(identity)) {
            return 0;
        }

        purgeExpired();

        let count = 0;

        for (const [subject, entry] of entries) {
            if (
                subject === identity.subject ||
                entry.approval.approvedBy === identity.subject
            ) {
                entries.delete(subject);
                count++;
            }
        }

        return count;
    }

    return Object.freeze({
        issue,
        get,
        claim,
        isClaimCurrent,
        consume,
        revoke,
        revokeForAccount,
        purgeExpired
    });
}
