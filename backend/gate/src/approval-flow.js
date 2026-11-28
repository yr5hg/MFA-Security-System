import { revalidateClaim } from './authorization.js';
import { hasCompletedFactors } from './proof.js';

import {
    isApprovalAction,
    validTargetSubject
} from './purpose.js';

function failure(httpStatus, error) {
    return {
        httpStatus,
        body: { error }
    };
}

const authorizationErrors = new Set([
    'Access token is inactive',
    'Incorrect access token issuer',
    'Access token subject mismatch',
    'Access token client mismatch',
    'Incorrect access token audience',
    'Access token expired',
    'Access token is not yet valid',
    'Missing or invalid realm roles',
    'No permitted application role',
    'Insufficient original application role',
    'Insufficient current application role',
    'Authentication factors incomplete'
]);

const staleClaimErrors = new Set([
    'Authentication claim is no longer valid',
    'Authentication proof expired or mismatched'
]);

export async function createFactorApproval({
    config,
    clients,
    sessions,
    proofs,
    approvals,
    references,
    sessionToken,
    body,
    introspect
}) {
    const session = sessions.get(sessionToken);

    if (!session) {
        return failure(401, 'invalid_session');
    }

    if (
        !approvals ||
        typeof references?.get !== 'function' ||
        config.faceSimilarityThreshold !== 0.66
    ) {
        return failure(503, 'approval_unavailable');
    }

    // Require explicit administrator attestation
    // of the supervised identity check.
    if (
        !body ||
        !validTargetSubject(body.targetSubject) ||
        !['enroll', 'replace'].includes(body.operation) ||
        body.identityChecked !== true ||
        Object.keys(body).some(key => ![
            'targetSubject',
            'operation',
            'identityChecked',
            'csrfToken'
        ].includes(key))
    ) {
        return failure(400, 'invalid_approval_request');
    }

    const record = proofs.get(session);

    if (!record) {
        return failure(409, 'no_available_proof');
    }

    const { evidence, identity } = record;

    if (
        evidence.method !== 'totp' ||
        !hasCompletedFactors(evidence) ||
        !isApprovalAction(evidence.action) ||
        evidence.action !== `approve_${body.operation}` ||
        evidence.targetSubject !== body.targetSubject ||
        identity.subject === body.targetSubject
    ) {
        return failure(
            403,
            'incorrect_authentication_purpose'
        );
    }

    if (!evidence.roles.includes('administrator')) {
        return failure(403, 'administrator_required');
    }

    const claimed = proofs.claim(session);

    if (!claimed) {
        return failure(409, 'proof_unavailable');
    }

    try {
        const validated = await revalidateClaim({
            config,
            clients,
            sessions,
            proofs,
            sessionToken,
            claimed,
            introspect
        });

        const liveSession = sessions.get(sessionToken);

        if (
            !liveSession ||
            liveSession.id !== session.id ||
            !proofs.isClaimCurrent(liveSession, claimed)
        ) {
            return failure(409, 'proof_no_longer_valid');
        }

        if (
            validated.status !== 'revalidated' ||
            validated.sessionId !== record.sessionId ||
            validated.attemptId !== record.attemptId ||
            validated.issuer !== identity.issuer ||
            validated.subject !== identity.subject ||
            validated.method !== 'totp' ||
            validated.action !== evidence.action ||
            validated.targetSubject !== evidence.targetSubject ||
            !validated.roles.includes('administrator') ||
            validated.expiresAt <= Date.now()
        ) {
            return failure(403, 'authorization_failed');
        }

        const target = {
            issuer: identity.issuer,
            subject: evidence.targetSubject
        };

        // Read the trusted current reference state.
        const current = references.get(target);

        if (
            current.issuer !== target.issuer ||
            current.subject !== target.subject ||
            !Number.isSafeInteger(current.version) ||
            current.version < 0 ||
            !Object.hasOwn(current, 'reference')
        ) {
            return failure(503, 'approval_unavailable');
        }

        if (
            body.operation === 'enroll' &&
            current.reference !== null
        ) {
            return failure(409, 'reference_already_exists');
        }

        if (
            body.operation === 'replace' &&
            (current.reference === null || current.version < 1)
        ) {
            return failure(409, 'reference_not_found');
        }

        if (validated.expiresAt <= Date.now()) {
            return failure(409, 'proof_no_longer_valid');
        }

        // Consume the administrator's proof before
        // creating any approval.
        const consumed = proofs.consume(
            liveSession,
            claimed
        );

        if (consumed !== record) {
            return failure(409, 'proof_unavailable');
        }

        const approval = approvals.issue({
            approver: identity,
            target,
            operation: body.operation,
            referenceVersion: current.version
        });

        if (!approval) {
            return failure(409, 'approval_already_exists');
        }

        return {
            httpStatus: 201,

            body: {
                status: 'approval_created',
                targetSubject: approval.subject,
                operation: approval.operation,
                expiresAt: approval.expiresAt
            }
        };

    } catch (error) {
        if (authorizationErrors.has(error?.message)) {
            return failure(403, 'authorization_failed');
        }

        if (staleClaimErrors.has(error?.message)) {
            return failure(409, 'proof_no_longer_valid');
        }

        return failure(503, 'approval_unavailable');

    } finally {
        if (proofs.isClaimCurrent(session, claimed)) {
            proofs.revoke(session.id);
        }
    }
}
