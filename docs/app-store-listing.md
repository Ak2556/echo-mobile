# Echo — App Store Listing Draft

Copy below is a starting point. Tighten in TestFlight with real users; A/B candidates noted where useful.

---

## Name (30 chars max — currently we use the literal "Echo")

**Echo**  *(4 chars)*

If "Echo" conflicts with an existing app on review, fall back to:
- "Echo — Think out loud"
- "Echo: Share what you know"

---

## Subtitle (30 chars max)

**Locked:** `Conversations worth keeping.`  *(28)*

Echoes the tagline that runs through the rest of the listing + the in-app welcome copy. Says "not Twitter" without saying it. Anti-positioning beats feature-listing on a 30-char line.

---

## Promotional Text (170 chars — editable post-launch without re-review)

`Echo is the social network for thinking out loud. Two-part posts: the question that sparked it, and your take. Built around your curiosity, not the algorithm.`  *(159)*

---

## Description (4000 chars — limit, not target. Tighter is better.)

```
The social network for thinking out loud.

Every post on Echo — we call them "echoes" — has two parts: a question that sparked it, and the take you have on it. That structure is the whole product. Echo isn't a feed of one-liners — it's a feed of thoughts you can re-read in a year and still get something from.

WHAT YOU CAN DO

— Talk to Echo's built-in AI about something you've been thinking through, then publish the conversation as an Echo
— Drop a thought of your own with a clear prompt + response
— React with 🤯 📝 💯 🤔 instead of empty likes
— @-mention friends in posts and comments
— Bookmark echoes that hit, organize them later
— Build a profile that shows what you actually think about, not just what you tag yourself in

PRIVATE BY DEFAULT

— No ads, no third-party tracking, no algorithmic dark patterns
— Mute, block, and report tools that actually work
— Delete your account in one tap — we mean it, cascade and all

WHY ECHO

You already have apps for staying in touch and apps for hot takes. Echo is for the conversations you wish were public. The strongest accounts on here aren't the loudest, they're the most curious.

—

Echo is in active development. We ship updates weekly. Feedback: support@echo.app

—

Subject to our Terms of Service and Privacy Policy. By using Echo you agree to be bound by them.
```

Length: ~1230 chars — keeps room above the "more" fold.

---

## Keywords (100 chars total — comma-separated, no spaces after commas)

```
echo,thoughts,ideas,journal,AI,chat,social,microblog,write,knowledge,curate,bookmark,question,prompt
```

Total: 100 chars exactly. Don't repeat words already in the name/subtitle ("Echo", "out loud").

A/B candidates to test post-launch:
- Replace `curate,bookmark` with `discover,save`
- Replace `microblog,write` with `notes,blog`

---

## What's New (per-version release notes — for v1.0.0)

```
Hello, world. This is v1 of Echo.

— Sign up in one tap with email or phone — no passwords
— Publish text, photo, video, or poll Echoes
— Chat with Echo's AI, then turn the conversation into a post
— React with 🤯 📝 💯 🤔, comment, bookmark, follow
— @-mention friends with live autocomplete
— Delete your account whenever you want

Thanks for being early. Tell us what's broken: support@echo.app
```

---

## Age Rating

**17+** because:
- User-Generated Content (Frequent/Intense)
- Mature/Suggestive Themes (Infrequent/Mild) — content moderation handles this but the rating must reflect that user content could include it

---

## Privacy nutrition label (data types declared)

- **Contact Info:** Email Address, Phone Number — *Linked to user, used for App Functionality, Account*
- **Identifiers:** User ID — *Linked, App Functionality*
- **User Content:** Photos/Videos, Audio Data (voice memos), Other (echoes/comments/DMs) — *Linked, App Functionality*
- **Usage Data:** Product Interaction — *Linked, Analytics, Product Personalization* (collected only after opt-in consent)
- **Diagnostics:** Crash Data, Performance Data — *Not Linked, Analytics*

We **do not** track users across other apps. We **do not** show third-party ads.

---

## Category

- Primary: **Social Networking**
- Secondary: **Lifestyle**

---

## Support URL

`https://echo.app/support` — needs to be live before submission. Even a single-page Notion doc is fine.

## Marketing URL (optional)

`https://echo.app`

## Privacy Policy URL

`https://echo.app/privacy` — link the markdown in docs/privacy-policy.md.

---

## Reviewer Notes (visible only to App Review)

> **SET UP BEFORE SUBMISSION.** Echo is passwordless for normal users, so you
> must give App Review a deterministic way in. Create a no-real-data Supabase
> password user, set `EXPO_PUBLIC_DEMO_EMAIL` and
> `EXPO_PUBLIC_DEMO_PASSWORD` as EAS secrets before the review build, then fill
> the same values into the block below. The login screen will show
> "App Review · Open demo account" only when those secrets are present.

```
DEMO ACCOUNT
Tap "App Review · Open demo account" on the login screen. This signs into a
pre-created, no-real-data reviewer account:
  Email: reviewer-demo@<your-domain>
  Password: <demo-password>
If the demo button is unavailable or sign-in fails, email support@<your-domain>
and we will respond during review hours.

NOTES FOR REVIEWER

— Echo is a social network for written ideas. The AI chat is powered by Google Gemini via OpenRouter. We disclose this in-app on the chat empty state and in the Privacy Policy.

— Account deletion is at Settings → Danger Zone → Delete Account. The action cascades server-side via a Postgres RPC that wipes profile + every related row, plus the auth.users row.

— Push notifications are opt-in via an in-app pre-prompt sheet shown after a user publishes their first Echo. The system prompt is never fired without user consent.

— No third-party ad networks. No tracking across apps.

— If you see any moderation concerns during review, please email support@echo.app and we'll respond within 24 hours.
```

---

## Screenshots — required device sizes

iPhone 6.7" and 6.5" are mandatory. 6.1"/5.5" recommended.

Five screenshots, ordered:

1. **Discover feed** — clean hero shot. Real-looking content, no Lorem ipsum.
2. **A great echo, opened** — show the prompt + response framing.
3. **AI chat** — mid-conversation, "Open compose" tool card visible.
4. **Reactions pile** — 🤯 📝 💯 🤔 on a card you'd want to react to.
5. **Profile** — a populated profile with topics + stats.

Each screenshot should have a 1-line caption rendered on top:
1. "Real questions, real answers."
2. "Built to outlast the scroll."
3. "Talk to Echo. Publish what you learn."
4. "React with intent, not just hearts."
5. "Your profile is your point of view."

Capture from the iPhone 17 Pro Max simulator at 1290×2796.
