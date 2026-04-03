---
description: OWASP Top 10 security audit scoped to the current diff.
allowed-tools: Bash, Read, Glob, Grep
---

Run an OWASP Top 10 security audit scoped to the current git diff. Check each category against the changed files and report PASS, N/A, or **FAIL** with evidence. Any FAIL is a blocker.

---

**Step 1: Get the diff**

```bash
git diff HEAD --name-only
git diff --cached --name-only
```

Read each changed file for full context.

---

**Step 2: Audit each category**

**A1: Injection**
- SQL injection via Prisma `$queryRaw` / `$executeRaw` — parameters interpolated unsafely?
- Command injection via `child_process`, `exec`, `spawn`?
- Template injection — user input in HTML templates without escaping?

**A2: Broken Authentication**
- All new API routes check `getServerSession(authOptions)`?
- Sync endpoints use `x-sync-secret` header auth?
- Token handling — tokens logged, exposed in URLs, stored insecurely?

**A3: Sensitive Data Exposure**
- Secrets hardcoded in source (API keys, passwords)?
- PII logged in console or error messages?
- Sensitive data in API responses (passwords, tokens)?
- API keys masked in GET /api/integrations responses?

**A4: XML External Entities (XXE)**
- Any XML parsing introduced? External entity processing disabled?

**A5: Broken Access Control**
- Missing auth on endpoints?
- IDOR — can user access another's resources by changing ID? (N/A for single-user app, but check sync endpoints)
- Sync endpoints properly authenticated?

**A6: Security Misconfiguration**
- Verbose error messages exposing internals to clients?
- Debug endpoints accessible in production?
- Default credentials or secrets?

**A7: Cross-Site Scripting (XSS)**
- `dangerouslySetInnerHTML` with unsanitized input?
- Artifact iframe sandbox attribute present (`allow-scripts` only, no `allow-same-origin`)?
- User input rendered without escaping?

**A8: Insecure Deserialization**
- `JSON.parse()` on raw user input without validation?
- Object spread from request body without field whitelisting?
- API route request body validated before use?

**A9: Using Components with Known Vulnerabilities**
- New dependencies added? Run `npm audit`.
- Dependency versions pinned or wide ranges?

**A10: Insufficient Logging & Monitoring**
- Security-relevant events logged (failed auth, sync errors)?
- Errors silently swallowed?

---

**Step 3: Verdict**

| Category | Result | Notes |
|----------|--------|-------|
| A1: Injection | PASS/N-A/FAIL | ... |
| A2: Broken Auth | PASS/N-A/FAIL | ... |
| A3: Sensitive Data | PASS/N-A/FAIL | ... |
| A4: XXE | PASS/N-A/FAIL | ... |
| A5: Access Control | PASS/N-A/FAIL | ... |
| A6: Misconfig | PASS/N-A/FAIL | ... |
| A7: XSS | PASS/N-A/FAIL | ... |
| A8: Deserialization | PASS/N-A/FAIL | ... |
| A9: Vulnerable Deps | PASS/N-A/FAIL | ... |
| A10: Logging | PASS/N-A/FAIL | ... |

**Final**: PASS (all clear) or **BLOCKED** (list all FAILs with fix instructions)
