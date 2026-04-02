# Research: Appointment confirmation channels

> Researched: April 2026. Context: the secretary confirms appointments with clients; the system should support this with minimal setup cost for an MVP.

---

## Channels compared

| | Email | WhatsApp Business API | SMS |
|--|-------|----------------------|-----|
| **Reach** | Very broad (has email) | 2.24B+ users, smartphone + app required | ~5.1B users, any mobile phone |
| **Rich content** | Yes (HTML, attachments) | Yes (media, buttons, templates) | No (160-char plain text) |
| **Encryption** | No (standard email) | End-to-end | No |
| **Open / read rate** | ~20–30% | ~98% | ~90–98% |
| **Two-way** | Yes | Yes | Yes |
| **Cost model** | Per-email or monthly plan | Per-message (template) | Per-message/segment |
| **Setup complexity** | Low | High (Business API approval, templates) | Medium |
| **Deliverability** | Requires domain warming + SPF/DKIM | High (app notification) | High (carrier delivery) |

---

## Email — Resend

**Resend** is the recommended email service for Next.js projects (React Email + Resend SDK; official Next.js example).

### Pricing
- **Free**: 100 emails/day, 1 custom domain.
- **Pro**: $20/month — no daily limit; overages at $0.90/1,000 emails.

### Pros
- Easiest to integrate with Next.js (`npm install resend`; store API key in env).
- **React Email**: design email templates as React components — same language as the app.
- No vendor dependency for design; templates live in the codebase.
- SPF, DKIM, DMARC handled by Resend's domain infrastructure.
- Free tier sufficient for appointment confirmation volume at a single salon.
- Webhooks for delivery, open, and click events (useful for tracking "did the client open the confirmation?").

### Cons
- ~20–30% email open rate — lower engagement than WhatsApp or SMS.
- Spam filters may delay delivery.
- Clients must have and check email.
- Domain verification required before sending.

---

## WhatsApp Business API

### Options
- **Twilio WhatsApp API**: Twilio is the most common provider. Requires WhatsApp Business account approval.
- **Meta Cloud API**: direct from Meta (free API calls, pay only per conversation).
- Other providers: MessageBird, 360Dialog, Infobip.

### Pricing (2025)
- Per-conversation pricing effective July 2025 (Meta model). Rates vary by country; Latin American rates typically $0.03–$0.07/conversation.
- Twilio adds their own per-message markup on top of Meta's rates.

### Pros
- **Highest open rate** (~98%) — clients are already on WhatsApp (especially in Latin American markets where WhatsApp is dominant).
- Rich content: confirmation card with date, time, stylist name, buttons to confirm or reschedule.
- Two-way conversation possible.
- Feels like a personal message; builds trust.

### Cons
- **High setup friction**: requires WhatsApp Business account, Meta app approval (can take days/weeks), and pre-approved message templates before you can send.
- Templates must be approved by Meta and cannot be freely formatted.
- Not ideal for MVP speed; better as Phase 5+ integration once the appointment module is stable.
- Clients must have WhatsApp and a smartphone.
- Cost per message adds up at scale; requires budget approval.

---

## SMS — Twilio

### Pricing
- US: ~$0.0079/SMS outbound via Twilio.
- Latin American rates vary: ~$0.02–$0.08/message depending on country.

### Pros
- Universal — any mobile phone, no app required.
- Very high open rate (~90–98%).
- Simple to integrate (Twilio has a Node.js SDK).
- Works even for clients who do not use WhatsApp or email regularly.

### Cons
- 160-character limit (longer messages become multi-part and cost more).
- No rich content, no buttons, no media.
- More expensive per message than email at scale.
- Requires phone number collection from clients (privacy implication).
- Carrier delivery issues in some regions.

---

## Recommendation for this project

### MVP (Phase 5 launch): Email via Resend

- Lowest setup cost and effort.
- Fits within the free tier (100 emails/day) for a single-location salon.
- Appointment confirmation emails are a well-understood pattern; React Email templates are straightforward.
- The secretary confirms the appointment; the email is a follow-up, not the only communication (she also contacts them personally per the business description).

**Action for MVP:** add a "Send confirmation email" button on the appointment screen that fires a Resend API call. The email template should include: client name, service, stylist, date and time, and a simple "confirm / cancel" link or instruction to call.

### Post-MVP (Phase 5+): WhatsApp via Meta Cloud API

For this market (Latin America), WhatsApp is likely the most effective channel long-term. Add it as the primary channel after the appointment module is stable and once the team has capacity to go through the Meta verification process.

Do not implement WhatsApp in the MVP — setup friction will block the phase.

### Do not prioritize: SMS

SMS is universally reachable but more expensive and less rich than WhatsApp. In a market where WhatsApp is dominant, SMS is the fallback for clients without smartphones. Add it last if needed.

---

## Channel rollout order

```
MVP          → Email (Resend) — manual "Send confirmation" button
Phase 5+     → WhatsApp (Meta Cloud API / Twilio) — primary channel
Later        → SMS — fallback for non-WhatsApp users
```
