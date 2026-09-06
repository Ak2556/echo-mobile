# Compliance: launch, and the first year

**Written 2026-09-06.** Covers what Echo must do to ship, and what falls due
over the following twelve months. Everything here is doable without a lawyer.
The two places where that stops being true are marked.

This is a working document, not advice. It records what the law requires, what
the code actually does, and where those two disagree today.

---

## 1. The territory decision, which decides everything else

**Launch India-first. Do not list in the EU on day one.**

Every expensive obligation below is triggered by *offering the service in the
Union*, not by where Echo is built. Excluding the EU at launch is a checkbox in
Play Console and App Store Connect, and it removes:

- the DSA in its entirety,
- the DSA Art. 13 EU legal representative (a paid appointment — no small-
  business exemption exists),
- the GDPR Art. 27 EU representative (a second, separate paid appointment).

Together those are roughly €400–1,000/year for a service that, at launch, has
no EU users to serve. Add the EU in month three or six, once there is traffic
worth the fee, by appointing both representatives and flipping the territory
setting back on.

Echo's launch market is India — it is voice-first and Hindi-flagship, built
against a Hindi-speaking tester. The EU is not a market being given up; it is a
market being *deferred* until it costs less than it returns.

---

## 2. What the DSA would require, if the EU is ever switched on

Recorded now so the decision can be made later from facts rather than fear.

**Echo is a micro enterprise** under Recommendation 2003/361/EC — a sole
proprietorship, one person, far under the 10-employee / €2m thresholds.

**DSA Art. 19 excludes micro and small enterprises from the whole of Section 3
(Arts. 19–28)**, with the sole exception of Art. 24(3). That exclusion covers:

| Article | Obligation | Applies to Echo? |
|---|---|---|
| Art. 20 | Internal complaint-handling (appeals) | **No** — exempt |
| Art. 21 | Out-of-court dispute settlement | **No** — exempt |
| Art. 22 | Trusted flaggers | **No** — exempt |
| Art. 23 | Measures against misuse | **No** — exempt |
| Art. 24(1)(2) | Transparency reporting | **No** — exempt |
| Art. 24(3) | Report active recipients on request | **Yes** — the one carve-out |

The exemption survives 12 months after outgrowing micro/small status, and is
lost immediately only on designation as a VLOP.

**Still applicable regardless of size** (Sections 1 and 2):

| Article | Obligation | Status |
|---|---|---|
| Art. 13 | EU legal representative | **Not appointed** — blocks any EU launch |
| Art. 14 | Terms of service, clearly stated | Done |
| Art. 16 | Notice and action on illegal content | Done — in-app report + `dsa@` |
| Art. 17 | Statement of reasons | Done — `moderation_decisions` |

**Note that Echo already implements Art. 17 and Art. 20 anyway.** The appeals
flow exists (`app/appeal.tsx`, `app/mod-appeals.tsx`, migration
`20260801120000_dsa_art20_author_appeals.sql`, applied to production). Building
past the requirement is a good position and the legal copy describing it is
accurate — **do not remove those promises to match the exemption.** A platform
that offers appeals it need not offer is safer than one that offers none.

---

## 3. India — DPDP Act 2023 and Rules 2025

The Rules were notified 13 November 2025 and phase in:

| Date | What becomes operative |
|---|---|
| 13 Nov 2025 | Data Protection Board established (done, not an Echo obligation) |
| 13 Nov 2026 | Consent Manager framework opens for registration |
| **13 May 2027** | **Consent, privacy notice and security obligations bind** |

**Echo is not in breach on launch day.** There is roughly twenty months of
runway. The obligations to build toward, all of which Echo already partly has:

- an itemised consent notice, in plain language, available in English and the
  user's language (the i18n system already covers 26 languages),
- a Grievance Officer, named and reachable — **already done**,
- data-principal rights: access, correction, erasure, nomination — erasure
  exists (`delete-account`); nomination does not,
- breach notification to the Board and to affected users,
- verifiable parental consent for users under 18 — Echo's age gate is 16+,
  which is **stricter than DPDP's threshold in one direction but not aligned
  with it**; DPDP treats under-18s as children. See §6.

---

## 4. Store disclosures — what Echo actually collects

Both stores require this to match the code, not the marketing. A mismatch is
among the most common rejection causes, and it is checkable.

| Data | Where it comes from | Play Data Safety | Apple Nutrition Label |
|---|---|---|---|
| Email / phone | Sign-up | Personal info → Email, Phone | Contact Info |
| Username, display name, bio, photo | Profile | Personal info → Name, User IDs; Photos | Identifiers; User Content |
| Date of birth | Age gate | Personal info → Other info | Sensitive Info |
| Echoes, comments, reactions | Content | App activity; User content | User Content |
| Direct messages | Chat | **Messages → Other in-app messages** | User Content |
| Images and video | Uploads | Photos and videos | User Content |
| Voice recordings | Voice commands | **Audio → Voice or sound recordings** | Audio Data |
| Facial images | Verified badge only | Photos; processed ephemerally | Sensitive Info |
| **Habits, meals, water, weight, workouts** | Mini-apps | **Health and fitness → Health info, Fitness info** | Health & Fitness |
| Marketplace listings and prices | Marketplace | Financial info → Purchase history | Purchases |
| Payments | Razorpay / RevenueCat | Financial info → Purchase history | Purchases |
| Embeddings / interest signals | Generated | App activity → Other actions | Usage Data |
| Device model, OS, app version, IP | Automatic | Device or other IDs | Identifiers; Diagnostics |
| Crash traces | Sentry | Crash logs; Diagnostics | Diagnostics |
| Product analytics | PostHog, **opt-in only** | App activity — mark as optional | Usage Data |

### Two mismatches found in the code, both must be resolved before submission

**(a) Contacts.** `app.json` requests `READ_CONTACTS` and `WRITE_CONTACTS`, for
`plugins/withEchoContactCard.js` — the sync adapter that puts Echo into the
phone's address book as a tappable row. No contact data is read or uploaded;
there is no `expo-contacts` usage anywhere in the app.

But the privacy policy says, in §2: *"We do not collect ... contacts."*

Both statements are true and together they read as a lie. A reviewer sees a
sensitive permission and a policy denying it. Two options, in order of
preference:

1. **Drop `READ_CONTACTS`.** The sync adapter needs `WRITE_CONTACTS`; the read
   permission appears to be unnecessary. This removes the sensitive half of the
   pair. Verify with a clean prebuild and a working contact card before
   committing to it.
2. Keep both, and amend §2 of the privacy policy to explain exactly why the
   permission exists and that nothing is read or transmitted.

**Resolved 2026-09-06 with option (2).** Option (1) is not safe without a
device: `plugins/withEchoContactCard.js:277` queries
`ContactsContract.RawContacts.CONTENT_URI` directly — not through the `syncUri`
wrapper it uses for writes — to check whether Echo's own row already exists
before inserting it. Without `READ_CONTACTS` that query most likely throws, and
the failure mode if it silently returns nothing is a duplicate Echo contact
added on every sync. §2 of the privacy policy now explains the permission
instead.

**Follow-up, post-launch:** routing that read through `syncUri(...)` sets
`CALLER_IS_SYNCADAPTER`, which is the documented way for a sync adapter to touch
its own rows without the read permission. That would let `READ_CONTACTS` be
dropped — but it needs a device to verify, so it is not a freeze-week change.

**(b) Health data.** §2 says *"we do not collect ... health data from Apple
Health or Google Fit"*, which is true — Echo reads neither API. But §1 states
Echo collects *"body and health data such as weight, measurements, meals, water
and workouts"* from the mini-apps.

**The Data Safety form asks about health data by category, not by source.** It
must be declared under Health and fitness. Declaring "no health data" because
it did not come from a health API would be a false declaration.

### Also unverified before submission

The generated `android/app/src/main/AndroidManifest.xml` (28 Aug) still contains
`SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`,
all three of which `app.json` lists under `blockedPermissions` — a setting added
23 June, two months *before* that manifest was generated. Either the blocking is
not taking effect or that manifest did not come from a clean prebuild.

`android/` is gitignored CNG output, so this may be a stale artifact and nothing
more. **Settle it with a clean prebuild before submitting**, because
`SYSTEM_ALERT_WINDOW` ("display over other apps") draws Play scrutiny and the
storage permissions pull in extra declarations.

---

## 5. Also true, and not yet reflected in the policy

`constants/legal/privacyPolicy.ts` §4 says AI features are *"powered by Google
Gemini, reached through OpenRouter."* Voice commands now call Gemini directly
with OpenRouter only as a fallback. The set of processors is unchanged, so this
is an accuracy fix rather than a new disclosure, but it should be corrected at
the next policy revision.

---

## 6. The two places a lawyer is genuinely worth paying for

Everything above can be done alone. These two cannot, and neither blocks launch:

1. **Age assurance vs. DPDP.** Echo gates at 16+. DPDP treats everyone under 18
   as a child requiring verifiable parental consent. A 16-year-old Indian user
   is an adult to Echo's gate and a child to the statute. That gap needs a real
   answer before May 2027 — the options (raise the gate to 18, build parental
   consent, or rely on a carve-out) have materially different product costs.
2. **Taking payments from EU consumers as an Indian sole proprietor**, if and
   when the EU is switched on. Consumer-protection law, VAT/OSS and the
   representative appointments interact here in ways worth an hour of paid time.

---

## 7. First-year calendar

| When | Do |
|---|---|
| **Before submission** | Resolve the contacts mismatch (§4a). Declare health data (§4b). Clean prebuild to settle the blocked permissions. |
| **At submission** | Data Safety form and Nutrition Labels per §4. Territory: India, exclude EU. Privacy policy URL live and public. |
| **Launch + 30 days** | First moderation-decision review: confirm `moderation_decisions` rows are being written and appeals resolve end to end, against a real probe account. |
| **Launch + 90 days** | Revisit the EU. If EU demand is real, appoint DSA Art. 13 and GDPR Art. 27 representatives (~€400–1,000/yr combined), then enable the territory. |
| **13 Nov 2026** | DPDP Consent Manager framework opens. Registration is optional — decide whether to use one. |
| **Q1 2027** | Resolve the 16-vs-18 age question (§6.1). Build data-principal nomination. Draft the DPDP consent notice against the i18n system. |
| **13 May 2027** | DPDP consent, notice and security obligations bind. Everything above must be live. |
| **Ongoing** | If headcount or turnover ever approaches 10 people / €2m, the DSA Art. 19 exemption is 12 months from expiring. Revisit Section 3 then. |
