export function invalidateAccount({
    sessions,
    attempts,
    proofs,
    approvals = null
}, identity) {
    // Revoke all sessions bound to the affected account.
    const revokedSessionIds =
        sessions.revokeAccount(identity);

    // Delete authentication proofs belonging
    // to the revoked sessions.
    let revokedProofs = 0;

    for (const sessionId of revokedSessionIds) {
        if (proofs.revoke(sessionId)) {
            revokedProofs++;
        }
    }

    // Pending OIDC attempts may not yet have a
    // verified account identity.
    const cancelledAttempts = attempts.cancelAll();

    // Remove approvals received or issued
    // by the affected account.
    const revokedApprovals = approvals
        ? approvals.revokeForAccount(identity)
        : 0;

    return Object.freeze({
        revokedSessions: revokedSessionIds.length,
        revokedProofs,
        cancelledAttempts,
        revokedApprovals
    });
}
