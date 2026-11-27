# Keycloak — Identity and Authentication

## 1. Overview

Keycloak serves as the centralized identity provider for the MFA Security System. It manages user identities, credentials, authentication flows, TOTP verification, roles, sessions, tokens, and authentication security policies.

## 2. Environment

| Component | Configuration |
|---|---|
| Operating System | Kali Linux |
| Keycloak Version | 26.8.2 |
| Installed Java Version | OpenJDK 25.0.4 |
| Realm | `multi-factor-authentication` |
| Authentication Protocol | OpenID Connect (OIDC) |
| Authorization Flow | Authorization Code |
| PKCE Method | S256 |

## 3. Authentication Methods

The realm uses two dedicated clients with separate authentication flows.

| Configuration | TOTP | Face Verification |
|---|---|---|
| Client ID | `gate-totp` | `gate-face` |
| Browser Flow | `mfa-totp-browser` | `mfa-face-browser` |
| First Factor | Password | Password |
| Second Factor | TOTP | Face Verification |
| Verification Location | Keycloak | Keycloak and External Verifier |

Keycloak verifies both authentication factors in the TOTP flow. In the face authentication flow, Keycloak verifies the password, while facial verification is performed externally.

Authentication Method Reference (AMR) mappers communicate the completed Keycloak authentication methods through issued tokens.

## 4. Security Controls

| Security Control | Purpose |
|---|---|
| Password Policy | Enforces password requirements |
| TOTP Policy | Controls OTP generation and reuse |
| Brute-Force Detection | Restricts repeated authentication failures |
| Role Mapping | Associates users with application roles |
| Session Management | Restricts session duration and inactivity |
| Token Security | Controls token lifetime and refresh behavior |
| User Event Logging | Records authentication-related events |
| Admin Event Logging | Records administrative configuration changes |
| HTTPS | Protects authentication traffic in transit |

## 5. Realm Roles

| Role | Purpose |
|---|---|
| `regular_user` | Standard application access |
| `administrator` | Administrator-level application access |

Keycloak manages role assignments and communicates role information through tokens. Application-level permissions are enforced by the application backend.

## 6. Directory Structure

| File | Description |
|---|---|
| `README.md` | Keycloak component overview |
| `AUTHENTICATION_FLOWS.md` | Authentication flows, client configuration, and AMR mappings |
| `SECURITY_CONFIGURATION.md` | Security policies and detailed configuration values |
| `DEPLOYMENT.md` | Realm import, HTTPS configuration, and integration parameters |

## 7. Realm Configuration

The realm configuration can be exported and imported to reproduce the identity provider setup across compatible Kali Linux environments.

The original realm export is distributed privately. Client credentials, user accounts, and TOTP enrollment may require separate provisioning after import.

For deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

## 8. Security and Confidentiality

The following sensitive information must not be committed to the repository:

- User credentials.
- Client secrets.
- TOTP enrollment secrets.
- Access and refresh tokens.
- TLS private keys.
- Keycloak runtime databases.

Only reviewed, non-sensitive documentation and sanitized configuration artifacts are suitable for publication.

## 9. References

- [Authentication Flows](AUTHENTICATION_FLOWS.md)
- [Security Configuration](SECURITY_CONFIGURATION.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Official Keycloak Documentation](https://www.keycloak.org/documentation)
