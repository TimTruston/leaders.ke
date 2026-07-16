# Scraped 13th-Parliament seed: conflicts and duplicates

Generated 2026-07-16T13:42:50.967Z from `seed-input-roster.snapshot.json` (383 roster rows), `scraped-wikipedia-13th.json`, `scraped-mps-13th.json`.

## Summary

| Metric | Count |
| --- | ---: |
| Roster rows | 383 |
| Clean new leaders to create | 6 (MP 6, Woman Rep 0, Senator 0) |
| Existing profiles to enrich | 72 |
| Emails to add | 1 |
| Phones to add | 1 |
| Bios to backfill (wikipedia) | 2 |
| Photos available but skipped (policy: no external hotlinks) | wikipedia 33, mzalendo 347 |
| vacant-seat | 2 |
| duplicate-roster-row | 1 |
| seat-conflict | 1 |
| source-name-conflict | 11 |
| party-mismatch | 6 |

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
