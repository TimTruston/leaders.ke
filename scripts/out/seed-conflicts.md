# Scraped 13th-Parliament seed: conflicts and duplicates

Generated 2026-07-16T15:56:40.819Z from `seed-input-roster.snapshot.json` (383 roster rows), `scraped-wikipedia-13th.json`, `scraped-mps-13th.json`.

## Summary

| Metric | Count |
| --- | ---: |
| Roster rows | 383 |
| Clean new leaders to create | 324 (MP 278, Woman Rep 46, Senator 0) |
| Existing profiles to enrich | 42 |
| Emails to add | 47 |
| Phones to add | 48 |
| Bios to backfill (wikipedia) | 129 |
| Photos available but skipped (policy: no external hotlinks) | wikipedia 33, mzalendo 347 |
| vacant-seat | 2 |
| duplicate-roster-row | 1 |
| seat-conflict | 1 |
| source-name-conflict | 11 |
| name-collision | 1 |
| party-mismatch | 6 |
| name-order-unverified | 1 |

## vacant-seat (2)

**Suggested navigation:** Drop placeholder rows at scrape time (filter name == "Vacant" in scrape-contacts.ts).

| Name | Seat | Region | Detail |
| --- | --- | --- | --- |
| Vacant | MP | Garissa Township | roster row is a placeholder for a vacant seat |
| Vacant | MP | Kandara | roster row is a placeholder for a vacant seat |

## duplicate-roster-row (1)

**Suggested navigation:** Dedupe the roster scraper on the member-page URL; the duplicate carried a spelling variant of the same name.

| Name | Seat | Region | Detail |
| --- | --- | --- | --- |
| Rasso Dido Ali | MP | Saku | same person as "Raso Dido Ali" on MP Saku — kept the other row |

## seat-conflict (1)

**Suggested navigation:** Manual review: the existing DB holder (from leaders.json) shares zero name tokens with the authoritative roster — likely stale seed data to retire by hand.

| Name | Seat | Region | Detail |
| --- | --- | --- | --- |
| Okoiti Andrew Omtatah | Senator | Busia | DB already has "Okiya Omtata" as current Senator for Busia — skipped |

## source-name-conflict (11)

**Suggested navigation:** Manual review: at least one of parliament/wikipedia/mzalendo is stale for this seat (by-elections, court rulings).

| Name | Seat | Region | Detail |
| --- | --- | --- | --- |
| Chege Njuguna | MP | Kandara | wikipedia says MP Kandara is "Alice Muthoni Wahome" — skipped |
| Ikana Fredrick Lusuli | MP | Shinyalu | wikipedia says MP Shinyalu is "Fred Akana" — skipped |
| Keter David Kipsang | MP | Emurua Dikirr | wikipedia says MP Emurua Dikirr is "Vacant" — skipped |
| Mulanya Ekesa Geoffrey | MP | Nambale | wikipedia says MP Nambale is "Geoffey Mulanywa" — skipped |
| Ndakwa David Athman | MP | Malava | wikipedia says MP Malava is "Moses Malulu Injendi" — skipped |
| Njeru Leo Wa Muthende | MP | Mbeere North | wikipedia says MP Mbeere North is "Geoffrey Kariuki Kiringa Ruku" — skipped |
| Omondi Moses Okoth | MP | Ugunja | wikipedia says MP Ugunja is "Opiyo Wandayi" — skipped |
| Sheikh Umul Ker Kassim | MP | Mandera | wikipedia says Woman Rep Mandera is "Ummul Kheir Khassim" — skipped |
| Cheburet Kiprono Chemitei | Senator | Baringo | wikipedia says Senator Baringo is "William Cheptumo" — skipped |
| David Wakoli Wafula | Senator | Bungoma | wikipedia says Senator Bungoma is "Moses Wetangula" — skipped |
| Kisang William Kipkemoi | Senator | Elgeyo Marakwet | wikipedia says Senator Elgeyo/Marakwet is "Kipchumba Murkomen" — skipped |

## name-collision (1)

**Suggested navigation:** Manual review: a different person with the same name slug already has an account, and seedPeople keys idempotency on slugify(name)@seed.leaders.ke — seed these by hand with a disambiguated name (e.g. include the middle name).

| Name | Seat | Region | Detail |
| --- | --- | --- | --- |
| Koech Kipngetich Victor | MP | Chepalungu | user #210 already owns victor-koech@seed.leaders.ke — seeding would attach this seat to their account; skipped |

## party-mismatch (6)

**Suggested navigation:** Informational — parliament.go.ke party was seeded; review for post-election defections if party accuracy matters.

| Name | Seat | Region | Detail |
| --- | --- | --- | --- |
| Abdi Khamis Chome | MP | Voi | roster says WPF, wikipedia says JP — seeding roster's |
| Alio Ahmed Maalim Hassan | MP | Banissa | roster says UDA, wikipedia says UDM — seeding roster's |
| Kagesi Ernest Ogesi Kivai | MP | Vihiga | roster says ANC, wikipedia says JP — seeding roster's |
| Keynan Wehliye Adan | MP | Eldas | roster says JP, wikipedia says ODM — seeding roster's |
| Mule Caleb Mutiso | MP | Machakos Town | roster says MCCP, wikipedia says Wiper — seeding roster's |
| Ekomwa James Lomenen | Senator | Turkana | roster says JP, wikipedia says Upya Party — seeding roster's |

## name-order-unverified (1)

**Suggested navigation:** Seeded from parliament's SURNAME-first form; fix firstName/otherNames by hand or extend the scraper to read the member's own page.

| Name | Seat | Region | Detail |
| --- | --- | --- | --- |
| Passaris Esther Muthoni | MP | Nairobi | no given-first source matched — seeded with parliament's SURNAME-first order |
