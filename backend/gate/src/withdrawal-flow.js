import { revalidateClaim } from './authorization.js';
import { hasCompletedFactors } from './proof.js';
import { invalidateAccount } from './account-invalidation.js';

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

const staleErrors = new Set([
    'Authentication claim is no longer valid',
    'Authentication proof expired or mismatched'
]);

function failure(httpStatus, error) {
    return {
        httpStatus,
        body: { error }
    };
}

export async function withdrawFaceReference({
    config,
    clients,
    sessions,
    attempts,
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
        !body ||
        body.confirmWithdrawal !== true ||
        Object.keys(body).some(key => ![
            'confirmWithdrawal',
            'csrfToken'
        ].includes(key))
    ) {
        return failure(400, 'invalid_withdrawal_request');
    }

    if (
        typeof references?.get !== 'function' ||
        typeof references?.remove !== 'function'
    ) {
        return failure(503, 'withdrawal_unavailable');
    }

    const record = proofs.get(session);

    if (!record) {
        return failure(409, 'no_available_proof');
    }

    const { evidence, identity } = record;

    if (
        evidence.action !== 'face_withdraw' ||
        evidence.method !== 'totp' ||
        evidence.authorized !== false ||
        !hasCompletedFactors(evidence) ||
        session.account?.issuer !== identity.issuer ||
        session.account?.subject !== identity.subject
    ) {
        return failure(
            403,
            'incorrect_authentication_purpose'
        );
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

        const live = sessions.get(sessionToken);

        if (
            !live ||
            live.id !== session.id ||
            !proofs.isClaimCurrent(live, claimed)
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
            validated.action !== 'face_withdraw' ||
            validated.expiresAt <= Date.now()
        ) {
            return failure(403, 'authorization_failed');
        }

        const current = references.get(identity);

        if (
            current.issuer !== identity.issuer ||
            current.subject !== identity.subject ||
            !Number.isSafeInteger(current.version) ||
            current.version < 0 ||
            !Object.hasOwn(current, 'reference') ||
            (
                current.reference !== null &&
                current.version === 0
            )
        ) {
            return failure(503, 'withdrawal_unavailable');
        }

        if (validated.expiresAt <= Date.now()) {
            return failure(409, 'proof_no_longer_valid');
        }

        // Consume the dedicated authorization first.
        if (proofs.consume(live, claimed) !== record) {
            return failure(409, 'proof_unavailable');
        }

        // Revoke pending approvals and account sessions,
        // including any concurrent enrollment operations.
        invalidateAccount({
            sessions,
            attempts,
            proofs,
            approvals
        }, identity);

        const removed = current.reference !== null;

        if (removed) {
            // Remove the descriptor while retaining
            // monotonic reference version metadata.
            references.remove(identity, current.version);
        }

        return {
            httpStatus: 200,

            body: {
                status: 'face_withdrawn',
                removed
            }
        };

    } catch (error) {
        if (authorizationErrors.has(error?.message)) {
            return failure(403, 'authorization_failed');
        }

        if (staleErrors.has(error?.message)) {
            return failure(409, 'proof_no_longer_valid');
        }

        return failure(503, 'withdrawal_unavailable');

    } finally {
        if (proofs.isClaimCurrent(session, claimed)) {
            proofs.revoke(session.id);
        }
    }
}
