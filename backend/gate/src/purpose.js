export function isResourceAction(action) {
    return ['view', 'admin'].includes(action);
}

export function isApprovalAction(action) {
    return [
        'approve_enroll',
        'approve_replace'
    ].includes(action);
}

export function isEnrollmentAction(action) {
    return [
        'face_enroll',
        'face_replace'
    ].includes(action);
}

export function validTargetSubject(subject) {
    return (
        typeof subject === 'string' &&
        subject.length > 0 &&
        subject === subject.trim() &&
        Buffer.byteLength(subject) <= 1024 &&
        !/[\x00-\x1f\x7f]/.test(subject)
    );
}

export function validAttemptPurpose(
    method,
    action,
    targetSubject
) {
    if (!['totp', 'face'].includes(method)) {
        return false;
    }

    if (isResourceAction(action)) {
        return targetSubject === undefined;
    }

    // Sensitive biometric operations always require TOTP.
    if (method !== 'totp') {
        return false;
    }

    if (isApprovalAction(action)) {
        return validTargetSubject(targetSubject);
    }

    if (
        isEnrollmentAction(action) ||
        action === 'face_withdraw'
    ) {
        // The owner is derived from verified identity.
        return targetSubject === undefined;
    }

    return false;
}
