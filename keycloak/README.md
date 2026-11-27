# Keycloak — Identity and Authentication

## Overview

This directory documents the Keycloak identity and authentication configuration for the MFA Security System project.

**Responsible Team Member:** Omar Al-Jaouni

## Environment

- Operating System: Kali Linux
- Identity Provider: Keycloak
- Java Version: OpenJDK 25.0.4
- Realm: `multi-factor-authentication`

## Configured Components

- TOTP authentication client (`gate-totp`).
- Face authentication client (`gate-face`).
- Custom authentication flows.
- Client-specific authentication flow bindings.
- PKCE S256 configuration.
- Authentication Method Reference (AMR) mappers.
- User roles and role mappings.
- Password security policy.
- TOTP security policy.
- Brute-force protection.
- User and administrator event logging.
- Session security configuration.

## Authentication Methods

### Password + TOTP

Keycloak handles password authentication and time-based one-time password verification.

### Password + Face Verification

Keycloak handles password authentication, while the application backend is responsible for completing face verification before granting protected access.

## Backend Integration

The exported realm configuration has been shared privately with the backend developer.

Remaining integration settings, including audience mapping, final callback URLs, HTTPS configuration, and backend token validation, will be coordinated with the responsible team members.

## Implementation Status

The core Keycloak configuration has been prepared. Integration and independent security testing remain pending.

## Security Notice

Client secrets, user credentials, OTP seeds, private keys, and authentication tokens must not be committed to this repository.
