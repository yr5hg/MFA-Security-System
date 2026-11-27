# Keycloak Deployment

## 1. Environment

| Component | Configuration |
|---|---|
| Operating System | Kali Linux |
| Keycloak Version | 26.8.2 |
| Installed Java Version | OpenJDK 25.0.4 |
| Realm | `multi-factor-authentication` |

Verify the installed software versions:

```bash
java -version
bin/kc.sh --version
```

Installation instructions are documented in [KALI_SETUP.md](../KALI_SETUP.md).

## 2. Service Configuration

| Component | Address |
|---|---|
| Local Development | `http://127.0.0.1:8080` |
| Keycloak HTTPS | `https://id.test:8443` |
| Application Gate | `https://gate.test:8444` |
| Local Listen Address | `127.0.0.1` |

The HTTPS addresses represent the intended integrated laboratory deployment.

For a single-VM deployment, configure the following hostname mappings in `/etc/hosts`:

```text
127.0.0.1 id.test
127.0.0.1 gate.test
```

## 3. Realm Configuration

The realm configuration contains:

- Authentication clients and browser flow bindings.
- Authentication executions and authenticator references.
- Protocol mappers.
- Realm roles.
- Password and OTP policies.
- Brute-force protection.
- Session and token settings.
- Security event configuration.

### Realm Export

Navigate to:

`Realm settings → Action → Partial export`

Enable the export of clients, groups and roles.

Save the configuration as `realm-export.json` and distribute it privately.

### Realm Import

1. Open the Keycloak administration console.
2. Select **Create realm**.
3. Upload the exported JSON configuration.
4. Review and import the configuration.
5. Provision the required test accounts and client credentials.

A partial realm export does not include user accounts, runtime sessions, historical event logs or TLS private keys. Client secrets require separate configuration.

Existing realm configurations must be backed up before replacement.

## 4. HTTPS Configuration

The integrated deployment requires trusted HTTPS certificates for the identity provider and application gate.

| Requirement | Configuration |
|---|---|
| Identity Provider Hostname | `id.test` |
| Application Hostname | `gate.test` |
| Keycloak HTTPS Port | 8443 |
| Gate HTTPS Port | 8444 |
| Certificate Validation | Enabled |
| Private Key Storage | Outside the repository |

Certificates must contain the corresponding hostnames in their subject alternative names.

The laboratory certificate authority must be trusted by the browser and participating services.

### Keycloak Startup

From the Keycloak installation directory:

```bash
bin/kc.sh start \
  --hostname=https://id.test:8443 \
  --https-certificate-file=/secure/lab/id.test.crt \
  --https-certificate-key-file=/secure/lab/id.test.key
```

The certificate paths follow the examples in `KALI_SETUP.md` and must be replaced with the actual provisioned paths when necessary.

This command requires a compatible database configuration, valid certificates, administrator provisioning and appropriate file permissions.

Development-mode HTTP must not be used for the final integrated security tests.

## 5. OpenID Connect Configuration

### Realm Endpoints

| Parameter | Value |
|---|---|
| Realm | `multi-factor-authentication` |
| Issuer | `https://id.test:8443/realms/multi-factor-authentication` |
| Resource Audience | `lab-resource` |

### Discovery Endpoint

```text
https://id.test:8443/realms/multi-factor-authentication/.well-known/openid-configuration
```

### Client Configuration

| Setting | TOTP Client | Face Client |
|---|---|---|
| Client ID | `gate-totp` | `gate-face` |
| Protocol | OpenID Connect | OpenID Connect |
| Client Authentication | Enabled | Enabled |
| Standard Flow | Enabled | Enabled |
| PKCE | S256 | S256 |
| Browser Flow | `mfa-totp-browser` | `mfa-face-browser` |

### Valid Redirect URIs

| Client | Redirect URI |
|---|---|
| `gate-totp` | `https://gate.test:8444/oidc/totp/callback` |
| `gate-face` | `https://gate.test:8444/oidc/face/callback` |

Redirect URIs must match the corresponding application endpoints exactly.

### Audience Mapping

The intended audience configuration for both clients is:

| Setting | Value |
|---|---|
| Mapper Type | Audience |
| Included Custom Audience | `lab-resource` |
| Add to Access Token | ON |
| Add to ID Token | OFF |

### Realm Roles

| Role |
|---|
| `regular_user` |
| `administrator` |

Role names must match the application authorization configuration.

## 6. Integration Environment

The following parameters match the project environment configuration:

```env
GATE_ORIGIN=https://gate.test:8444
GATE_LISTEN_HOST=127.0.0.1

KEYCLOAK_ISSUER=https://id.test:8443/realms/multi-factor-authentication
KEYCLOAK_TOTP_CLIENT_ID=gate-totp
KEYCLOAK_FACE_CLIENT_ID=gate-face
RESOURCE_AUDIENCE=lab-resource

TOTP_CLIENT_SECRET_FILE=/etc/mfa-lab/totp-client.secret
FACE_CLIENT_SECRET_FILE=/etc/mfa-lab/face-client.secret

LAB_CA_FILE=/etc/mfa-lab/lab-ca.crt
GATE_TLS_CERT_FILE=/etc/mfa-lab/gate.crt
GATE_TLS_KEY_FILE=/etc/mfa-lab/gate.key
```

See the repository's [`.env.example`](../.env.example) for the complete application environment configuration.

Actual client secrets and private keys must be provisioned locally and excluded from version control.

## 7. Deployment Verification

Verify the following before integrated testing:

- Keycloak HTTPS availability.
- Certificate and hostname validation.
- Realm configuration and client flow bindings.
- Client authentication and PKCE.
- Exact callback URLs.
- Expected AMR, audience and role claims.

Detailed security test cases are maintained in [test_cases.md](../test_cases.md).

## References

- [Authentication Flows](AUTHENTICATION_FLOWS.md)
- [Security Configuration](SECURITY_CONFIGURATION.md)
- [Kali Setup](../KALI_SETUP.md)
- [Keycloak TLS Documentation](https://www.keycloak.org/server/enabletls)
- [Keycloak Import and Export](https://www.keycloak.org/server/importExport)
