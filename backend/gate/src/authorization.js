import {
    inspectAccessToken,
    isActionAllowed
} from './evidence.js';

export async function revalidateClaim({
    config,
    clients,
    sessions,
    proofs,
    sessionToken,
    claimed,
    introspect
}) {
    const initialSession = sessions.get(sessionToken);

    function requireCurrentClaim() {
        const session = sessions.get(sessionToken);

        if (
            !session ||
            session.id !== initialSession?.id ||
            !proofs.isClaimCurrent(session, claimed)
        ) {
            throw new Error(
                'Authentication claim is no longer valid'
            );
        }

        const record = claimed.record;

        if (
            record.sessionId !== session.id ||
            record.evidence.expiresAt <= Date.now()
        ) {
            throw new Error(
                'Authentication proof expired or mismatched'
            );
        }

        return record;
    }

    try {
        const record = requireCurrentClaim();

        const { evidence, identity, accessToken } = record;

        // Only the completed TOTP route can execute in Part 4.
        if (
            evidence.method !== 'totp' ||
            evidence.status !== 'totp_verified' ||
            evidence.factors.passwordVerified !== true ||
            evidence.factors.totpVerified !== true ||
            evidence.factors.faceVerified !== false
        ) {
            throw new Error(
                'Authentication factors incomplete'
            );
        }

        if (!isActionAllowed(
            evidence.roles,
            evidence.action
        )) {
            throw new Error(
                'Insufficient original application role'
            );
        }

        // Communicate with Keycloak again.
        const tokenEvidence = await inspectAccessToken({
            config,
            clients,
            method: evidence.method,
            identity,
            accessToken,
            introspect
        });

        // The session or proof may have been invalidated
        // while waiting for Keycloak.
        requireCurrentClaim();

        if (tokenEvidence.expiresAt <= Date.now()) {
            throw new Error('Access token expired');
        }

        if (!isActionAllowed(
            tokenEvidence.roles,
            evidence.action
        )) {
            throw new Error(
                'Insufficient current application role'
            );
        }

        return Object.freeze({
            sessionId: record.sessionId,
            attemptId: record.attemptId,

            issuer: identity.issuer,
            subject: identity.subject,

            method: evidence.method,
            action: evidence.action,

            roles: tokenEvidence.roles,

            expiresAt: Math.min(
                evidence.expiresAt,
                tokenEvidence.expiresAt
            ),

            status: 'revalidated'
        });

    } catch (error) {
        // Revoke only the failed claim.
        // Never revoke a newer replacement proof.
        if (
            initialSession &&
            proofs.isClaimCurrent(
                initialSession,
                claimed
            )
        ) {
            proofs.revoke(initialSession.id);
        }

        throw error;
    }
}
