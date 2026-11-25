
# System architecture

**Design for the Kali lab.** The browser captures pixels. Keycloak validates account credentials. One local Node application owns session state, a private Human worker and access to the protected resource. One operation consumes one authentication attempt. The [integration contract](contracts/api.md) defines the exact handoffs.

## Components and data boundaries

```mermaid
flowchart TD
    B["Kali browser"]
    I["Keycloak"]
    G["Node gate"]
    H["Private Human worker"]
    S["Private state and templates"]
    R["Protected resource"]

    B -->|"Credentials at identity origin"| I
    B -->|"Choice and camera frame"| G
    G -->|"Code exchange and introspection"| I
    G -->|"Bounded image and own reference"| H
    H -->|"Validated comparison output"| G
    G --> S
    G -->|"Authorized operation only"| R
```

Everything depicted runs inside the guest. The separate authenticator device only generates TOTP codes. Human runs as an internal worker with a time budget; a worker failure must leave TOTP usable.

Store private state outside both the repository and the static UI directory under a dedicated OS account. Ordinary demo users cannot change service code, configuration, reference files or the protected operation.

## Password plus TOTP

```mermaid
sequenceDiagram
    actor U as User
    participant G as Gate
    participant K as Keycloak
    participant R as Resource

    U->>G: Select TOTP and action
    G-->>U: Redirect for bound TOTP login
    U->>K: Fresh password and authenticator code
    K-->>U: Redirect with authorization code
    U->>G: Return on TOTP callback
    G->>K: Exchange code and validate identity

    alt Current pwd and otp evidence and authorized role
        G->>K: Recheck active access token
        G->>R: Consume attempt and perform action
        R-->>G: Authorized result
        G-->>U: Return result
    else Incomplete proof or denied role
        G-->>U: Deny
    end
```

The gate verifies signed evidence of the executed password and OTP steps and prior eligible TOTP enrollment.

Each successful diagram branch assumes the final recheck also succeeds. The camera and worker are outside this route.

## Password plus face

```mermaid
sequenceDiagram
    actor U as User
    participant G as Gate
    participant K as Keycloak
    participant H as Human worker
    participant R as Protected resource

    U->>G: Select face and action
    G-->>U: Redirect for bound face login
    U->>K: Fresh password
    K-->>U: Redirect with authorization code
    U->>G: Return on face callback
    G->>K: Exchange code and validate identity
    G-->>U: Single-use capture challenge
    U->>G: Submit webcam frame
    G->>H: Compare with current subject reference

    alt Acceptable face and matching score
        H-->>G: Score and version metadata
        G->>K: Recheck active identity and role
        G->>G: Check version and consume authorized action
        G->>R: Perform authorized operation
        R-->>G: Authorized result
        G-->>U: Return result
    else Quality failure or mismatch
        G-->>U: Deny and end attempt
    end
```

A gate challenge binds a submission to an attempt. It cannot certify when or how the submitted pixels were captured.

Similar-looking people, poor light, camera resolution, photos and video can affect outcomes. Blink cues or a successful browser demo do not establish liveness.

A person who can supply a convincing presentation may pass the face route even when server-side matching works as designed.

## Face enrollment and replacement

```mermaid
flowchart TD
    A["Administrator completes password and TOTP"]
    I{"Supervised identity check?"}
    P["Issue targeted one-use approval"]
    U["Owner completes fresh password and TOTP"]
    C{"Consent and acceptable face?"}
    V{"Approval and version current?"}
    S["Commit descriptor and consume approval"]
    E["Invalidate old proof and end enrollment"]
    D["Deny"]

    A --> I
    I -->|"Yes"| P
    I -->|"No"| D
    P --> U
    U --> C
    C -->|"No"| D
    C -->|"Yes"| V
    V -->|"No"| D
    V -->|"Yes"| S
    S --> E
```

First-admin bootstrap is supervised offline. The operator handling factor administration is distinct from the target when approval would otherwise be self-issued.

Concurrent replacement and dispatch use the same subject/version lock. Recovery preserves roles and invalidates active sessions before access resumes.

## Protected access and failure handling

```mermaid
flowchart TD
    A["Revalidate identity and selected client"]
    I{"Current attempt and allowed role?"}
    M{"Selected method"}
    T{"Current password and OTP evidence?"}
    F{"Current password and bound face match?"}
    C{"Unused attempt and bound action?"}
    R["Consume once and dispatch"]
    X["Deny and clear transient proof"]

    A --> I
    I -->|"No"| X
    I -->|"Yes"| M
    M -->|"TOTP"| T
    M -->|"Face"| F
    M -->|"Unknown method"| X
    T -->|"No"| X
    F -->|"No"| X
    T -->|"Yes"| C
    F -->|"Yes"| C
    C -->|"Yes"| R
    C -->|"No"| X
```

Mismatch, unknown authentication method, identity-provider outage, missing role, expired token, stale callback, malformed input or verifier timeout produces a bounded failure for the affected path.

Cancellation, a method switch or logout clears transient proof. A switch begins a fresh login.

Login failures and dispatch outcomes are audited with safe identifiers. The [test matrix](test_cases.md) includes independent TOTP operation during a face-worker outage, stale-version handling and direct resource denial.
