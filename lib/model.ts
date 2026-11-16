// The token radar's model (radar-2): one snapshot of the protocol universe in, one ranked board out.
//
// What the board is. The snapshot lists every protocol DefiLlama tracks at $5M of TVL or more. A
// protocol is a launch candidate when its record carries no token (no market cap, no CoinGecko id, no
// symbol) and it is not a wrapped, staked or bridged product of a token that already trades, not an
// exchange and not a versioned pool of another protocol. The board ranks every such protocol in the
// snapshot — the house watchlist (TVL at or above the floor) is the floor of the coverage, never the
// ceiling — by the value its token would carry if its record stayed as it is. Protocols whose token
// already trades are never ranked: they are shown apart, at the market's own values, and their one use
// in the model is calibration.
//
// How an implied value is derived, from the snapshot's own figures and nothing else:
//
//   multiple   the market's own price of a dollar of TVL in the protocol's category: the median
//              market-cap/TVL ratio of the snapshot's live-token protocols in that category, shrunk
//              toward the global median in log space by the category's sample size (a geometric
//              blend, so one small category priced on a single token cannot shout down the global
//              figure), then clamped to a sane band. Each live ratio is winsorized to [0.01, 5]
//              before any median is taken, so one token with a dust TVL prices nothing.
//   base       = tvl_usd x multiple
//   growth     = clamp(change_7d, -50, +100);  growthMult = 1 + 0.45 x growth / 100
//   maturity   = 0.80 + 0.30 x min(age_days, 1095) / 1095, age measured from listed_at to the
//              snapshot's as_of day; an unlisted age is imputed with the snapshot's median age and
//              the row says so. A protocol that has run for years with no token has proved it can
//              operate without one; the factor pays for that record, capped at three years.
//   breadth    = 1 + 0.015 x min(chains - 1, 8): a launch meets the users the protocol already has,
//              and a protocol live on more chains has more of them.
//   implied    = max(1, round(base x growthMult x maturityMult x breadthMult))
//
// The board also carries a range, implied x 0.45 to implied x 2.2, because a point value for a token
// that does not exist yet would pretend to a precision the inputs do not have. No protocol name is
// ever special-cased: the same function scores every row, and every input to it is printed on the row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard so a reader can re-run the board by hand. */
export interface ModelConstants {
  shrink_k: number;
  multiple_min: number;
  multiple_max: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  breadth_per_chain: number;
  breadth_max_extra_chains: number;
  range_low: number;
  range_high: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 4,
  multiple_min: 0.03,
  multiple_max: 1.5,
  growth_weight: 0.45,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.8,
  maturity_range: 0.3,
  maturity_days: 1095,
  breadth_per_chain: 0.015,
  breadth_max_extra_chains: 8,
  range_low: 0.45,
  range_high: 2.2,
};

/** The model's version label: the dashboard names it and the board's rows carry it. */
export const MODEL_VERSION = 'radar-2';

/** The band a single live protocol's market-cap/TVL is winsorized into before any median is taken. */
export const RATIO_MIN = 0.01;
export const RATIO_MAX = 5;

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 30;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One category's calibration: how the market prices a dollar of TVL there. */
export interface CategoryCalibration {
  category: string;
  live_samples: number;
  median_ratio: number | null;
  applied_multiple: number;
}

/** The whole calibration the snapshot supports: one global median and one row per category. */
export interface Calibration {
  global_median: number;
  live_samples: number;
  median_age_days: number;
  categories: CategoryCalibration[];
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  tier: string;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  model: {
    version: string;
    category_multiple: number;
    category_live_samples: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    age_imputed: boolean;
    breadth_multiplier: number;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row: the row itself, farm plan included. */
export interface RadarRow extends BoardRow {
  farm_plan: FarmStep[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_per_tvl: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  counts: {
    protocols: number;
    ranked: number;
    watchlist: number;
    early: number;
    live: number;
  };
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
  /** The three largest live-token protocols of each category: the comparables a detail view shows. */
  live_by_category: Record<string, LiveRow[]>;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The median of a non-empty list, the average of the two middle values on an even count. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a product of another protocol's token, or an exchange, never a launch of their own. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchanges a protocol's name may not begin with: its product is the exchange, not a launch. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word that marks a wrapped or staked product of a token that already trades. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a protocol is one the board may rank: it records no token and is not a wrapped, staked or
 * bridged product of one that trades, not an exchange and not a versioned pool. This is the watchlist's
 * own rule without its TVL floor, applied to the whole snapshot.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (PRODUCT_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** A track-record tier from age: it sets the farm plan's hold window and the dashboard's badge. */
export function tierFor(age: number | null): string {
  if (age === null) return 'Undated';
  if (age >= 730) return 'Seasoned';
  if (age >= 365) return 'Established';
  if (age >= 90) return 'Emerging';
  return 'New';
}

/**
 * The market's own pricing of TVL, read out of the snapshot's live-token protocols: for each category,
 * the median market-cap/TVL of its live protocols, shrunk toward the global median in log space by
 * sample size — a geometric blend, so a category priced on one or two tokens stays near the global
 * figure while a category priced on fifty mostly stands on its own — and clamped to a sane band.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const ratios: number[] = [];
  const byCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    // Winsorized: one live token with a dust TVL (or a dust market cap) must not price a whole category.
    const ratio = clamp(p.mcap_usd / p.tvl_usd, RATIO_MIN, RATIO_MAX);
    ratios.push(ratio);
    if (p.category !== null) {
      const list = byCategory.get(p.category) ?? [];
      list.push(ratio);
      byCategory.set(p.category, list);
    }
  }
  const globalMedian = ratios.length > 0 ? median(ratios) : 0.2;
  const ages = snapshot.protocols
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null);
  const medianAge = ages.length > 0 ? Math.round(median(ages)) : 365;
  const categories: CategoryCalibration[] = [...byCategory.entries()]
    .map(([category, list]) => {
      const med = median(list);
      const blended = Math.exp((list.length * Math.log(med) + model.shrink_k * Math.log(globalMedian)) / (list.length + model.shrink_k));
      const applied = clamp(blended, model.multiple_min, model.multiple_max);
      return { category, live_samples: list.length, median_ratio: round4(med), applied_multiple: round4(applied) };
    })
    .sort((a, b) => b.live_samples - a.live_samples || (a.category < b.category ? -1 : 1));
  return { global_median: round4(globalMedian), live_samples: ratios.length, median_age_days: medianAge, categories };
}

/** The multiple one protocol is priced at: its category's calibrated multiple, or the global median. */
function multipleFor(p: SnapshotProtocol, calibration: Calibration, model: ModelConstants): { multiple: number; samples: number } {
  if (p.category !== null) {
    const row = calibration.categories.find((c) => c.category === p.category);
    if (row !== undefined) return { multiple: row.applied_multiple, samples: row.live_samples };
  }
  return { multiple: clamp(calibration.global_median, model.multiple_min, model.multiple_max), samples: 0 };
}

/** The multipliers and the implied value one protocol gets under `model`, with every input kept. */
export function impliedValue(
  p: SnapshotProtocol,
  snapshot: Snapshot,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): { implied: number; low: number; high: number; multiple: number; samples: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null; ageImputed: boolean } {
  const age = ageDays(snapshot.as_of, p.listed_at);
  const ageImputed = age === null;
  const ageForModel = age ?? calibration.median_age_days;
  const { multiple, samples } = multipleFor(p, calibration, model);
  const growthPct = clamp(p.change_7d ?? 0, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_extra_chains);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult * breadthMult));
  return {
    implied,
    low: Math.max(1, Math.round(implied * model.range_low)),
    high: Math.round(implied * model.range_high),
    multiple,
    samples,
    growthPct,
    growthMult,
    maturityMult,
    breadthMult,
    age,
    ageImputed,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter(isRankable)
    .map((p) => ({ p, v: impliedValue(p, snapshot, calibration, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: watch.has(s.p.slug),
    tier: tierFor(s.v.age),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    implied_low_usd: s.v.low,
    implied_high_usd: s.v.high,
    model: {
      version: MODEL_VERSION,
      category_multiple: s.v.multiple,
      category_live_samples: s.v.samples,
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      age_days: s.v.age,
      age_imputed: s.v.ageImputed,
      breadth_multiplier: round4(s.v.breadthMult),
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

// ---------------------------------------------------------------- farm plans

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, in the bands a farmer actually pays. */
function gasBand(chain: string): string {
  if (chain === 'Ethereum') return 'about $6-15 of gas a transaction';
  if (chain === 'Bitcoin') return 'about $1-4 of network fees a transaction';
  const cheap = ['Base', 'Arbitrum', 'Optimism', 'Linea', 'Scroll', 'zkSync Era', 'Mantle', 'Sonic', 'Avalanche', 'Polygon', 'Binance', 'Solana', 'Tron', 'Sui', 'Aptos', 'Near', 'Hyperliquid L1', 'Monad', 'Plasma', 'Fantom', 'Gnosis', 'Celo', 'Moonbeam', 'Starknet'];
  if (cheap.includes(chain)) return 'about $0.05-1 of gas a transaction';
  return 'about $1-3 of gas a transaction';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 250_000_000) return 120;
  if (p.tvl_usd >= 50_000_000) return 80;
  return 50;
}

/** How long to hold, from the protocol's tier: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  const tier = tierFor(age);
  if (tier === 'New') return 60;
  if (tier === 'Emerging' || tier === 'Undated') return 45;
  return 30;
}

/** Whole dollars the way a reader scans them: $2.76B, $514M, $7.8M. */
export function money(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
}

/** A signed per-cent the way the snapshot writes it: +5.6%, -19.6%, or 'not reported'. */
function pct(change: number | null): string {
  if (change === null) return 'not reported';
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
}

/** The category's core position, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend')) return `Supply $${capital} of USDC to ${name} on ${chain}; if it offers borrowing, borrow about a third of it against the position and repay it a week later, so both sides of the market see the wallet.`;
  if (c.includes('cdp')) return `Deposit $${capital} of collateral into ${name} on ${chain} and mint a small amount of its stablecoin against it, keeping the collateral ratio well above the liquidation line.`;
  if (c.includes('dex') || c.includes('swap')) return `Provide $${capital} split between the two sides of ${name}'s busiest pool on ${chain}, and route a few swaps through the same wallet so it reads as a user, not a parked deposit.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('collateral')) return `Deposit $${capital} into one of ${name}'s curated vaults on ${chain} and keep the vault shares in the wallet; a vault position is the activity these protocols count.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position; close and reopen it weekly rather than leaving a large trade running.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and take small positions in three liquid markets, letting at least one settle so the wallet has a full trade history.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it; for real-world-asset protocols the held balance over time is the record that matters.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for a common protocol risk and keep the policy to its end date.`;
  if (c.includes('privacy')) return `Deposit $${capital} through ${name} on ${chain} in one transaction and leave the shielded balance in place; split nothing and move nothing in a pattern.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the wallet, unstaked and unspent.`;
  if (c.includes('yield')) return `Deposit $${capital} into ${name}'s main vault on ${chain} and keep the shares; add a small top-up each week so the balance history is a line, not a spike.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the wallet rather than routing it onward.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} through its own app and keep the position open; use the protocol's core product, not a side feature.`;
}

/** The category's weekly qualifying action: the small repeat visit that snapshots count. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Make one small borrow-and-repay or collateral top-up on ${name} each week, so the wallet appears in several weekly snapshots instead of one.`;
  if (c.includes('dex') || c.includes('swap')) return `Swap a small amount through ${name} each week and rebalance the liquidity position if the price has moved it out of range.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Open and close one small hedged trade on ${name} each week; steady modest volume counts for more than one large trade.`;
  if (c.includes('prediction')) return `Take one or two small market positions on ${name} each week and let them settle rather than selling out early.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge a small amount through ${name} each week, alternating direction, and use the bridged funds in one app on the far side.`;
  return `Make one qualifying action on ${name} each week — a deposit, a top-up, a swap or a vote — so the wallet's activity spans several snapshots.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, derived from the protocol's
 * own record — its category sets the position, its first chain sets the gas band, its TVL sets the
 * capital, its age sets the hold, and its own seven-day change sets the caution in step five.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasBand(chain);
  const change = p.change_7d;
  let signal: FarmStep;
  if (change !== null && change <= -15) {
    signal = {
      text: `Size down and recheck before adding: ${p.name}'s TVL is ${money(p.tvl_usd)} and fell ${pct(change)} in the seven days to this snapshot, so keep the position at the $${capital} minimum and re-read its TVL in a week; a fall of another 30% is a reason to exit, not to average in.`,
      cost: 'nothing to check; the exit, if it comes, is one transaction',
      time: '10 minutes a week',
    };
  } else if (change !== null && change >= 15) {
    signal = {
      text: `Do not chase the momentum: ${p.name}'s TVL is ${money(p.tvl_usd)} and rose ${pct(change)} in seven days, the kind of inflow mercenary capital makes before a snapshot; keep the planned $${capital}, add nothing extra, and expect some of that TVL to leave.`,
      cost: 'nothing extra; discipline is the cost',
      time: '5 minutes to re-read the figure weekly',
    };
  } else {
    signal = {
      text: `Recheck the inputs monthly: ${p.name}'s TVL stands at ${money(p.tvl_usd)} with a seven-day change of ${pct(change)}; if TVL falls 30% or more from here, cut the position to the minimum that keeps it qualifying, and if the protocol announces a token, re-read the claim terms before doing anything else.`,
      cost: 'nothing to check',
      time: '10 minutes a month',
    };
  }
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm with, keep its seed phrase offline, and reach ${p.name} only from the link its official account publishes — fake claim pages are the commonest way farms are lost.`,
      cost: 'under $3 to fund the wallet on most chains',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: gas,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days and act in at least four different weeks, so the activity is counted in more than one snapshot; a position opened and closed inside a week is the pattern points programs filter out.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    signal,
    {
      text: `If a token launches, claim only from the link on ${p.name}'s official page, never pay a fee to claim, and write the wallet, the dates and every transaction hash in a farm log so the position can be repeated or unwound.`,
      cost: 'nothing but the log; a claim, if one comes, is one transaction',
      time: '5 minutes, plus 10 minutes if a claim opens',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live view: the market's own values. */
export function liveRows(snapshot: Snapshot, limit: number = LIVE_ROWS): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, limit)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_per_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const calibration = calibrate(snapshot, model);
  const live = liveRows(snapshot);
  const liveByCategory: Record<string, LiveRow[]> = {};
  for (const row of liveRows(snapshot, Number.POSITIVE_INFINITY)) {
    if (row.category === null || row.mcap_usd === null) continue;
    const list = liveByCategory[row.category] ?? [];
    if (list.length < 3) list.push(row);
    liveByCategory[row.category] = list;
  }
  const watch = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const rows: RadarRow[] = board.map((r) => ({ ...r, farm_plan: farmSteps(bySlug.get(r.slug)!, r.age_days) }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    counts: {
      protocols: snapshot.protocols.length,
      ranked: board.length,
      watchlist: snapshot.watchlist.length,
      early: board.filter((r) => !watch.has(r.slug)).length,
      live: live.length,
    },
    calibration,
    rows,
    live,
    live_by_category: liveByCategory,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return 'every row shares the same implied value: a board that ranks nothing by value is not a ranking';
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
