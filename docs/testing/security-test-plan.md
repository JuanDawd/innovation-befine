# Security test plan -- Innovation Befine

> **Scope:** RBAC enforcement, input validation, session security, data exposure, rate limiting, CSRF, CSP, PII scrubbing.
> **Roles:** admin, secretary, stylist, clothier.
> **Auth provider:** Better Auth (self-hosted, session-based).
> **Reference:** `docs/testing/rbac-matrix.md` for the full permission matrix.

---

## 1. RBAC negative tests

Every "No" cell in `docs/testing/rbac-matrix.md` must have an automated integration test that verifies the role receives a 403 response or is redirected. Tests must hit the server action or API route directly (not just check UI visibility).

### Test structure

For each restricted action:

```
Given: authenticated session for role X
When:  role X calls the restricted endpoint/action
Then:  server returns 403 Forbidden
And:   no side effect occurs (no row created, no state change)
```

### Priority endpoints for RBAC negative testing

These are the highest-risk boundaries. All must be automated and run on every PR.

| Endpoint / action                       | Allowed roles                   | Roles that must receive 403  |
| --------------------------------------- | ------------------------------- | ---------------------------- |
| POST /api/business-day/open             | admin                           | secretary, stylist, clothier |
| POST /api/business-day/close            | admin                           | secretary, stylist, clothier |
| POST /api/business-day/reopen           | admin                           | secretary, stylist, clothier |
| POST /api/employees (create)            | admin                           | secretary, stylist, clothier |
| PUT /api/employees/:id (edit)           | admin                           | secretary, stylist, clothier |
| POST /api/employees/:id/deactivate      | admin                           | secretary, stylist, clothier |
| POST /api/catalog/services (create)     | admin                           | secretary, stylist, clothier |
| PUT /api/catalog/services/:id           | admin                           | secretary, stylist, clothier |
| POST /api/catalog/cloth-pieces (create) | admin                           | secretary, stylist, clothier |
| POST /api/tickets (create)              | admin, secretary, stylist (own) | clothier                     |
| POST /api/tickets/:id/checkout          | admin                           | secretary, stylist, clothier |
| POST /api/tickets/:id/override-price    | admin                           | secretary, stylist, clothier |
| POST /api/tickets/:id/reopen            | admin                           | secretary, stylist, clothier |
| POST /api/payouts (record)              | admin                           | secretary, stylist, clothier |
| GET /api/earnings/all                   | admin                           | secretary, stylist, clothier |
| GET /api/analytics/\*                   | admin                           | secretary, stylist, clothier |
| POST /api/batches/:id/approve-piece     | admin, secretary                | stylist, clothier            |
| POST /api/appointments (create)         | admin, secretary                | stylist, clothier            |
| POST /api/large-orders (create)         | admin, secretary                | stylist, clothier            |
| POST /api/data-migration                | admin                           | secretary, stylist, clothier |

### Stylist self-only constraint

Stylists can create tickets only for themselves. Verify:

| Test                                                 | Expected                                        |
| ---------------------------------------------------- | ----------------------------------------------- |
| Stylist Ana creates ticket with employee_id = Ana    | 201 Created                                     |
| Stylist Ana creates ticket with employee_id = Carlos | 403: "Stylists can only log their own services" |

---

## 2. Input validation

All mutation endpoints must reject malicious and malformed inputs. Zod schemas provide the first line of defence; these tests verify the schemas are applied correctly.

### 2.1 SQL injection patterns

Test each string input field (client name, guest name, service description, adjustment reason, cancellation reason, notes) with these payloads:

| Payload                            | Expected                                       |
| ---------------------------------- | ---------------------------------------------- |
| `' OR '1'='1`                      | Rejected by Zod or sanitized; no SQL execution |
| `'; DROP TABLE tickets; --`        | Rejected; no schema change                     |
| `1; SELECT * FROM employees`       | Rejected for non-numeric fields                |
| `UNION SELECT password FROM users` | Rejected                                       |

Verify: no unescaped SQL is executed. Drizzle ORM parameterizes all queries, but test at the API boundary to confirm Zod catches these before they reach the ORM.

### 2.2 XSS payloads

Test each text field rendered in the UI:

| Payload                            | Expected                                       |
| ---------------------------------- | ---------------------------------------------- |
| `<script>alert('xss')</script>`    | Stored as plain text; rendered escaped in HTML |
| `<img src=x onerror=alert('xss')>` | Rendered as text, not as HTML element          |
| `javascript:alert('xss')`          | Not rendered as a link                         |
| `" onclick="alert('xss')`          | Attribute injection blocked                    |

React's JSX escapes by default, but verify that no `dangerouslySetInnerHTML` usage bypasses this.

### 2.3 Oversized inputs

| Field             | Max expected length  | Test input         | Expected                    |
| ----------------- | -------------------- | ------------------ | --------------------------- |
| Client name       | 255 chars            | 10,000 char string | Rejected: "Name too long"   |
| Guest name        | 255 chars            | 10,000 char string | Rejected: "Name too long"   |
| Notes fields      | 2,000 chars          | 50,000 char string | Rejected: "Text too long"   |
| Override reason   | 500 chars            | 10,000 char string | Rejected: "Reason too long" |
| Adjustment reason | 500 chars            | 10,000 char string | Rejected                    |
| Email             | 254 chars (RFC 5321) | 500 char string    | Rejected: "Invalid email"   |

### 2.4 Special characters (Spanish names)

These must be **accepted** without error:

| Input                         | Expected |
| ----------------------------- | -------- |
| Maria Jose                    | Accepted |
| Alejandra Munoz               | Accepted |
| O'Brien-Gomez                 | Accepted |
| Juan Carlos de la Cruz III    | Accepted |
| Luz Dary (nickname "Luchita") | Accepted |

### 2.5 Empty and whitespace strings

| Field           | Input | Expected                       |
| --------------- | ----- | ------------------------------ |
| Client name     | ""    | Rejected: "Name is required"   |
| Client name     | " "   | Rejected: treated as empty     |
| Guest name      | ""    | Rejected (if no client_id)     |
| Override reason | ""    | Rejected: "Reason is required" |
| Notes           | ""    | Accepted (notes are optional)  |

### 2.6 Numeric field validation

| Field          | Input | Expected                                              |
| -------------- | ----- | ----------------------------------------------------- |
| Price          | -1    | Rejected: "Must be >= 0"                              |
| Price          | 1.5   | Rejected: "Must be a whole number (COP has no cents)" |
| Commission %   | 101   | Rejected: "Must be between 0 and 100"                 |
| Commission %   | -5    | Rejected: "Must be >= 0"                              |
| Payment amount | 0     | Accepted (zero-price services)                        |

---

## 3. Session security

### 3.1 Cookie flags

Verify the session cookie set by Better Auth has the following attributes:

| Attribute | Required value | Why                                         |
| --------- | -------------- | ------------------------------------------- |
| HttpOnly  | true           | Prevents JavaScript access to session token |
| Secure    | true           | Cookie sent only over HTTPS                 |
| SameSite  | Lax or Strict  | Prevents CSRF via cross-site requests       |
| Path      | /              | Available on all routes                     |
| Max-Age   | Configured     | Session timeout defined (verify the value)  |

Test method: inspect `Set-Cookie` header on login response.

### 3.2 Session timeout

| Scenario                                     | Expected                                    |
| -------------------------------------------- | ------------------------------------------- |
| Session idle for configured timeout duration | Next request returns 401; redirect to login |
| Active session within timeout                | Request succeeds normally                   |
| Session cookie deleted client-side           | Next request returns 401                    |

### 3.3 Session invalidation on deactivation

| Step | Action                                        | Expected                           |
| ---- | --------------------------------------------- | ---------------------------------- |
| 1    | Employee "Carlos" is logged in on two devices | Both sessions active               |
| 2    | Admin deactivates Carlos                      | --                                 |
| 3    | Carlos's next request on Device 1             | 401; redirected to login           |
| 4    | Carlos's next request on Device 2             | 401; redirected to login           |
| 5    | Carlos attempts to log in                     | Rejected: "Account is deactivated" |

### 3.4 Session after password change

| Scenario                                         | Expected                       |
| ------------------------------------------------ | ------------------------------ |
| Employee changes password                        | Current session remains active |
| Employee logs in on new device with old password | Rejected                       |
| Employee logs in on new device with new password | Succeeds                       |

---

## 4. Data exposure verification

API responses must not leak data that the requesting role should not see. These tests call endpoints as each role and inspect the response payload for forbidden fields.

### 4.1 Secretary cannot see financial data

| Endpoint                      | Secretary response must NOT contain                   |
| ----------------------------- | ----------------------------------------------------- |
| GET /api/tickets/:id          | `commission_pct`, `override_price`, employee earnings |
| GET /api/employees/:id        | `daily_rate`, `show_earnings`, payout history         |
| GET /api/business-day/current | Revenue totals, earnings summaries                    |

### 4.2 Stylist cannot see other employees' data

| Endpoint               | Stylist response must NOT contain                 |
| ---------------------- | ------------------------------------------------- |
| GET /api/employees     | Other employees' `daily_rate`, earnings data      |
| GET /api/earnings      | Earnings for any employee other than self         |
| GET /api/tickets (all) | Tickets belonging to other stylists (if filtered) |

### 4.3 Clothier data isolation

| Endpoint               | Clothier response must NOT contain                                 |
| ---------------------- | ------------------------------------------------------------------ |
| GET /api/batches       | Pieces assigned to other clothiers (unassigned pieces ARE visible) |
| GET /api/employees     | Financial data for any employee                                    |
| Any analytics endpoint | Full 403 (no partial data)                                         |

### 4.4 Error responses must not leak internals

| Error scenario   | Response must NOT contain                                   |
| ---------------- | ----------------------------------------------------------- |
| Invalid endpoint | Stack trace, file paths, DB connection strings              |
| Database error   | Raw SQL error messages, table names                         |
| Auth error       | Whether the email exists (use generic message)              |
| Validation error | Internal field names or schema details beyond what's needed |

---

## 5. Rate limiting

Verify mutation endpoints are rate-limited per the policy defined in T097 (`docs/standards-api.md`).

| Endpoint                      | Rate limit            | Test method                                            |
| ----------------------------- | --------------------- | ------------------------------------------------------ |
| POST /api/auth/login          | Better Auth default   | Send 20 requests in 10 seconds; verify 429 after limit |
| POST /api/auth/reset-password | 5 requests/hour/email | Send 6 requests for same email; 6th returns 429        |
| POST /api/emails/send         | 10/minute/user        | Send 11 requests; 11th returns 429                     |
| POST /api/tickets             | 30/minute/user        | Send 31 requests; 31st returns 429                     |
| POST /api/payouts             | 5/minute/admin        | Send 6 requests; 6th returns 429                       |

Verify: rate limit responses include `Retry-After` header or a clear message indicating when to retry.

---

## 6. CSRF protection

### 6.1 Verification

| Test                                              | Expected               |
| ------------------------------------------------- | ---------------------- |
| POST mutation without CSRF token (if token-based) | 403 Forbidden          |
| POST mutation with invalid CSRF token             | 403 Forbidden          |
| POST mutation with valid CSRF token               | Request succeeds       |
| GET requests (read-only)                          | No CSRF token required |

If using SameSite=Strict/Lax cookies as the CSRF defence (no separate token), verify that cross-origin POST requests from a different domain are rejected by the browser.

### 6.2 Server Actions

Next.js Server Actions have built-in CSRF protection. Verify:

- Server Actions called via standard form submission or `useActionState` work correctly.
- Direct POST to the Server Action endpoint from an external origin is rejected.

---

## 7. Content Security Policy (CSP)

Verify the following CSP headers are set on all HTML responses:

| Directive       | Expected value                                              |
| --------------- | ----------------------------------------------------------- |
| default-src     | `'self'`                                                    |
| script-src      | `'self'` (plus nonces if needed for inline scripts)         |
| style-src       | `'self' 'unsafe-inline'` (Tailwind/Styletron may need this) |
| img-src         | `'self' data:`                                              |
| connect-src     | `'self'` + Pusher domains + Sentry domain + Resend          |
| font-src        | `'self'`                                                    |
| frame-ancestors | `'none'` (prevent clickjacking)                             |

Test: load the app and verify no CSP violations in the browser console. If violations exist, they indicate either a misconfigured policy or an inline script/style that needs refactoring.

---

## 8. PII protection in error reporting

### 8.1 Sentry scrubbing (T085)

Verify the `beforeSend` hook in Sentry configuration scrubs PII:

| Data type              | Must be scrubbed from Sentry events                  |
| ---------------------- | ---------------------------------------------------- |
| Client names           | Yes                                                  |
| Client email addresses | Yes                                                  |
| Client phone numbers   | Yes                                                  |
| Employee names         | Yes (or pseudonymized)                               |
| Payment amounts        | No (financial data is useful for debugging, not PII) |
| Session tokens         | Yes                                                  |
| Database queries       | Yes (if they contain client data)                    |

Test method: trigger a deliberate error in a handler that processes client data. Verify the Sentry event (via Sentry API or dashboard) does not contain the client's name, email, or phone.

### 8.2 API error responses

No error response (4xx or 5xx) should include:

- Client PII (names, emails, phones).
- Employee PII beyond what the requesting role should see.
- Database table names or column names.
- File paths or stack traces (in production mode).

Test by triggering errors with requests that include PII in the body and verifying the error response contains only the generic error shape defined in `docs/standards-api.md`.

---

## 9. Security test execution schedule

| Test category        | When to run                     | Automation               |
| -------------------- | ------------------------------- | ------------------------ |
| RBAC negative tests  | Every PR                        | Vitest integration tests |
| Input validation     | Every PR                        | Vitest unit tests        |
| Session cookie flags | After auth changes              | Playwright check         |
| Data exposure        | Every PR (for new endpoints)    | Vitest integration tests |
| Rate limiting        | After rate limit config changes | Manual + Vitest          |
| CSRF                 | After auth or form changes      | Playwright               |
| CSP headers          | After dependency changes        | Playwright header check  |
| PII scrubbing        | After Sentry config changes     | Manual verification      |

---

## 10. Pre-launch security checklist

Before production go-live (T089), verify all of the following:

- [ ] All RBAC negative tests pass (full matrix from `rbac-matrix.md`)
- [ ] Input validation tests cover all mutation endpoints
- [ ] Session cookies have HttpOnly, Secure, SameSite flags
- [ ] CSP headers configured and no violations in console
- [ ] Rate limiting active on all mutation endpoints
- [ ] CSRF protection verified on all Server Actions and API routes
- [ ] Sentry PII scrubbing verified with test events
- [ ] Error responses contain no internal details (stack traces, SQL, file paths)
- [ ] No API endpoint returns data the requesting role should not see
- [ ] Password reset tokens expire after 1 hour
- [ ] Deactivated employee sessions are immediately invalidated
- [ ] HTTPS enforced on production domain (Vercel handles this)
