# Research: Data privacy and compliance — Colombia

> Researched: April 2026. Applicable jurisdiction: **Colombia**. This document addresses data privacy requirements for an internal operations platform that stores PII and financial data.

---

## Applicable law: Ley 1581 de 2012 (Habeas Data)

Colombia's primary data protection statute is **Ley 1581 de 2012** (Régimen General de Protección de Datos Personales), supplemented by:

- **Decreto 1377 de 2013** — regulatory implementation details
- **Ley 1266 de 2008** — financial/credit data (Habeas Data Financiero)
- **Circular Externa 002 de 2015** (SIC) — security incident reporting

The enforcement body is the **Superintendencia de Industria y Comercio (SIC)**.

---

## Key principles

| Principle           | Requirement                                                   | Impact on this app                                                                           |
| ------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Legality**        | Data processing must have a lawful basis                      | Employment relationship (employees) and legitimate interest (clients)                        |
| **Purpose**         | Data collected only for stated, explicit purposes             | Must declare purpose at collection (service tracking, appointment management, payroll)       |
| **Freedom**         | Data subject consent must be prior, express, and informed     | Employees consent via employment contract; clients must be informed when their data is saved |
| **Truthfulness**    | Data must be accurate and up to date                          | Data correction mechanism required                                                           |
| **Transparency**    | Data subjects must be informed of the existence of their data | Must be able to answer "what data do you have on me?"                                        |
| **Security**        | Adequate technical and organizational measures                | Encryption in transit (HTTPS), access controls (RBAC), audit logs                            |
| **Confidentiality** | Duty of confidentiality for data processors                   | Only authorized roles can access specific data                                               |

---

## PII inventory

| Data category               | Entities                             | Fields                                         | Sensitivity |
| --------------------------- | ------------------------------------ | ---------------------------------------------- | ----------- |
| **Client personal data**    | `clients`                            | name, phone, email                             | Medium      |
| **Client behavioral data**  | `appointments`, `tickets`            | service history, no-show count                 | Low–Medium  |
| **Employee personal data**  | `employees`, `users`                 | name, email, phone, hired_at                   | Medium      |
| **Employee financial data** | `payouts`, `ticket_items` (earnings) | daily_rate, commission amounts, payout amounts | High        |
| **Authentication data**     | `users`, `sessions`                  | hashed passwords, session tokens               | High        |

---

## Consent model

### Employees

- Consent obtained through the **employment contract**. The contract should include a data processing clause stating that the employer will process personal data for payroll, scheduling, and performance tracking purposes.
- No separate consent form needed if the employment contract covers data processing.

### Clients (saved clients)

- When a staff member creates a saved client record (name, phone, email), the business must inform the client verbally or in writing that their data will be stored for appointment management and service history.
- **Recommendation:** Add a brief privacy notice to the appointment confirmation email (T055): "Your personal data is stored by Innovation Befine for appointment and service management. You may request access, correction, or deletion by contacting [business contact]."
- Guest clients (name only, no record persisted) do not trigger data protection obligations since no PII is stored.

---

## Right to deletion vs soft-delete

### The conflict

Ley 1581 de 2012, Article 17 grants data subjects the right to request deletion ("supresión") of their personal data when:

- It is no longer necessary for the stated purpose
- Consent is withdrawn
- The data was processed unlawfully

The app uses **soft-delete** (`is_active = false`) for clients, employees, and services to preserve referential integrity in financial records (tickets, payouts).

### Resolution: anonymization over deletion

When a client or employee exercises their right to deletion:

1. **Anonymize** the record: replace `name` with "Deleted User", `phone` with null, `email` with null
2. Set `is_active = false` and `deleted_at = now()`
3. **Preserve** the record ID and financial relationships (ticket line items, payout records) — these are business records with legal retention requirements
4. Retain anonymized records for the legally required retention period (see below)

This approach satisfies the privacy requirement (PII is purged) while maintaining financial record integrity (amounts, dates, and relationships are preserved).

**Implementation:** Add a `deleteClientData(clientId)` server action that performs the anonymization. This should be an admin-only action with a confirmation dialog explaining what will be deleted vs retained.

---

## Data retention policy

| Data type                                          | Retention period                                 | Basis                                                                                         |
| -------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **Financial records** (tickets, payouts, payments) | 10 years minimum                                 | Colombian tax law (Estatuto Tributario, Art. 632) requires preservation of accounting records |
| **Employee records**                               | Duration of employment + 3 years                 | Labor law statute of limitations                                                              |
| **Client personal data**                           | Until purpose is fulfilled or deletion requested | Ley 1581                                                                                      |
| **Authentication logs**                            | 6 months                                         | Security best practice                                                                        |
| **Audit logs**                                     | Same as underlying financial record              | Financial audit requirements                                                                  |

---

## Cross-border data transfer

Neon (database provider) hosts data on servers in **US and/or EU regions**. Under Colombian law:

- **Adequate protection countries:** The SIC has declared that countries with adequate data protection levels (EU/EEA, some others) permit free data transfer. The US is **not** on the adequate list by default.
- **Mitigation options:**
  1. Obtain explicit consent from data subjects for cross-border transfer (recommended for employees via contract clause)
  2. Verify Neon's data processing agreement (DPA) includes adequate security commitments
  3. When choosing the Neon region, prefer **EU (Frankfurt or Amsterdam)** over US, as EU countries are on Colombia's adequate protection list

**Recommendation:** Select a Neon EU region if available on the free tier. If not, include a cross-border transfer clause in the employee contract and client privacy notice.

---

## SIC registration

The SIC maintains a **National Database Registry (RNBD)**. Organizations that process personal data in Colombia must register their databases with the SIC.

**Action required before go-live:**

- Register the following databases with the RNBD: employee data, client data
- Designate a data protection officer or responsible person within the company
- Document the data processing purposes and security measures

---

## Security measures required

| Measure                             | Status in project                                            |
| ----------------------------------- | ------------------------------------------------------------ |
| Encryption in transit (HTTPS)       | Covered — Vercel enforces HTTPS                              |
| Access controls (RBAC)              | Covered — T010, T018                                         |
| Audit logging                       | Covered — T025 (catalog), T085 (Sentry)                      |
| Session security                    | Covered — Better Auth (HttpOnly, Secure cookies)             |
| PII scrubbing in error reports      | Covered — T085 (Sentry `beforeSend` filter)                  |
| Password hashing                    | Covered — Better Auth uses bcrypt/argon2                     |
| Data anonymization on deletion      | **Needs implementation** — add to a Phase 3 or Phase 10 task |
| Privacy notice in emails            | **Needs implementation** — add to T055 AC                    |
| Cross-border transfer documentation | **Needs documentation** — employee contracts                 |

---

## Business timezone

All timestamps are stored in **UTC** in the database (`timestamp with time zone`). The business operates in **America/Bogota (UTC-5)**. All user-facing displays must convert to this timezone regardless of the device's local setting.

This is enforced via a `BUSINESS_TIMEZONE` constant defined in `docs/standards.md` (T002).

---

## Action items

| #   | Action                                                    | Owner          | Phase               |
| --- | --------------------------------------------------------- | -------------- | ------------------- |
| 1   | Add data processing clause to employee contracts          | Business owner | Pre-Phase 0         |
| 2   | Add privacy notice to appointment confirmation email      | Dev            | Phase 5 (T055)      |
| 3   | Implement client data anonymization function              | Dev            | Phase 3 or Phase 10 |
| 4   | Register databases with SIC (RNBD)                        | Business owner | Pre-go-live         |
| 5   | Select Neon EU region if available                        | Dev            | Phase 0 (T005)      |
| 6   | Document cross-border transfer in client/employee notices | Business owner | Pre-go-live         |
