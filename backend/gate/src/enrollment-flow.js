import { randomBytes } from 'node:crypto';

import { revalidateClaim } from './authorization.js';
import { hasCompletedFactors } from './proof.js';
import { isEnrollmentAction } from './purpose.js';
import { invalidateAccount } from './account-invalidation.js';

const captureErrors = new Set([
    'INVALID_INPUT',
    'EMPTY_IMAGE',
    'IMAGE_TOO_LARGE',
    'INVALID_IMAGE_FORMAT',
    'INVALID_JPEG',
    'INVALID_DIMENSIONS',
    'INVALID_PIXEL_DATA',
    'NO_FACE',
    'MULTIPLE_FACES',
    'LOW_CONFIDENCE',
    'INVALID_FACE_SCORE',
    'INVALID_FACE_BOX',
    'FACE_TOO_SMALL',
    'FACE_OUT_OF_FRAME',
    'LOW_MESH_CONFIDENCE'
]);

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

export function createEnrollmentFlow({
    config,
    clients,
    sessions,
    attempts,
    proofs,
    approvals,
    references,
    verifier,
    policyVersion,
    introspect
}) {
    const challenges = new WeakMap();

    let busy = false;

    function eligible(record) {
        return Boolean(
            record &&
            record.evidence.method === 'totp' &&
            isEnrollmentAction(record.evidence.action) &&
            record.evidence.authorized === false &&
            hasCompletedFactors(record.evidence)
        );
    }

    function current(sessionToken, record) {
        const session = sessions.get(sessionToken);

        if (
            !session ||
            proofs.get(session) !== record ||
            !eligible(record)
        ) {
            return null;
        }

        return session;
    }

    function operationFor(record) {
        return record.evidence.action === 'face_replace'
            ? 'replace'
            : 'enroll';
    }

    function matchingReference(identity, approval) {
        const reference = references.get(identity);

        return (
            reference.issuer === identity.issuer &&
            reference.subject === identity.subject &&
            reference.version === approval.referenceVersion &&
            (
                approval.operation === 'enroll'
                    ? reference.reference === null
                    : approval.operation === 'replace' &&
                        reference.version > 0 &&
                        reference.reference !== null
            )
        );
    }

    function issueChallenge(session, record) {
        if (
            !eligible(record) ||
            proofs.get(session) !== record
        ) {
            return {
                enrollmentError: 'enrollment_unavailable'
            };
        }

        const existing = challenges.get(record);

        if (existing?.used) {
            return {
                enrollmentError: 'capture_in_progress'
            };
        }

        try {
            const approval = approvals.get(record.identity);

            if (
                !approval ||
                approval.operation !== operationFor(record)
            ) {
                return {
                    enrollmentError: 'approval_required'
                };
            }

            if (!matchingReference(
                record.identity,
                approval
            )) {
                return {
                    enrollmentError: 'reference_changed'
                };
            }

            if (existing) {
                if (
                    existing.approval !== approval ||
                    existing.expiresAt <= Date.now()
                ) {
                    proofs.revoke(session.id);

                    return {
                        enrollmentError: 'capture_expired'
                    };
                }

                return {
                    captureChallenge: existing.token,
                    captureChallengeExpiresAt:
                        existing.expiresAt
                };
            }

            const expiresAt = Math.min(
                record.evidence.expiresAt,
                approval.expiresAt,
                Date.now() +
                    config.captureChallengeTtlSeconds * 1000
            );

            if (expiresAt <= Date.now()) {
                return {
                    enrollmentError: 'capture_expired'
                };
            }

            const challenge = {
                token: randomBytes(32).toString('base64url'),
                expiresAt,
                approval,
                used: false
            };

            challenges.set(record, challenge);

            return {
                captureChallenge: challenge.token,
                captureChallengeExpiresAt: challenge.expiresAt
            };

        } catch {
            return {
                enrollmentError: 'enrollment_unavailable'
            };
        }
    }

    async function enroll({
        sessionToken,
        record,
        challengeToken,
        consent,
        image
    }) {
        const session = current(sessionToken, record);

        if (!session) {
            return failure(409, 'enrollment_attempt_unavailable');
        }

        if (consent !== true) {
            return failure(400, 'consent_required');
        }

        const challenge = challenges.get(record);

        if (
            !challenge ||
            challenge.used ||
            typeof challengeToken !== 'string' ||
            challengeToken !== challenge.token
        ) {
            return failure(409, 'invalid_capture_challenge');
        }

        if (challenge.expiresAt <= Date.now()) {
            proofs.revoke(session.id);

            return failure(409, 'capture_expired');
        }

        if (busy) {
            return failure(503, 'enrollment_unavailable');
        }

        const identity = record.identity;

        let proofClaim = null;
        let approvalClaim = null;
        let ownsWorker = false;

        try {
            const available = approvals.get(identity);

            // Never accept a newly issued approval in
            // place of the original challenge-bound approval.
            if (available !== challenge.approval) {
                return failure(409, 'approval_unavailable');
            }

            if (!matchingReference(identity, available)) {
                return failure(409, 'reference_changed');
            }

            proofClaim = proofs.claim(session);

            if (!proofClaim) {
                return failure(409, 'proof_unavailable');
            }

            approvalClaim = approvals.claim(
                identity,
                operationFor(record),
                available.referenceVersion
            );

            if (
                !approvalClaim ||
                approvalClaim.approval !== available
            ) {
                return failure(409, 'approval_unavailable');
            }

            // Both claims are acquired synchronously.
            challenge.used = true;
            busy = true;
            ownsWorker = true;

            async function authorize() {
                return revalidateClaim({
                    config,
                    clients,
                    sessions,
                    proofs,
                    sessionToken,
                    claimed: proofClaim,
                    introspect
                });
            }

            function stillAuthorized(validated) {
                const live = current(sessionToken, record);

                return Boolean(
                    live &&
                    proofs.isClaimCurrent(live, proofClaim) &&
                    approvals.isClaimCurrent(
                        identity,
                        approvalClaim
                    ) &&
                    validated.status === 'revalidated' &&
                    validated.sessionId === record.sessionId &&
                    validated.attemptId === record.attemptId &&
                    validated.issuer === identity.issuer &&
                    validated.subject === identity.subject &&
                    validated.method === 'totp' &&
                    validated.action === record.evidence.action &&
                    Number.isSafeInteger(validated.expiresAt) &&
                    validated.expiresAt > Date.now()
                );
            }

            // Verify the owner's token before inference.
            const initial = await authorize();

            if (!stillAuthorized(initial)) {
                return failure(409, 'enrollment_no_longer_valid');
            }

            if (challenge.expiresAt <= Date.now()) {
                return failure(409, 'capture_expired');
            }

            if (!matchingReference(identity, available)) {
                return failure(409, 'reference_changed');
            }

            // Yousef's private Human module.
            const outcome = await verifier.enroll(image);

            if (
                outcome?.ok !== true ||
                outcome.policyVersion !== policyVersion ||
                outcome.reference?.policyVersion !== policyVersion ||
                !Array.isArray(outcome.reference.descriptor)
            ) {
                if (
                    outcome?.ok === false &&
                    outcome.policyVersion === policyVersion &&
                    captureErrors.has(outcome.code)
                ) {
                    return failure(400, 'invalid_face_capture');
                }

                return failure(503, 'enrollment_unavailable');
            }

            // Revalidate after the asynchronous inference.
            const final = await authorize();

            if (!stillAuthorized(final)) {
                return failure(409, 'enrollment_no_longer_valid');
            }

            if (!matchingReference(identity, available)) {
                return failure(409, 'reference_changed');
            }

            const live = current(sessionToken, record);

            if (
                !live ||
                !stillAuthorized(final)
            ) {
                return failure(409, 'enrollment_no_longer_valid');
            }

            // Consume both claims before the storage effect.
            const consumedProof = proofs.consume(
                live,
                proofClaim
            );

            if (consumedProof !== record) {
                return failure(409, 'proof_unavailable');
            }

            const consumedApproval = approvals.consume(
                identity,
                approvalClaim
            );

            if (consumedApproval !== available) {
                return failure(409, 'approval_unavailable');
            }

            const replacing =
                operationFor(record) === 'replace';

            if (replacing) {
                // Revoke old authorization before changing
                // the biometric reference.
                invalidateAccount({
                    sessions,
                    attempts,
                    proofs,
                    approvals
                }, identity);
            }

            // The reference store independently validates
            // the descriptor and expected reference version.
            references.save(
                identity,
                outcome.reference,
                available.referenceVersion
            );

            return {
                httpStatus: 201,
                body: {
                    status: replacing
                        ? 'face_replaced'
                        : 'face_enrolled'
                }
            };

        } catch (error) {
            if (authorizationErrors.has(error?.message)) {
                return failure(403, 'authorization_failed');
            }

            if (staleErrors.has(error?.message)) {
                return failure(409, 'enrollment_no_longer_valid');
            }

            return failure(503, 'enrollment_unavailable');

        } finally {
            if (
                proofClaim &&
                proofs.isClaimCurrent(session, proofClaim)
            ) {
                proofs.revoke(session.id);
            }

            // Accepted capture attempts are single-use,
            // including failed inference and storage failure.
            if (
                approvalClaim &&
                approvals.isClaimCurrent(
                    identity,
                    approvalClaim
                )
            ) {
                approvals.consume(identity, approvalClaim);
            }

            if (ownsWorker) {
                busy = false;
            }
        }
    }

    return Object.freeze({
        issueChallenge,
        enroll
    });
}
