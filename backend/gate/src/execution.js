import { revalidateClaim } from './authorization.js';

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

export async function executeProtectedOperation({
    config,
    clients,
    sessions,
    proofs,
    operations,
    sessionToken,
    introspect
}) {
    const session = sessions.get(sessionToken);

    if (!session) {
        return failure(401, 'invalid_session');
    }

    const record = proofs.get(session);

    if (!record) {
        return failure(409, 'no_available_proof');
    }

    if (
        record.evidence.method !== 'totp' ||
        record.evidence.status !== 'totp_verified'
    ) {
        return failure(403, 'authentication_incomplete');
    }

    // Claim before performing any asynchronous work.
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

        const currentSession = sessions.get(sessionToken);

        // Final validation after the network request.
        if (
            !currentSession ||
            currentSession.id !== session.id ||
            !proofs.isClaimCurrent(currentSession, claimed)
        ) {
            return failure(409, 'proof_no_longer_valid');
        }

        if (
            validated.status !== 'revalidated' ||
            validated.sessionId !== record.sessionId ||
            validated.attemptId !== record.attemptId ||
            validated.issuer !== record.identity.issuer ||
            validated.subject !== record.identity.subject ||
            validated.method !== record.evidence.method ||
            validated.action !== record.evidence.action ||
            !Number.isSafeInteger(validated.expiresAt) ||
            validated.expiresAt <= Date.now()
        ) {
            return failure(403, 'authorization_failed');
        }

        // Consume before accessing the protected resource.
        const consumed = proofs.consume(
            currentSession,
            claimed
        );

        if (!consumed || consumed !== record) {
            return failure(409, 'proof_unavailable');
        }

        // No asynchronous gap between consumption
        // and synchronous resource execution.
        const result = operations.execute(
            consumed,
            validated.roles
        );

        return {
            httpStatus: 200,
            body: result
        };

    } catch (error) {
        if (authorizationErrors.has(error?.message)) {
            return failure(403, 'authorization_failed');
        }

        if (staleClaimErrors.has(error?.message)) {
            return failure(409, 'proof_no_longer_valid');
        }

        // Dependency and resource failures fail closed.
        return failure(503, 'operation_unavailable');

    } finally {
        // Invalidate an unfinished claim without affecting
        // any newer replacement authentication attempt.
        if (proofs.isClaimCurrent(session, claimed)) {
            proofs.revoke(session.id);
        }
    }
}
