/**
 * Canonical Privacy Policy content (rendered by app/privacy.tsx).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STATUS: DRAFT v3.0 — PREPARED FOR EXTERNAL COUNSEL REVIEW. NOT YET IN FORCE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * v2.0 described a system Echo does not run. Every correction below was
 * verified against the code, the migrations and the deployed infrastructure:
 *
 *   WAS  "Echo is operated from the United States, and your data is processed
 *        there."
 *   IS   The production Supabase project runs in ap-northeast-1 (Tokyo).
 *
 *   WAS  Sub-processor table listed Supabase for "file storage".
 *   IS   Every uploaded file lives in Cloudflare R2. Cloudflare was absent
 *        from the table entirely, as were Razorpay and RevenueCat.
 *
 *   WAS  No mention of facial images or voice recordings.
 *   IS   verify-identity sends a selfie and the profile photo to Google Gemini
 *        for liveness and same-person inference; voice-command sends raw audio.
 *
 *   WAS  "Echo's main feed is strictly chronological — there is no behavioral
 *        ranking."
 *   IS   There is a ranked feed, a semantic feed, per-user taste vectors and
 *        thinking fingerprints, all built on content embeddings.
 *
 *   WAS  No mention of advertising.
 *   IS   First-party ads are served in the feed.
 *
 *   WAS  "Uploaded media ... purged automatically" on deletion.
 *   IS   Now true. Before the delete-account edge function (2026-08-22) it was
 *        not: deletion never reached R2.
 *
 * OPEN ITEMS FOR COUNSEL
 *   1. ENTITY. All placeholders live in constants/legal/entity.ts.
 *      grep -rn "\[\[" constants/legal/
 *   2. MINIMUM AGE. §11 states 16 with no profiling under 18, matching the age
 *      gate in 20260822140000_age_gate.sql. If counsel requires 18+ in India,
 *      change MINIMUM_AGE in constants/legal/ageGate.ts and the SQL together.
 *   3. CROSS-BORDER. Data sits in Japan; AI, analytics and crash reporting are
 *      in the US. Confirm the DPDP transfer position and whether an EU/UK
 *      transfer mechanism is needed for the storefronts Echo will list in.
 *   4. RETENTION. The periods in §9 must match constants/dataRetention.ts.
 */

import {
  ENTITY_NAME,
  ENTITY_ADDRESS,
  GRIEVANCE_OFFICER_NAME,
  GRIEVANCE_OFFICER_EMAIL,
  DPO_EMAIL,
  SUPPORT_EMAIL,
  DSA_EMAIL,
} from './entity';
import { MINIMUM_AGE, ADULT_AGE } from './ageGate';

export const PRIVACY_UPDATED = 'August 22, 2026';
export const PRIVACY_VERSION = '3.0-draft';

export const PRIVACY_POLICY_MD = `# Privacy Policy

**Last updated:** ${PRIVACY_UPDATED} · **Version ${PRIVACY_VERSION}**

This policy explains what ${ENTITY_NAME} ("**Echo**", "**we**") collects when you use the Echo app, why, who else sees it, how long we keep it, and what you can do about it.

It is written to be read, not to be survived. If anything here is unclear, ask us at **${SUPPORT_EMAIL}**.

---

## 1. What we collect

**You give us:**

- **Account** — your email address or phone number, a username, a display name, and optionally a bio and profile photo.
- **Date of birth** — collected once, to confirm you meet our minimum age and to determine whether you are a child under the law that applies to you. It is never shown on your profile and no other user can read it.
- **Content** — echoes (posts), comments, reactions, bookmarks, direct messages, and any images or video you upload.
- **Voice** — when you use a voice command, the audio you record.
- **Facial images** — only if you apply for a verified badge: a pose-challenge selfie, compared against your profile photo.
- **Mini-app data** — whatever you put into the tools: habits, tasks, notes, expenses, and **body and health data** such as weight, measurements, meals, water and workouts.
- **Marketplace listings** — items you list, their prices and photos.

**We generate:**

- **Interest and taste signals** — mathematical representations (embeddings) of the content you write and engage with, used to rank your feed and find related posts.
- **Usage signals** — what you opened and when, for the features you have enabled.

**We collect automatically:**

- **Technical data** — device model, operating system version, app version, IP address and coarse timing, for delivery, security and abuse prevention.
- **Crash diagnostics** — stack traces and breadcrumbs when the app fails.
- **Product analytics** — **only if you opt in.** Analytics is off until you accept it.

---

## 2. What we do not collect

We do not collect precise GPS location, contacts, calendar, health data from Apple Health or Google Fit, or advertising identifiers. We do not track you across other apps or websites, and we do not buy data about you.

---

## 3. Why we use it, and on what legal basis

| What | Why | Basis (GDPR / UK GDPR) |
|---|---|---|
| Account, content, messaging | To provide the service you asked for | Contract |
| Date of birth | Age assurance and child protection | Legal obligation; legitimate interests |
| Feed ranking and recommendations | To show you relevant content | Legitimate interests — you can switch to the Latest feed |
| AI features | To answer you and act on your instruction | Contract |
| Face verification | To confirm a verified badge is a real person | Consent — you choose to apply |
| Voice commands | To carry out what you said | Consent — you choose to speak |
| Advertising | To fund a free tier | Legitimate interests; never for under-${ADULT_AGE}s |
| Crash diagnostics | To keep the app working | Legitimate interests |
| Product analytics | To understand what to improve | Consent — opt-in only |
| Moderation and safety | To keep the network usable and lawful | Legal obligation; legitimate interests |

Where we rely on consent you can withdraw it at any time; that does not affect processing that already happened.

---

## 4. AI features, and what leaves the app

Echo's assistant, voice commands, interface translation, content-moderation classification and recommendations are powered by **Google Gemini**, reached through **OpenRouter**. When you use these features the relevant input leaves Echo's systems:

| Feature | What is sent |
|---|---|
| Assistant chat | Your message and recent conversation context |
| Voice command | The audio recording |
| Interface translation | The interface strings, not your content |
| Moderation | Text you are about to publish |
| Verified badge | Your profile photo and your pose-challenge selfie |
| Recommendations | Your content, to produce embeddings |

**We do not sell your data and we do not use your content to train third-party foundation models.** Providers may retain inputs briefly for abuse monitoring under their own terms.

**Please do not put passwords, payment details or government identifiers into AI prompts.**

**Face verification.** Your selfie is used for one purpose — confirming you are a real, living person who matches your profile photo — and is **deleted as soon as a decision is made**, whether you are approved or not. If your jurisdiction treats facial images as sensitive or biometric data, this processing happens only because you chose to apply for a badge, and you can decline without losing any other feature.

---

## 5. Your feed is ranked

Echo ranks your feed using your follows, your engagement and the interest signals described in §1. You can switch to **Latest** for a purely chronological feed at any time. We do not make decisions about you that produce legal or similarly significant effects.

---

## 6. Advertising

Echo shows advertising in the feed. It is **first-party**: we sell placements ourselves and **no third-party advertising network operates inside the app**. Advertisers do not receive your personal data — they get aggregate counts of views and clicks.

**We do not show advertising to anyone under ${ADULT_AGE}**, and we do not profile them for it.

---

## 7. Who else processes your data

| Who | What they do | Where |
|---|---|---|
| Supabase | Database, authentication, realtime | Japan (ap-northeast-1) |
| Cloudflare | Media storage (R2) and the upload edge | Global network |
| OpenRouter | Routes AI requests to the model provider | United States |
| Google (Gemini) | The model that generates AI output | United States |
| Razorpay | Payments for advertising purchases | India |
| RevenueCat | Subscription entitlements | United States |
| Apple · Google | App distribution, in-app purchases, push delivery | United States |
| Expo (EAS) | Builds and over-the-air updates | United States |
| Sentry | Crash diagnostics | United States |
| PostHog | Product analytics — only if you opted in | United States |

Each is bound to use your data only to provide their service to us.

---

## 8. Where your data lives, and when it crosses a border

Your account, content and messages are stored in **Japan**. Uploaded media is stored on **Cloudflare's global network**. AI processing, crash diagnostics and analytics happen in the **United States**.

This means your data crosses borders. Where the law requires a transfer mechanism, we rely on the appropriate one — including Standard Contractual Clauses for transfers out of the EU and UK.

---

## 9. How long we keep it

| Category | Retention |
|---|---|
| Account and profile | Until you delete your account |
| Posts, comments, reactions | Until you delete them, or your account |
| Direct messages | Until both participants delete their accounts |
| Uploaded media | Deleted with the owning content or the account |
| Date of birth | Until you delete your account |
| Verification selfie | Deleted the moment a decision is made |
| Voice recordings | Not retained after the command is carried out |
| AI chat history | Until you delete the conversation, or your account |
| Push tokens | Until you disable push, or delete your account |
| Crash diagnostics | About 90 days |
| Product analytics | Deleted within 30 days of an account-deletion request |

Backups roll off within 30 days.

---

## 10. Deleting your account

**Settings → Danger Zone → Delete Account.** This removes your profile, posts, comments, reactions, bookmarks, direct messages, AI history, mini-app data, push tokens and authentication record — **and every file you have uploaded**, including avatars, post images, message attachments and marketplace photos.

We keep only what we are legally required to keep, and content others have already lawfully re-shared cannot be recalled.

---

## 11. Children

You must be at least **${MINIMUM_AGE}** to use Echo. We ask for your date of birth at sign-up and verify it against that minimum.

**If you are under ${ADULT_AGE}**, we treat you as a child: we show you **no advertising**, we do **not** profile your behaviour, and personalised notifications stay off. In **India**, the Digital Personal Data Protection Act, 2023 requires verifiable consent from a parent or guardian before a child's data is processed.

If you believe a child has an account without the required consent, tell us at **${SUPPORT_EMAIL}** and we will act.

---

## 12. Your rights

Wherever you live you can, in the app: edit your profile, delete any post, comment or message, clear your AI history, turn analytics off, turn personalised notifications off, and delete your account.

Depending on your jurisdiction you also have rights to **access, correct, erase, restrict, port or object to** processing, and to **withdraw consent**. Under India's DPDP Act you additionally have the right to **nominate** someone to exercise your rights if you die or become incapacitated, and the right to a **grievance redressal** process.

**We do not sell or share personal information** as those terms are defined under the CCPA/CPRA.

To exercise a right, email **${DPO_EMAIL}** with "Privacy request" in the subject. We respond within the period the applicable law requires. You may also complain to your data-protection authority.

---

## 13. Grievance redressal (India)

> **Grievance Officer:** ${GRIEVANCE_OFFICER_NAME}
> **Email:** ${GRIEVANCE_OFFICER_EMAIL}
> **Address:** ${ENTITY_ADDRESS}

We acknowledge complaints within **24 hours** and resolve them within **15 days**.

---

## 14. Security

All traffic uses HTTPS. Row-level security in the database restricts every query to the rows you are allowed to see, and private message attachments are served only to participants in that conversation. Sign-in is passwordless by default — a one-time code sent to your verified email or phone.

**Echo does not currently offer end-to-end encrypted messaging.** Direct messages are encrypted in transit and at rest, and access is restricted, but Echo can technically access message content — for example to respond to a lawful request or a safety report. We would rather say so than imply otherwise.

No system is perfectly secure. If you think your account is compromised, email **${SUPPORT_EMAIL}** and we will revoke active sessions.

---

## 15. On-device storage

Theme, accent colour, font size, onboarding state, cached translations and your analytics choice are stored on your device. They are not cookies, they never leave the device, and uninstalling clears them.

---

## 16. EU Digital Services Act

If you report content we tell you the outcome (**Settings → My Reports**), and you can appeal a moderation decision for human review (**Settings → Appeals**, Art. 20). Our recommender system and the option of a non-personalised **Latest** feed are described in §5. Contact **${DSA_EMAIL}**.

---

## 17. Language

This policy is published in English and other languages, including languages listed in the **Eighth Schedule to the Constitution of India**. The English version is authoritative; translations are for your convenience.

---

## 18. Changes

We may update this policy. For material changes we will tell you in the app and update the version and date above, and where the law requires it we will ask for your consent again.

---

## 19. Contact

**Privacy and data rights:** ${DPO_EMAIL}
**General:** ${SUPPORT_EMAIL}
**Grievances (India):** ${GRIEVANCE_OFFICER_EMAIL}
**EU Digital Services Act:** ${DSA_EMAIL}

${ENTITY_NAME}
${ENTITY_ADDRESS}
`;
