import * as oidc from 'openid-client';

import {
    isApprovalAction,
    isEnrollmentAction,
    validAttemptPurpose
} from './purpose.js';

function expectedClientId(config, method) {
    if (method === 'totp') {
        return config.totpClientId;
    }

    if (method === 'face') {
        return config.faceClientId;
    }

    throw new Error('Unsupported authentication method');
}

export function validateAmr(method, amr) {
    if (!Array.isArray(amr)) {
        throw new Error('Missing authentication method evidence');
    }

    const expected = method === 'totp'
        ? ['pwd', 'otp']
        : method === 'face'
            ? ['pwd']
            : null;

    if (!expected) {
        throw new Error('Unsupported authentication method');
    }

    if (
        amr.length !== expected.length ||
        !expected.every(value => amr.includes(value))
    ) {
        throw new Error('Incorrect authentication method evidence');
    }

    return Object.freeze({
        passwordVerified: true,
        totpVerified: method === 'totp',
        faceVerified: false
    });
}

export function extractApplicationRoles(result) {
    const roles = result?.realm_access?.roles;

    if (
        !Array.isArray(roles) ||
        !roles.every(role => typeof role === 'string')
    ) {
        throw new Error('Missing or invalid realm roles');
    }

    const allowedRoles = [...new Set(
        roles.filter(role =>
            ['regular_user', 'administrator'].includes(role)
        )
    )];

    if (allowedRoles.length === 0) {
        throw new Error('No permitted application role');
    }

    return Object.freeze(allowedRoles);
}

export function isActionAllowed(roles, action) {
    if (!Array.isArray(roles)) {
        return false;
    }

    if (
        action === 'view' ||
        isEnrollmentAction(action) ||
        action === 'face_withdraw'
    ) {
        return roles.includes('regular_user') ||
            roles.includes('administrator');
    }

    if (action === 'admin' || isApprovalAction(action)) {
        return roles.includes('administrator');
    }

    return false;
}

export function validateIntrospection({
    config,
    method,
    identity,
    result
}) {
    const clientId = expectedClientId(config, method);

    if (!result || result.active !== true) {
        throw new Error('Access token is inactive');
    }

    if (
        !identity ||
        identity.issuer !== config.keycloakIssuer ||
        typeof identity.subject !== 'string' ||
        !identity.subject
    ) {
        throw new Error('Invalid trusted identity');
    }

    if (result.iss !== config.keycloakIssuer) {
        throw new Error('Incorrect access token issuer');
    }

    if (result.sub !== identity.subject) {
        throw new Error('Access token subject mismatch');
    }

    const reportedClients = [
        result.client_id,
        result.azp
    ].filter(value => value !== undefined);

    if (
        reportedClients.length === 0 ||
        reportedClients.some(value => value !== clientId)
    ) {
        throw new Error('Access token client mismatch');
    }

    const audiences = Array.isArray(result.aud)
        ? result.aud
        : [result.aud];

    if (
        !audiences.includes(clientId) ||
        !audiences.includes(config.resourceAudience)
    ) {
        throw new Error('Incorrect access token audience');
    }

    const now = Math.floor(Date.now() / 1000);

    if (
        !Number.isSafeInteger(result.exp) ||
        result.exp <= now
    ) {
        throw new Error('Access token expired');
    }

    if (
        result.nbf !== undefined &&
        (
            !Number.isSafeInteger(result.nbf) ||
            result.nbf > now
        )
    ) {
        throw new Error('Access token is not yet valid');
    }

    return Object.freeze({
        issuer: result.iss,
        subject: result.sub,
        clientId,
        roles: extractApplicationRoles(result),
        expiresAt: result.exp * 1000
    });
}

export async function inspectAccessToken({
    config,
    clients,
    method,
    identity,
    accessToken,
    introspect = oidc.tokenIntrospection
}) {
    if (
        typeof accessToken !== 'string' ||
        !accessToken
    ) {
        throw new Error('Missing access token');
    }

    const clientId = expectedClientId(config, method);
    const client = clients[method];

    if (
        !client ||
        client.clientMetadata().client_id !== clientId
    ) {
        throw new Error('Incorrect introspection client');
    }

    const result = await introspect(
        client,
        accessToken,
        {
            token_type_hint: 'access_token'
        }
    );

    return validateIntrospection({
        config,
        method,
        identity,
        result
    });
}

export async function validateAuthenticationEvidence({
    config,
    clients,
    callbackResult,
    introspect = oidc.tokenIntrospection
}) {
    if (
        !callbackResult ||
        callbackResult.status !== 'identity_validated'
    ) {
        throw new Error('Identity has not been validated');
    }

    const { attempt, identity } = callbackResult;

    if (
        !attempt ||
        attempt.expiresAt <= Date.now()
    ) {
        throw new Error('Authentication attempt expired');
    }

    if (!validAttemptPurpose(
        attempt.method,
        attempt.action,
        attempt.targetSubject
    )) {
        throw new Error('Invalid authentication purpose');
    }

    // Administrators cannot approve their own enrollment.
    if (
        isApprovalAction(attempt.action) &&
        attempt.targetSubject === identity.subject
    ) {
        throw new Error('Self-approval is forbidden');
    }

    const factors = validateAmr(
        attempt.method,
        callbackResult.claims?.amr
    );

    const tokenEvidence = await inspectAccessToken({
        config,
        clients,
        method: attempt.method,
        identity,
        accessToken: callbackResult.accessToken,
        introspect
    });

    if (attempt.expiresAt <= Date.now()) {
        throw new Error('Authentication attempt expired');
    }

    if (!isActionAllowed(
        tokenEvidence.roles,
        attempt.action
    )) {
        throw new Error('Insufficient application role');
    }

    return Object.freeze({
        method: attempt.method,
        action: attempt.action,

        ...(attempt.targetSubject !== undefined
            ? { targetSubject: attempt.targetSubject }
            : {}),

        issuer: identity.issuer,
        subject: identity.subject,

        roles: tokenEvidence.roles,

        factors,

        expiresAt: Math.min(
            attempt.expiresAt,
            tokenEvidence.expiresAt,
            callbackResult.claims.exp * 1000
        ),

        status: attempt.method === 'totp'
            ? 'totp_verified'
            : 'pending_face',

        authorized: false
    });
}
