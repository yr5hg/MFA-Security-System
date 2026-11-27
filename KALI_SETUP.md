# Kali Linux setup and first integrated milestone

**Project:** Password + TOTP or experimental Human Face Verification  
**Environment:** Kali Linux on Oracle VirtualBox  
**Technologies:** Keycloak, JavaScript/Node.js, Human and browser webcam; no Python  
**Status:** Setup guide. Integrated authentication and acceptance tests remain pending.

## 1. Prepare Kali · All members

The team reports a working Kali guest, webcam passthrough, Node.js/npm, Git and a local Human camera demo. Verify these items on the current VM and record its snapshot and software versions. Use an ordinary user and an isolated lab network.

```
cat /etc/os-release
uname -m
node --version
npm --version
git --version
java -version
```

Refresh the package index and install the laboratory utilities:

```
sudo apt update
sudo apt install -y git curl jq ca-certificates unzip openssl \
  guvcview v4l-utils nmap iproute2
```

For Hamzeh's authorized packet inspection, install Wireshark if needed:

```
sudo apt install -y wireshark
```

If Node.js/npm are missing, check the available versions before installation:

```
apt-cache policy nodejs npm
# Run only if they are missing and the versions are compatible:
sudo apt install -y nodejs npm
```

For Keycloak 26.8.2, the official ZIP guide calls for **OpenJDK 25**. Check whether your Kali repositories provide it; otherwise install a compatible, supported JDK using its official distribution instructions. Do not assume the package exists:

```
apt-cache policy openjdk-25-jdk
# Run only when this package is available:
sudo apt install -y openjdk-25-jdk
java -version
```

Do not replace a working Node installation without checking Human and TensorFlow.js compatibility. Do not run the application or Keycloak as root.

## 2. Verify the webcam · Sara

```
ls -l /dev/video*
v4l2-ctl --list-devices
guvcview
```

If no camera appears, check VirtualBox passthrough, applications using the webcam on the host, and the Kali user's device permissions. Close `guvcview` before browser testing. Missing devices, permission denial or cancelled capture must not create successful face verification.

## 3. Repeat the Human browser demo · Sara and Yousef

Use the existing working Human clone. On a fresh Kali guest, download it **outside the team repository**:

```
cd ~
git clone https://github.com/vladmandic/human.git
cd human
git rev-parse HEAD
ls demo/faceid
ls dist models
```

If the cloned release lacks built `dist/` or model assets, follow its pinned upstream build/setup instructions. From the Human repository root, serve the demo locally:

```
npx --yes http-server@14.1.1 . -a 127.0.0.1 -p 8081 -c-1
```

Open `http://localhost:8081/demo/faceid/index.html` **in Kali's browser** and allow camera access. Confirm the camera and JavaScript/model assets load locally. The first `npx` run may download the server; cache all dependencies before testing offline.

**Limit:** The browser demo's face database or displayed match is not a trusted authorization result. Never connect a client-side success flag directly to a protected operation.

## 4. Test private Human inference · Yousef

Create an isolated Node.js test directory:

```
mkdir -p ~/face-node-probe
cd ~/face-node-probe
npm init -y
npm install --save-exact @vladmandic/human @tensorflow/tfjs-node
npm ls @vladmandic/human @tensorflow/tfjs-node
node -e "const tf = require('@tensorflow/tfjs-node'); console.log(tf.getBackend())"
```

Use a compatible Node version and a supported prebuilt TensorFlow backend. If the native package cannot load without an excluded build toolchain, record the blocker and test another compatible configuration; do not add Python or claim the verifier is ready.

Use the matching [Human Node similarity example](https://github.com/vladmandic/human/blob/main/demo/nodejs/node-similarity.js) to implement a private verifier that:

1. Loads the Node backend before Human and loads pinned models from trusted local paths.
2. Rejects oversized/invalid images and requires exactly one acceptable face.
3. Extracts a valid descriptor with identical enrollment and verification preprocessing.
4. Compares 1:1 with the server-selected reference of the authenticated account.
5. Returns a bounded match, mismatch or typed error; releases image/tensor resources.
6. Calibrates a matching threshold using consenting participants, freezes the rule, then evaluates separate held-out attempts.
7. Handles missing models, malformed data, timeouts and offline inference failures safely.

A successful package installation is not proof of working server-side face comparison. Once the stack works, retain the dependency lockfile and recorded model checksums.

## 5. Install and configure Keycloak · Omar

The following example uses pinned Keycloak **26.8.2** and its official release ZIP. Verify the download using the **ZIP asset's SHA-256** from the official release.

**Omar already installed and configured this release at `~/security-project/keycloak-26.8.2`; do not repeat this download on that VM.**

For a fresh installation only:

```
mkdir -p ~/lab-tools
cd ~/lab-tools
curl -fL -o keycloak-26.8.2.zip \
  https://github.com/keycloak/keycloak/releases/download/26.8.2/keycloak-26.8.2.zip
echo "321ffee62ec28fab18fe885d8cd62cc814edce72a35cd062dc81b504c1a406b3  keycloak-26.8.2.zip" | sha256sum -c -
unzip keycloak-26.8.2.zip
cd keycloak-26.8.2
```

For the **existing Kali VM** and temporary localhost development test, start Keycloak with:

```bash
cd ~/security-project/keycloak-26.8.2
bin/kc.sh start-dev --http-host=127.0.0.1
```

For a fresh install in a different folder, run `bin/kc.sh start-dev --http-host=127.0.0.1` from that installation directory. This is development HTTP mode only, not the final HTTPS integration.

Visit `http://127.0.0.1:8080/admin/` from Kali and sign in using the existing bootstrap administrator on Omar's VM. Create a bootstrap administrator only on a fresh install.

The currently created realm is:

`multi-factor-authentication`

Stop the development instance before final integrated HTTPS security tests.

For the integrated system, configure trusted local HTTPS certificates, a supported Keycloak database/hostname setup and service secrets **outside Git**. These are proposed local addresses, not automatically configured by installation:

| **Component** | **Proposed HTTPS address** |
|---|---|
| Keycloak | `https://id.test:8443` |
| Node gate | `https://gate.test:8444` |

Map both names to `127.0.0.1` in Kali's `/etc/hosts`, configure matching certificates, trust the lab CA in the browser and Node/Keycloak clients, and restrict listeners to lab interfaces. Do not disable certificate checking.

With those prerequisites in place, Keycloak's startup options include:

```
# Replace these example paths with actual protected certificate files.
bin/kc.sh start \
  --hostname=https://id.test:8443 \
  --https-certificate-file=/secure/lab/id.test.crt \
  --https-certificate-key-file=/secure/lab/id.test.key
```

The `/secure/lab/` files do not exist until the team provisions them. This is **not** a complete production startup command without the matching database, hostname, secret and TLS setup.

In the Keycloak administration console:

1. Use the existing `multi-factor-authentication` realm (or create that exact realm on a fresh VM), test accounts and roles `regular_user` and `administrator`.
2. Configure password policy, brute-force protection and supervised TOTP enrollment; test digits, period, time window, clock synchronization and code reuse.
3. Create confidential standard-flow clients `gate-totp` and `gate-face`, with **documented, not-yet-proven** exact callbacks `https://gate.test:8444/oidc/totp/callback` and `https://gate.test:8444/oidc/face/callback`; configure the intended audience and PKCE S256. Confirm these handlers exist in Anas's actual backend before integration tests.
4. Require a fresh password for both selected routes and a fresh OTP for the TOTP route. Verify actual browser-flow execution and signed factor evidence on the pinned release; do not trust client ID or active token alone.
5. Test incorrect/missing/expired TOTP, existing SSO, wrong client/audience and expired sessions. Coordinate account recovery and revocation with Anas.

After trusted HTTPS is configured, check discovery:

```
curl --fail --silent --show-error \
  https://id.test:8443/realms/multi-factor-authentication/.well-known/openid-configuration \
  | jq '{issuer, authorization_endpoint, token_endpoint, introspection_endpoint}'
```

Discovery alone does not prove successful password/TOTP enforcement.

## 6. Integrate the protected application · Anas

The gate is **project code that must be implemented**, not a package installed by Kali.

Follow [the integration contract](https://github.com/yr5hg/MFA-Security-System/blob/main/contracts/api.md):

1. Create a least-privileged service identity and keep private sessions, client secrets, face references and protected files outside the Git repository.
2. Implement the method choice and one-time attempt state, with trusted authorization-code/PKCE callbacks and validation of issuer, signature, audience, subject, factors, expiration and roles.
3. Integrate the complete TOTP route first. Then implement approved face enrollment/replacement and call Yousef's private Human verifier.
4. Bind the face result to the current subject, session, attempt, selected action and reference version. Reject client-supplied success flags, stale proofs and method switching.
5. Recheck the selected factor and role before one allowlisted protected operation. Implement cancellation, throttling, expiry, audit, recovery and reference invalidation.
6. Ensure the TOTP route works even if the face worker is unavailable. Serve the app from a trusted local HTTPS origin with secure, opaque session cookies.

## 7. Execute independent tests · Hamzeh

Use [test_cases.md](https://github.com/yr5hg/MFA-Security-System/blob/main/test_cases.md) to record actual results and sanitized evidence.

Test both successful paths, password-only denial, incorrect roles, session expiry, forged face results, camera/model failures, supervised factor changes, direct resource access, genuine/impostor comparisons, consented photo/screen/video trials and timing.

For approved local network checks:

```
ss -lntp
nmap -sT -p 8080,8081,8443,8444 127.0.0.1
```

Record date, operator, versions, observed outcome and evidence for each executed case; leave unfinished tests `Pending`. Reproduce from a clean VM snapshot without external downloads after caching packages and models.

## 8. Troubleshooting and completion condition

| **Problem** | **What to check** | **Expected security behavior** |
|---|---|---|
| Camera unavailable | VirtualBox passthrough, video device and permissions | No face proof |
| Human models missing | Model paths, hashes and demo assets | Face route unavailable |
| Node backend incompatible | Node version, architecture and prebuilt backend | Keep face integration pending |
| Multiple faces | Detector configuration and server count | Reject capture |
| Keycloak won't start | Java, database, hostname and certificates | No login |
| Password/OTP bypass | Flow configuration, fresh-auth evidence and SSO | Disable affected route |
| Invalid callback or TLS | Redirect URI, hostname, CA trust and audience | Reject callback |
| Direct resource or wrong-role access | Permissions and gate enforcement | Deny operation |

**First integrated milestone:** one actually allowed and one actually denied protected operation on **each** authentication route, independently verified. If a dependency fails, record what worked and keep that route `Pending`.

**Phase 2 deadline:** 30 November 2026.

**References:** [Human installation](https://github.com/vladmandic/human/wiki/Install) · [Keycloak ZIP setup](https://www.keycloak.org/getting-started/getting-started-zip) · [Keycloak TLS setup](https://www.keycloak.org/server/enabletls).
