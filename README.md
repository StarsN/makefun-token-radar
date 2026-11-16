# Token Radar — model radar-2

An entry for make.fun's **token-radar-01** bounty: a token launch radar over the competition's sealed
DefiLlama snapshot (758 protocols, fetched 2026-11-14).

`main.ts` reads the snapshot at `/input/snapshot.json` (or `--input <file|dir>`), ranks the pre-token
protocols with the model in `lib/model.ts`, writes `/output/board.json` and `/output/data.js`, copies
`dashboard/` and `screenshots/` into `/output`, and writes `/output/dossier.json` last with the vendored
`buildDossier` from `vendor/makefun-board.ts`. Node 22, standard library only, fully deterministic:
the same snapshot produces the same bytes on every run.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

## Who gets ranked

A protocol is ranked when its snapshot record carries **no token** (no market cap, no CoinGecko id, no
symbol) and it is not a wrapped, staked or bridged product of a token that already trades, not an
exchange, and not a versioned pool of another protocol. That is the house watchlist's own rule without
its $50M TVL floor, applied to the whole snapshot: **198 protocols**, all 40 watchlist members among
them. The other 560 protocols — tokens already trading, plus products of tokens that trade — are never
ranked; they are the calibration set and the dashboard's Live tokens view.

## The model

An implied value is what a protocol's token would be worth if its record stayed as it is, derived only
from the snapshot's own figures:

- **Category multiple.** Among live-token protocols, a dollar of TVL carries a median market value of
  about 0.21x. Each category is priced on its own live protocols' median market-cap/TVL, shrunk toward
  that global median in log space by sample size (a geometric blend with weight 4 on the global figure)
  and clamped to [0.03, 1.5], so a category priced on one or two tokens cannot shout down one priced
  on fifty.
- **Growth.** The seven-day TVL change, clamped to [-50%, +100%], at weight 0.45.
- **Maturity.** 0.80 + 0.30 × min(age, 1095d)/1095 — a protocol that has run for years with no token has
  proved it can operate without one. An unrecorded age is imputed with the snapshot's median age
  (677 days) and the row says so.
- **Breadth.** +1.5% per extra chain, capped at eight: a launch meets the users the protocol already has.

`implied = TVL × multiple × growth × maturity × breadth`, ranked descending. The board also carries a
range (0.45x–2.2x the point value): a point value for a token that does not exist yet would pretend to a
precision the inputs do not have. No protocol name is special-cased anywhere; every input to a row's
value is printed on the row itself.

## Farm plans

Each row carries six concrete steps generated from its own record: the category sets the core position
(supply, provide liquidity, vault deposit, margin, mint…), the first chain sets the gas band, TVL sets
the capital ($50–$300), age sets the hold window (30–60 days), and the protocol's own seven-day change
sets the caution in step five — size down on a sharp TVL fall, don't chase a sharp rise, recheck monthly
otherwise. Every step states what it costs and how long it takes.

## The dashboard

A static page (`dashboard/index.html`, `app.css`, `app.js`; renders offline from `data.js`): the ranked
board with segment (all / watchlist / early radar), category and chain filters, five sort orders and
search; a detail view per protocol with the model's full arithmetic, live same-category comparables and
the farm plan; the model section with the formula and the whole calibration table; and the Live tokens
view. Views are hash links (`#/p/<slug>`, `#/?seg=early&sort=growth`), which is also how the three
screenshots in `screenshots/` were taken of the real page and data.
