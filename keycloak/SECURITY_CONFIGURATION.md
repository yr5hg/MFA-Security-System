# Security Configuration

## 1. Overview

Keycloak provides centralized security configuration for the `multi-factor-authentication` realm.

The configured security controls cover password requirements, TOTP verification, brute-force protection, session management, token security, role-based access control, and security event logging.

This document reflects the actual realm configuration exported from Keycloak 26.8.2.

## 2. Password Policy

The password policy establishes credential requirements and password expiration rules.

| Policy | Configured Value |
|---|---|
| Minimum Password Length | 8 characters |
| Minimum Uppercase Characters | 1 |
| Minimum Numerical Digits | 1 |
| Minimum Special Characters | 1 |
| Not Username | Enabled |
| Password Expiration | 365 days |

Users must satisfy the configured password requirements when creating or updating their passwords.

Passwords expire after 365 days, requiring users to update their credentials.

The configured policy prevents users from selecting their username as their password.

## 3. TOTP Policy

Time-Based One-Time Password authentication provides a possession-based second authentication factor.

| Setting | Configured Value |
|---|---|
| OTP Type | TOTP |
| OTP Algorithm | HmacSHA1 |
| Number of Digits | 6 |
| Token Period | 30 seconds |
| Look-Ahead Window | 1 |
| Reusable Code | Disabled |

The authenticator generates a six-digit code every 30 seconds.

The configured look-ahead window accommodates limited time differences between the authenticator and the identity provider.

Successfully consumed OTP codes cannot be reused.

Supported authenticator applications include:

- FreeOTP.
- Google Authenticator.
- Microsoft Authenticator.

OTP enrollment secrets must remain confidential and must not be included in repository configuration files.

## 4. Brute-Force Protection

### 4.1 Configuration

Brute-force detection restricts repeated authentication failures through temporary account lockouts.

| Setting | Configured Value |
|---|---|
| Brute-Force Detection | Enabled |
| Brute Force Mode | Lockout temporarily |
| Permanent Lockout | Disabled |
| Maximum Login Failures | 6 |
| Maximum Secondary Authentication Failures | 0 |
| Wait Time Strategy | Linear |
| Wait Increment | 30 minutes |
| Maximum Wait | 60 minutes |
| Failure Reset Time | 60 minutes |
| Quick Login Check | 1000 milliseconds |
| Minimum Quick Login Wait | 1 minute |

### 4.2 Lockout Behavior

The configured policy applies temporary restrictions to repeated failed authentication attempts.

- The configured failure threshold is six attempts.
- The wait increment is 30 minutes.
- The maximum temporary waiting period is 60 minutes.
- The failure reset interval is 60 minutes.
- Rapid consecutive failures may trigger the minimum one-minute waiting period.
- Permanent account lockout is disabled.

The maximum secondary authentication failures value is zero, meaning that no additional permanent secondary-authentication failure threshold is configured.

The exact lockout behavior depends on the failure counter and timing of authentication attempts.

Keycloak brute-force protection applies to supported password and OTP authentication executions. External facial verification failures are controlled separately by the application.

## 5. Session Security

Session policies restrict the duration of authenticated sessions and incomplete authentication processes.

### 5.1 Standard Sessions

| Setting | Configured Value |
|---|---|
| SSO Session Idle | 15 minutes |
| SSO Session Max | 1 hour |
| Client Session Idle | 10 minutes |
| Client Session Max | 30 minutes |

Idle timeouts restrict the permitted period of inactivity.

Maximum session lifetimes restrict the total duration of a session regardless of continued activity.

Client session restrictions provide shorter application-specific session lifetimes.

### 5.2 Offline Sessions

| Setting | Configured Value |
|---|---|
| Offline Session Idle | 30 days |
| Client Offline Session Idle | 0 |
| Offline Session Max Limited | Enabled |
| Offline Session Max | 30 days |
| Client Offline Session Max | 0 |

A zero client-specific timeout indicates that the corresponding realm-level offline session setting applies.

Offline access should only be requested when required by the application.

### 5.3 Authentication Time Limits

| Setting | Configured Value |
|---|---|
| Login Timeout | 5 minutes |
| Login Action Timeout | 2 minutes |
| Client Login Timeout | 1 minute |

These time limits restrict the validity of incomplete authentication processes, individual authentication actions, and authorization code exchanges.

## 6. Token Security

### 6.1 Token Configuration

| Setting | Configured Value |
|---|---|
| Default Signature Algorithm | RS256 |
| Access Token Lifespan | 5 minutes |
| Revoke Refresh Token | Enabled |
| Refresh Token Max Reuse | 0 |

RS256 provides digitally signed tokens whose authenticity and integrity can be verified using the identity provider's public signing keys.

The five-minute access token lifetime reduces the exposure period of compromised access tokens.

Refresh token rotation is enabled, with a maximum reuse value of zero. Applications must retain the latest refresh token returned after a successful refresh operation.

### 6.2 Client-Level Token Security

Both `gate-totp` and `gate-face` use the following configuration:

| Setting | Configured Value |
|---|---|
| Client Authentication | Enabled |
| Client Authenticator | Client Secret |
| Standard Flow | Enabled |
| PKCE | S256 |
| Implicit Flow | Disabled |
| Direct Access Grants | Disabled |
| Service Accounts | Disabled |
| Refresh Tokens | Enabled |
| Lightweight Access Tokens | Disabled |

The Authorization Code Flow and PKCE protect the authorization code exchange.

Disabling unused authentication grants reduces unnecessary authentication paths for the two application clients.

Authentication Method Reference (AMR) mappers provide information about the authentication methods completed within Keycloak.

Detailed authentication flows and AMR configuration are documented in [AUTHENTICATION_FLOWS.md](AUTHENTICATION_FLOWS.md).

### 6.3 Token Validation Requirements

Issued tokens must be validated by the application before protected access is authorized.

Required validation includes:

- Token signature.
- Trusted issuer.
- Token expiration.
- Intended audience.
- Applicable client identity.
- Required authentication evidence.
- Assigned application roles.

The resource audience is configured as part of application integration.

Successful token validation alone does not establish completion of external face verification.

## 7. Role-Based Access Control

Keycloak manages application role definitions and user role assignments.

| Realm Role | Purpose |
|---|---|
| `regular_user` | Standard application permissions |
| `administrator` | Administrator-level application permissions |

Realm role information is included in the access token under the `realm_access.roles` claim.

The application uses trusted role information to enforce its authorization requirements.

The application administrator role is separate from Keycloak's built-in realm administration privileges.

## 8. Realm Account Settings

| Setting | Configured Value |
|---|---|
| User Registration | Disabled |
| Login with Email | Enabled |
| Duplicate Emails | Disabled |
| Remember Me | Disabled |
| Email Verification Requirement | Disabled |
| Self-Service Forgotten Password Reset | Disabled |
| Username Editing | Disabled |

Account creation and forgotten-password recovery are not exposed through the corresponding public Keycloak login options.

The disabled forgotten-password reset option does not prevent administrator-managed credential updates or other authorized credential-management operations.

## 9. Security Event Logging

### 9.1 User Events

| Setting | Configured Value |
|---|---|
| Save User Events | Enabled |
| Event Retention | 30 days |
| Event Listener | `jboss-logging` |

Keycloak records authentication-related events to support security monitoring and investigation.

Relevant configured events include:

| Event | Description |
|---|---|
| `LOGIN` | Successful authentication |
| `LOGIN_ERROR` | Failed authentication |
| `LOGOUT` | Successful logout |
| `LOGOUT_ERROR` | Failed logout |
| `CODE_TO_TOKEN` | Successful authorization code exchange |
| `CODE_TO_TOKEN_ERROR` | Failed authorization code exchange |
| `CLIENT_LOGIN` | Successful client authentication |
| `CLIENT_LOGIN_ERROR` | Failed client authentication |
| `REFRESH_TOKEN` | Successful token refresh |
| `REFRESH_TOKEN_ERROR` | Failed token refresh |
| `UPDATE_PASSWORD` | Password update |
| `UPDATE_PASSWORD_ERROR` | Failed password update |
| `UPDATE_CREDENTIAL` | Credential update |
| `UPDATE_CREDENTIAL_ERROR` | Failed credential update |
| `UPDATE_TOTP` | TOTP credential update |
| `UPDATE_TOTP_ERROR` | Failed TOTP credential update |
| `REMOVE_TOTP` | TOTP credential removal |
| `REMOVE_TOTP_ERROR` | Failed TOTP credential removal |
| `RESET_PASSWORD` | Password reset |
| `RESET_PASSWORD_ERROR` | Failed password reset |
| `USER_DISABLED_BY_TEMPORARY_LOCKOUT` | Temporary account lockout |

The table highlights security-relevant events from the enabled event configuration rather than listing every supported event.

External face verification events are managed separately by the application.

### 9.2 Administrator Events

| Setting | Configured Value |
|---|---|
| Save Admin Events | Enabled |
| Include Representation | Disabled |
| Event Retention | 30 hours |

Administrator events provide an audit trail for administrative operations affecting realm configuration, users, roles, clients, and authentication settings.

Detailed operation representations are excluded to reduce unnecessary exposure of configuration data.

## 10. Browser and Transport Security

### 10.1 Transport Security

| Setting | Configured Value |
|---|---|
| Realm SSL Requirement | External Requests |

The final integrated deployment uses HTTPS for communication between the identity provider and the application.

Certificate configuration and deployment requirements are documented in [DEPLOYMENT.md](DEPLOYMENT.md).

### 10.2 Browser Security Headers

| Security Header | Configured Value |
|---|---|
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `SAMEORIGIN` |
| Referrer-Policy | `no-referrer` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| Content-Security-Policy | `frame-src 'self'; frame-ancestors 'self'; object-src 'none';` |

These headers restrict unauthorized framing, MIME-type sniffing, referrer information disclosure, and insecure browser connections.

## 11. Configuration Confidentiality

The repository contains sanitized configuration and technical documentation.

The following sensitive information must remain outside version control:

- User passwords and credentials.
- Client secrets.
- TOTP enrollment secrets.
- Access and refresh tokens.
- Private signing and TLS keys.
- Private user data and runtime security records.

Sensitive configuration must be provisioned privately when importing or deploying the realm.

## 12. Configuration References

- [Keycloak Overview](README.md)
- [Authentication Flows](AUTHENTICATION_FLOWS.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Sanitized Realm Configuration](realm-export.json)
- [Keycloak Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/)

The configuration values documented here reflect the exported realm settings. Runtime security behavior and end-to-end authentication enforcement are evaluated separately through the project's security test cases.
