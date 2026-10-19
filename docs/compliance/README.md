# Legal and compliance

[← Documentation](../README.md)

The Terms and Privacy Policy live in code, so the app and any web mirror can never drift apart. Both are **drafts pending counsel review**.

- [`constants/legal/termsOfService.ts`](../../constants/legal/termsOfService.ts) — v3.0 draft
- [`constants/legal/privacyPolicy.ts`](../../constants/legal/privacyPolicy.ts) — v3.0 draft
- [`constants/legal/entity.ts`](../../constants/legal/entity.ts) — unresolved entity facts, as `[[PLACEHOLDER]]`
- [`constants/legal/ageGate.ts`](../../constants/legal/ageGate.ts) — age thresholds, mirrored in SQL
- [`constants/legal/eighthSchedule.ts`](../../constants/legal/eighthSchedule.ts) — the 22 languages DPDP Act 2023 §5 requires notices to be available in

`NOTICE` and `sbom.json` record third-party attribution and licence elections, and regenerate with `npm run legal:sbom`.

**Age policy:** minimum age 16. Under 18, Echo serves no advertising and performs no behavioural profiling — enforced in Postgres, not on the device, and it fails closed on unknown age.

See also [`launch-and-first-year.md`](launch-and-first-year.md).
