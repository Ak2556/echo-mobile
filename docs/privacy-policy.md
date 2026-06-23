# Echo Privacy Policy

**Last updated:** June 16, 2026

This Privacy Policy explains what data Echo ("we", "us") collects, how we use it, and the choices you have. Echo is operated by the seller identified on Echo's App Store and Google Play listings, reachable at **support@echo.app**.

If you have questions about this policy, email us.

---

## 1. What we collect

### 1.1 Account data
When you sign up we store:

- Your email address or phone number (for authentication and recovery)
- Your chosen username and display name
- Your avatar color and optional bio
- Your interests (selected during onboarding to personalize your feed)

### 1.2 Content you publish
Everything you create on Echo is stored on our servers:

- Echoes (your posts), comments, reactions, bookmarks, follows
- Direct messages you send
- Images and videos you upload (stored on Supabase Storage and publicly accessible when attached to public content)
- Audio you record in the app (e.g. the voice-memo tool). Recording uses your
  microphone only while you are actively recording, and only after you grant
  permission.
- Chat conversations with our AI assistant

### 1.3 Usage data
We collect basic engagement signals — what you tap, what you scroll through, when you open the app — to improve the product. This data is associated with your account and is handled by PostHog (see §3). **Analytics is opt-in:** we collect nothing until you accept the in-app consent prompt, and you can decline or withdraw consent at any time.

### 1.4 Device data
- Device model and OS version (to debug crashes)
- App version
- A push notification token (only if you opt into notifications)
- An anonymous installation ID

We do **not** collect your IP address for ad-targeting purposes, and we do not sell device data.

---

## 2. How we use your data

| Purpose | Data used |
|---|---|
| Authenticate you | Email or phone, via a one-time code / magic link (passwordless — handled by Supabase Auth) |
| Show you a personalized feed | Interests, follows, engagement signals |
| Deliver push notifications you opted into | Push token, account ID |
| Generate AI replies | Your chat messages (sent to a third-party LLM provider — see §4) |
| Diagnose crashes | Device data, anonymized stack traces |
| Comply with legal requests | Whatever is legally required |

We do not sell your data. We do not run third-party advertising networks inside the app.

---

## 3. Who we share with

Echo uses a small number of trusted sub-processors to run the service:

| Vendor | What they handle | Where data lives |
|---|---|---|
| Supabase (supabase.com) | Auth, database, file storage, real-time | US |
| OpenRouter (openrouter.ai) | Routing AI chat, moderation, and embeddings to the model provider | US |
| Google (Gemini, via OpenRouter) | The underlying LLM that generates AI replies, moderation, and embeddings | US |
| PostHog (posthog.com) | Product analytics (opt-in only — see §1.3) | US |
| Sentry (sentry.io) | Crash and error diagnostics | US |
| Expo / EAS (expo.dev) | Build pipeline and over-the-air updates | US |
| Apple Push Notification Service | Delivering push notifications (only if you opted in) | US |

Each sub-processor is bound by contract to use your data only for the purpose listed above.

---

## 4. AI features

When you chat with Echo's AI, your messages are sent to OpenRouter and forwarded to a large language model (currently Google Gemini). Those messages may be stored briefly by the provider for safety/abuse review — please don't share secrets, payment info, or other private data in AI chats.

We use AI replies only to help you draft and navigate the app — we don't use your chat history to train any model.

---

## 5. Your choices

You can:

- **Edit your profile** at any time in Settings → Profile
- **Mute or block** anyone whose content you don't want to see
- **Delete an Echo, comment, or DM** at any time
- **Disable push notifications** in Settings → Notifications
- **Export your data** — email support@echo.app
- **Clear AI chat history** from Settings → Advanced Data Controls → Clear Chat History. This removes local chat state and server-side AI conversations associated with your account.
- **Delete your entire account** from Settings → Danger Zone → Delete Account. This is permanent and removes your profile, uploaded avatar/media objects, echoes, comments, reactions, bookmarks, DMs, AI chat history, push token, and authentication record, except for data we must retain for legal, security, or abuse-prevention reasons. Backups roll off within 30 days.

You can ask us to fix incorrect data by emailing support@echo.app.

---

## 6. Children

Echo is rated 17+ on the App Store and is not directed at children under 13. We do not knowingly collect data from anyone under 13. If you believe a minor has signed up, email us and we will remove the account.

---

## 7. Security

We use HTTPS for every request and apply row-level security so users can only access their own data. Sign-in is passwordless — we never store a password; access is granted by a one-time code or magic link sent to your verified email or phone (handled by Supabase Auth). No system is perfectly secure — if you suspect your account has been compromised, email us and we'll revoke active sessions.

---

## 8. International users

Echo is operated from the United States. If you use the app from outside the US, your data will be transferred to and processed in the US. By using Echo you consent to this transfer.

---

## 9. Changes

We may update this policy. When we make material changes we'll notify you in-app and update the "Last updated" date above. Continuing to use Echo after the change means you accept the new policy.

---

## 10. Contact

Privacy questions: **support@echo.app**
Data deletion: **Settings → Danger Zone → Delete Account** (in-app) or email us
EU/UK GDPR requests, California CCPA requests: email us with "Privacy request" in the subject
