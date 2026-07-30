/**
 * Canonical Privacy Policy content (rendered by app/privacy.tsx and mirrored to
 * docs/privacy-policy.md for store submission / web hosting). Markdown string so
 * it renders identically in-app (react-native-markdown-display) and on web.
 *
 * TODO before store submission: replace "the operator identified on Echo's
 * store listings" with the registered operating entity's legal name + address
 * once finalized, and confirm the sub-processor list still matches production.
 * Keep retention rows in sync with constants/dataRetention.ts.
 */

export const PRIVACY_UPDATED = 'July 30, 2026';
export const PRIVACY_VERSION = '2.0';

export const PRIVACY_POLICY_MD = `# Privacy Policy

**Last updated:** ${PRIVACY_UPDATED} · **Version ${PRIVACY_VERSION}**

This Privacy Policy explains what data Echo ("Echo", "we", "us") collects, how we use it, the legal bases we rely on, and the choices and rights you have. Echo is operated by the seller identified on Echo's App Store and Google Play listings, reachable at **support@echo.app**.

If anything here is unclear, email us — we'd rather explain than leave you guessing.

---

## 1. What we collect

### 1.1 Account data
When you create an account we store your email address or phone number (for sign-in and recovery), your chosen username and display name, your avatar color and optional bio, and the interests you pick during onboarding to shape your feed.

### 1.2 Content you publish
Everything you create is stored on our servers: echoes (posts), comments, reactions, bookmarks, and follows; direct messages you send; images and videos you upload (public when attached to public content); audio you record in the voice-memo tool (only while actively recording, and only after you grant microphone permission); and your conversations with the AI assistant.

### 1.3 Marketplace
If you create a listing, we store its text, images, and price so it can be shown to other users. Echo does not process payments — any transaction happens directly between you and the other person (see the Terms of Service).

### 1.4 Usage data
We collect basic engagement signals — what you tap, what you scroll, when you open the app — to improve the product, handled by PostHog. **Analytics is opt-in:** we collect nothing until you accept the in-app consent prompt, and you can decline or withdraw at any time.

### 1.5 Device data
Device model and OS version (to debug crashes), app version, a push-notification token (only if you enable notifications), and an anonymous installation ID. We do **not** collect your IP address for ad-targeting, and we do not sell device data.

---

## 2. Legal bases (GDPR / UK GDPR)

Where EU/UK law applies, we rely on:

| Purpose | Legal basis |
|---|---|
| Providing your account, feed, posts, DMs | Performance of a contract (Art. 6(1)(b)) |
| Push notifications you enabled | Consent (Art. 6(1)(a)) |
| Product analytics | Consent (Art. 6(1)(a)) |
| Crash diagnostics, security, abuse prevention | Legitimate interests (Art. 6(1)(f)) |
| Legal and regulatory compliance | Legal obligation (Art. 6(1)(c)) |

You can withdraw consent at any time; doing so doesn't affect processing that already happened.

---

## 3. How we use your data

We use your data to authenticate you (passwordless — a one-time code sent to your verified email or phone via Supabase Auth), show you a feed based on your interests and follows, deliver notifications you opted into, generate AI replies, diagnose crashes, and comply with legal requests. **We do not sell your data, and we do not run third-party advertising networks in the app.**

---

## 4. Who we share with

Echo uses a small set of trusted sub-processors, each bound by contract to use your data only as listed:

| Vendor | What they handle | Region |
|---|---|---|
| Supabase | Auth, database, file storage, realtime | US |
| OpenRouter | Routing AI chat, moderation, embeddings to the model provider | US |
| Google (Gemini, via OpenRouter) | The LLM that generates AI replies, moderation, embeddings | US |
| PostHog | Product analytics (opt-in only) | US |
| Sentry | Crash and error diagnostics | US |
| Expo / EAS | Build pipeline and over-the-air updates | US |
| Apple / Google Push | Delivering notifications (only if you opted in) | US |

---

## 5. AI features

When you chat with Echo's AI, your messages are sent to OpenRouter and forwarded to a large language model (currently Google Gemini). Providers may store messages briefly for safety and abuse review, so please don't share passwords, payment details, or other secrets in AI chats. We do **not** use your chat history to train any model.

---

## 6. How long we keep it

| Category | Where | Retention |
|---|---|---|
| Account & profile | Database | Until you delete your account (cascades to all owned content) |
| Posts & comments | Database | Until you delete them, or delete your account |
| AI chat history | Database | Until you delete the conversation, or your account |
| Direct messages | Database | Until both participants delete their accounts |
| Follows, reactions, bookmarks, mutes, blocks | Database | Until you reverse the action, or delete your account |
| Push tokens | Database | Until you disable push or delete your account |
| Uploaded media | File storage | Until the owning post is deleted, then purged automatically |
| Local preferences | Your device | Lives on-device; cleared on uninstall or sign-out |
| Crash reports | Sentry | ~90 days, then auto-purged |
| Product analytics | PostHog | Per-user history deletable within 30 days of an account-deletion request |

Backups roll off within 30 days of deletion.

---

## 7. International transfers

Echo is operated from the United States, and your data is processed there. For transfers from the EU/UK, we rely on Standard Contractual Clauses with our sub-processors. By using Echo you understand your data will be processed in the US.

---

## 8. Your rights and choices

In the app you can edit your profile, mute or block anyone, delete any echo/comment/DM, disable push notifications, clear AI chat history (Settings → Advanced Data Controls), and delete your entire account (Settings → Danger Zone → Delete Account) — permanent, and it removes your profile, media, echoes, comments, reactions, bookmarks, DMs, AI history, push token, and auth record, except data we must keep for legal or abuse-prevention reasons.

Depending on where you live, you also have the right to **access, correct, erase, restrict, port, or object to** the processing of your data (GDPR/UK GDPR), and the right to **know, delete, correct, and opt out of "sale"/"sharing"** (California CCPA/CPRA). **We do not sell or share personal information** as those terms are defined under CCPA/CPRA. To exercise any right, email **support@echo.app** with "Privacy request" in the subject; we respond within the timeframe the law requires. You also have the right to complain to your local data-protection authority.

---

## 9. Local storage

Echo stores preferences (theme, accent, font size, onboarding state, and your analytics-consent choice) locally on your device using on-device storage — not browser cookies. This never leaves your device and is cleared when you uninstall or sign out.

---

## 10. Children

Echo requires users to be at least **16 years old**. (The App Store maturity rating of 17+ reflects content maturity, not the minimum age.) We do not knowingly collect data from anyone under 16. If you believe a younger child has signed up, email us and we'll remove the account.

---

## 11. Security

Every request uses HTTPS, and row-level security ensures you can only reach your own data. Sign-in is passwordless — we never store a password; access is granted by a one-time code sent to your verified email or phone. No system is perfectly secure; if you suspect your account is compromised, email us and we'll revoke active sessions.

---

## 12. EU Digital Services Act

If you report content, we notify you of the outcome (Settings → EU Digital Services Act → My Reports) and you can appeal a moderation decision (Art. 20 internal appeals). Echo's main feed is strictly chronological — there is no behavioral ranking, and personalized notification timing is off by default and fully opt-in (Art. 27).

---

## 13. Changes

We may update this policy. For material changes we'll notify you in-app and update the date and version above. Continuing to use Echo after a change means you accept the updated policy.

---

## 14. Contact

Privacy questions: **support@echo.app**
EU/UK GDPR and California CCPA requests: email us with "Privacy request" in the subject.
`;
