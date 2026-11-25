# Expected vs observed test matrix (not yet executed)

| ID | Case | Expected | Observed |
|---|---|---|---|
| T-01 | TOTP path: correct password, fresh TOTP, allowed role, no voice | Allow | Pending |
| T-02 | Incorrect password | No accepted Keycloak login | Pending |
| T-03 | TOTP path: correct password, missing TOTP | Deny | Pending |
| T-04 | TOTP path: incorrect TOTP | Deny | Pending |
| T-05 | Code outside configured valid window | Deny | Pending |
| T-06 | Reuse previously accepted code | Deny under configured policy; investigate actual behavior | Pending |
| T-07 | OTP not enrolled | No usable login until required setup/verification | Pending |
| T-08 | Existing browser SSO / alternate grant | No usable bypass of required factors of selected path | Pending |
| T-09 | Voice path: correct password, no voice | Protected operation denied | Pending |
| T-10 | Voice path: nonmatching speaker | Expected deny; document false accept if observed | Pending |
| T-11 | No valid token / wrong audience or issuer | Deny | Pending |
| T-12 | Expired/revoked token before action | Deny | Pending |
| T-13 | Direct resource read by demo OS user | Deny | Pending |
| T-14 | Arbitrary launcher argument or unauthorized service-account command | Deny | Pending |
| T-15 | Forged match flag / caller-chosen reference, role or threshold | Deny | Pending |
| T-16 | Either completed path, regular user asks admin operation | Deny | Pending |
| T-17 | Either completed path, administrator requests allowed admin operation | Allow | Pending |
| T-18 | Unapproved enrollment / another account target | Deny | Pending |
| T-19 | Approved enrollment | Store for trusted subject only; no resource pass | Pending |
| T-20 | Approved reference replacement | Old version and attempts invalidated | Pending |
| T-21 | Password or TOTP recovery | Revoke affected sessions; require fresh complete selected login | Pending |
| T-22 | Previous session pass/new attempt | Deny until fresh checks | Pending |
| T-23 | Missing model, timeout, malformed verdict | Deny | Pending |
| T-24 | Invalid audio, unavailable microphone, oversized sample | Deny | Pending |
| T-25 | Consented replayed voice | Observe, may accept; report limitation | Pending |
| T-26 | Consented synthetic/imitation attempt (optional) | Observe, no guaranteed detection | Pending |
| T-27 | Concurrent attempt/reset or interrupted gate | No stale pass; safe cleanup | Pending |
| T-28 | Repeated wrong attempts across login restarts | Account-level throttle according to policy | Pending |
| T-29 | Scoped Nmap/traffic/permission check | Only intended lab exposure; no secret leakage | Pending |
| T-30 | Isolated password-only baseline vs password+TOTP vs password+voice | Measure actual decisions and time | Pending |

| T-31 | Voice path: correct password, genuine voice, no TOTP | Allow if match passes frozen threshold | Pending |
| T-32 | Voice-client token presented to TOTP path | Deny | Pending |
| T-33 | TOTP-client token substituted into voice attempt | Deny | Pending |
| T-34 | Switch paths after partial login; attempt to reuse token or match | Cancel and restart; old proof denied | Pending |
| T-35 | Failed OTP or voice attempt triggers automatic alternative | No automatic fallback; deny selected attempt | Pending |
| T-36 | Invalid or tampered method selection | Deny; no protected action | Pending |
| T-37 | Voice path with no active approved reference | Deny; supervised enrollment required | Pending |
| T-38 | Voice-verified admin attempts enrollment approval without TOTP path | Deny sensitive approval | Pending |
| T-39 | TOTP success while microphone/model unavailable | Allow if role valid; voice not required | Pending |
| T-40 | Both paths: same subject and role, wrong client/audience | Correct identity on each; substituted token denied | Pending |

For each completed case record date, operator, versions, sanitized evidence reference, observed outcome, pass/fail and linked bug. For biometric evaluation record genuine/impostor trial counts and threshold fixed before evaluation; never turn expected results into actual ones. Use anonymized labels only. Delete private audio according to consent and retention policy.
