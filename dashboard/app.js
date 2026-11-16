// Token Radar dashboard (model radar-2). Renders window.RADAR, written by main.ts beside this page as
// ../data.js: the ranked board, one detail view per protocol, the model and its calibration, and the
// live-token protocols the model calibrates against. No network, no framework: hash routes only, so
// #/p/<slug> opens a protocol and #/?seg=early&sort=growth opens a filtered board, and both are links
// a reader can share and a screenshot can be taken of.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);

/** Escape a data string for HTML text and attribute use. */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Whole dollars the way a reader scans them: $2.76B, $514M, $7.8M, $940K. */
function money(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
}

/** Whole dollars in full, for the detail view: $2,758,000,000. */
function moneyFull(n) {
  return n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;
}

/** A signed seven-day change, coloured: +5.6%, -19.6%, or a dash when the snapshot reports none. */
function pctHtml(change) {
  if (change === null || change === undefined) return '<span class="flat">—</span>';
  const cls = change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat';
  return `<span class="${cls}">${change > 0 ? '+' : ''}${change.toFixed(1)}%</span>`;
}

/** An age in days as a reader scans it: 2.9y, 1.0y, 240d; a dash when DefiLlama gives no date. */
function ageText(days) {
  if (days === null || days === undefined) return '—';
  return days >= 365 ? `${(days / 365).toFixed(1)}y` : `${days}d`;
}

/** A multiple the way the model prints it: 0.205x. */
function mult(n) {
  return `${Number(n).toFixed(3)}x`;
}

/** The board state out of the hash: segment, filters, sort and query, with the detail slug if any. */
function readState() {
  const hash = location.hash.replace(/^#/, '');
  const detail = hash.match(/^\/p\/(.+)$/);
  if (detail) return { view: 'detail', slug: decodeURIComponent(detail[1]) };
  const q = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '');
  return {
    view: 'board',
    seg: ['watchlist', 'early'].includes(q.get('seg')) ? q.get('seg') : 'all',
    cat: q.get('cat') || '',
    chain: q.get('chain') || '',
    sort: ['tvl', 'growth', 'age', 'pertvl'].includes(q.get('sort')) ? q.get('sort') : 'implied',
    q: q.get('q') || '',
  };
}

/** The hash for a board state, so every filter combination is a link. */
function boardHash(s) {
  const q = new URLSearchParams();
  if (s.seg !== 'all') q.set('seg', s.seg);
  if (s.cat) q.set('cat', s.cat);
  if (s.chain) q.set('chain', s.chain);
  if (s.sort !== 'implied') q.set('sort', s.sort);
  if (s.q) q.set('q', s.q);
  const str = q.toString();
  return str ? `#/?${str}` : '#/';
}

/** The rows the current state shows: segment first, then filters, then the chosen sort. */
function currentRows(s) {
  let rows = R.rows;
  if (s.seg === 'watchlist') rows = rows.filter((r) => r.watchlist);
  if (s.seg === 'early') rows = rows.filter((r) => !r.watchlist);
  if (s.cat) rows = rows.filter((r) => (r.category ?? '') === s.cat);
  if (s.chain) rows = rows.filter((r) => r.chains.includes(s.chain));
  if (s.q) {
    const needle = s.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(needle) || r.slug.includes(needle));
  }
  const by = {
    implied: (a, b) => b.implied_value_usd - a.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    growth: (a, b) => (b.change_7d ?? -Infinity) - (a.change_7d ?? -Infinity),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
    pertvl: (a, b) => b.implied_value_usd / b.tvl_usd - a.implied_value_usd / a.tvl_usd,
  }[s.sort];
  return [...rows].sort(by || ((a, b) => a.rank - b.rank));
}

/** The header line, the hero statistics and the footer: the snapshot's own facts, stated once. */
function renderChrome() {
  $('topMeta').innerHTML = `snapshot <b>${esc(R.as_of)}</b> · model <b>${esc(R.model_version)}</b><br>${esc(R.source)}`;
  const c = R.counts;
  const stats = [
    [String(c.protocols), 'protocols scanned'],
    [`<em>${c.ranked}</em>`, 'pre-token ranked'],
    [`${c.watchlist} / ${c.watchlist}`, 'watchlist covered'],
    [String(c.early), 'found below the floor'],
    [String(R.calibration.live_samples), 'live ratios calibrating'],
  ];
  $('stats').innerHTML = stats.map(([v, k]) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
  $('foot').innerHTML =
    `<b>Data.</b> ${esc(R.source)}. The snapshot is frozen: every figure on this page is read from it, and the board is the same on every run. ` +
    `<b>Words.</b> A protocol here <i>records</i> no token in that data; that is not proof it has none. ` +
    `<b>Values.</b> An implied value is this model's claim about what a token would be worth if the protocol's record stayed as it is — it is not a prediction that a token will be issued, or when. ` +
    `Model <b>${esc(R.model_version)}</b>; the method is set out in full under <a href="#model">The model</a>.`;
}

/** The filter controls: categories and chains out of the board itself, wired to the hash. */
function renderControls(s) {
  const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  $('fCategory').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option ${c === s.cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
  $('fChain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option ${c === s.chain ? 'selected' : ''}>${esc(c)}</option>`).join('');
  $('fSort').value = s.sort;
  if ($('fQuery').value !== s.q) $('fQuery').value = s.q;
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seg === s.seg)));
  const go = () => {
    location.hash = boardHash({
      seg: document.querySelector('.seg button[aria-pressed="true"]').dataset.seg,
      cat: $('fCategory').value, chain: $('fChain').value, sort: $('fSort').value, q: $('fQuery').value.trim(),
    });
  };
  $('fCategory').onchange = go;
  $('fChain').onchange = go;
  $('fSort').onchange = go;
  $('fQuery').oninput = go;
  document.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => {
    document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    go();
  }));
}

/** The ranked board as a table; every row is a link to its protocol's detail view. */
function renderBoard(s) {
  const rows = currentRows(s);
  $('shownCount').textContent = `${rows.length} of ${R.rows.length} protocols`;
  $('boardEmpty').hidden = rows.length > 0;
  $('boardBody').innerHTML = rows.map((r) => `
    <tr data-slug="${esc(r.slug)}" class="${r.rank <= 3 ? 'top3' : ''}">
      <td class="num rank">${r.rank}</td>
      <td><span class="pname">${esc(r.name)}</span>${r.watchlist ? '<span class="badge watch">Watchlist</span>' : ''}<span class="pslug">${esc(r.slug)}</span></td>
      <td class="cat">${esc(r.category ?? '—')}</td>
      <td class="chains">${esc(r.chains[0] ?? '—')}${r.chains.length > 1 ? `<span class="more"> +${r.chains.length - 1}</span>` : ''}</td>
      <td class="num tvl">${money(r.tvl_usd)}</td>
      <td class="num">${pctHtml(r.change_7d)}</td>
      <td class="num age">${ageText(r.age_days)}</td>
      <td><span class="badge t-${esc(r.tier)}">${esc(r.tier)}</span></td>
      <td class="num implied">${money(r.implied_value_usd)}</td>
      <td class="num pertvl">${(r.implied_value_usd / r.tvl_usd).toFixed(2)}x</td>
    </tr>`).join('');
  $('boardBody').querySelectorAll('tr').forEach((tr) => (tr.onclick = () => (location.hash = `#/p/${encodeURIComponent(tr.dataset.slug)}`)));
}

/** One protocol in full: its record, the model's arithmetic on it, its comparables and its farm plan. */
function renderDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  const box = $('detail');
  if (!r) {
    box.innerHTML = '<p class="note">No ranked protocol by that name. <a href="#/">Back to the board</a>.</p>';
    box.hidden = false;
    return;
  }
  const m = r.model;
  const comps = (R.live_by_category[r.category] ?? []);
  const lo = Math.log(r.implied_low_usd / 1.6);
  const hi = Math.log(r.implied_high_usd * 1.6);
  const pos = (v) => Math.max(0, Math.min(100, ((Math.log(v) - lo) / (hi - lo)) * 100));
  const kv = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  box.innerHTML = `
    <a class="backlink" href="#/">← Back to the board</a>
    <div class="dhead">
      <h2>${esc(r.name)}</h2><span class="slug">${esc(r.slug)}</span>
      <span class="badge">Rank #${r.rank} of ${R.rows.length}</span>
      <span class="badge t-${esc(r.tier)}">${esc(r.tier)}</span>
      ${r.watchlist ? '<span class="badge watch">On the watchlist</span>' : '<span class="badge">Early radar — below the watchlist floor</span>'}
    </div>
    <p class="dsub">${esc(r.category ?? 'Uncategorised')} · records no token in the snapshot of ${esc(R.as_of)} · tracked by DefiLlama since ${esc(r.listed_at ?? 'an unrecorded date')}</p>
    <div class="dgrid">
      <div class="card">
        <h3>Implied value — model ${esc(R.model_version)}</h3>
        <div class="big-implied">${moneyFull(r.implied_value_usd)}</div>
        <div class="rangebar"><div class="fill" style="left:${pos(r.implied_low_usd)}%;width:${pos(r.implied_high_usd) - pos(r.implied_low_usd)}%"></div><div class="dot" style="left:${pos(r.implied_value_usd)}%"></div></div>
        <div class="range-labels"><span>low ${money(r.implied_low_usd)}</span><span>range to ${money(r.implied_high_usd)}</span></div>
        <p class="note">A point value for a token that does not exist yet would pretend to a precision the inputs do not have, so the board ranks on the point and shows the range it could honestly land in.</p>
      </div>
      <div class="card">
        <h3>The model's arithmetic</h3>
        <table class="mini">
          <tr><td>Total value locked</td><td class="n">${moneyFull(r.tvl_usd)}</td></tr>
          <tr><td>× category multiple (${esc(r.category ?? 'uncategorised')})</td><td class="n">${mult(m.category_multiple)}</td></tr>
          <tr><td>× growth, 7d ${r.change_7d === null ? 'not reported, counted as 0' : `${r.change_7d.toFixed(1)}% clamped`}</td><td class="n">${mult(m.growth_multiplier)}</td></tr>
          <tr><td>× maturity, ${m.age_days === null ? `age unrecorded, median ${R.calibration.median_age_days}d imputed` : `${m.age_days}d with no token`}</td><td class="n">${mult(m.maturity_multiplier)}</td></tr>
          <tr><td>× breadth, ${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}</td><td class="n">${mult(m.breadth_multiplier)}</td></tr>
          <tr class="tot"><td>= implied value</td><td class="n">${moneyFull(r.implied_value_usd)}</td></tr>
        </table>
        <p class="note">The category multiple is the median market value per dollar of TVL of the category's live-token protocols in this snapshot (n = ${m.category_live_samples}), shrunk toward the global median of ${mult(R.calibration.global_median)}.</p>
      </div>
      <div class="card">
        <h3>The record</h3>
        ${kv('TVL', moneyFull(r.tvl_usd))}
        ${kv('Seven-day change', r.change_7d === null ? 'not reported' : `${r.change_7d.toFixed(2)}%`)}
        ${kv('Age with no token', r.age_days === null ? 'unrecorded' : `${r.age_days} days (${ageText(r.age_days)})`)}
        ${kv('Chains', `${r.chains.length}: ${esc(r.chains.join(', '))}`)}
        ${kv('Implied per $ of TVL', `${(r.implied_value_usd / r.tvl_usd).toFixed(2)}x`)}
        ${kv('Token', 'none recorded — no market cap, no CoinGecko id, no symbol')}
      </div>
      <div class="card">
        <h3>Live comparables — ${esc(r.category ?? 'uncategorised')}</h3>
        ${comps.length === 0
          ? '<p class="note">No live-token protocol in this category is large enough to sit in the comparable set; this row is priced on the global median multiple.</p>'
          : `<table class="mini"><tr><th>Protocol</th><th class="n">Market cap</th><th class="n">per $ TVL</th></tr>${comps.map((c) => `<tr><td>${esc(c.name)}</td><td class="n">${money(c.mcap_usd)}</td><td class="n">${c.mcap_per_tvl === null ? '—' : mult(c.mcap_per_tvl)}</td></tr>`).join('')}</table>
             <p class="note">Protocols in this category whose token already trades: the market's own prices, and the ground the category multiple stands on.</p>`}
      </div>
    </div>
    <div class="card plan">
      <h3>Farm plan — ${esc(r.name)}</h3>
      <ol class="steps">${r.farm_plan.map((s) => `<li><div><div class="step-text">${esc(s.text)}</div><div class="step-meta"><span class="chip">Cost: <b>${esc(s.cost)}</b></span><span class="chip">Time: <b>${esc(s.time)}</b></span></div></div></li>`).join('')}</ol>
    </div>`;
  box.hidden = false;
}

/** The model section: the method, the constants and the calibration table, all stated in the open. */
function renderModel() {
  const m = R.model;
  const cal = R.calibration;
  $('model').innerHTML = `
    <h2>The model — ${esc(R.model_version)}</h2>
    <p>The board ranks protocols that record no token by an <b>implied value</b>: what a token would be worth if the
    protocol's record stayed as it is. It is built only from the snapshot's own figures. The starting point is the
    market's own pricing (each live ratio winsorized to 0.01x–5x first, so one token with a dust TVL prices nothing): among the snapshot's live-token protocols, a dollar of TVL carries a median market value of
    <b>${mult(cal.global_median)}</b> (${cal.live_samples} protocols with both a market cap and a TVL). Each category is priced on its own
    live protocols' median, <b>shrunk toward that global median in log space</b> by its sample size — a geometric blend, so a category priced on two tokens
    cannot shout down one priced on fifty — and clamped between ${mult(m.multiple_min)} and ${mult(m.multiple_max)}. Growth, maturity and breadth then adjust the base.</p>
    <div class="formula">implied = TVL × category multiple × (1 + ${m.growth_weight} × clamp(7d change, ${m.growth_floor}…${m.growth_cap}) / 100) × (${m.maturity_floor} + ${m.maturity_range} × min(age, ${m.maturity_days}d) / ${m.maturity_days}) × (1 + ${m.breadth_per_chain} × min(chains − 1, ${m.breadth_max_extra_chains}))</div>
    <p><b>Growth</b> counts the seven-day TVL change at weight ${m.growth_weight}, clamped so one hot or cold week cannot dominate a record built over years.
    <b>Maturity</b> pays for time served with no token — a protocol that has run for years without issuing one has proved it can operate without one — capped at three years; an unrecorded age is imputed with the snapshot's median age of ${cal.median_age_days} days and the row says so.
    <b>Breadth</b> adds a small premium per extra chain, because a launch meets the users the protocol already has.
    The board ranks on the point value and shows a range of ${m.range_low}× to ${m.range_high}× beside it. No protocol's name is ever special-cased: the same function scores every row, and every input to it is printed on the row and in board.json.</p>
    <h3>Who is ranked, and who is not</h3>
    <p>Ranked: every protocol that records no token and is not a wrapped, staked or bridged product of a token that already trades, not an exchange and not a versioned pool of another protocol — ${R.counts.ranked} of the snapshot's ${R.counts.protocols}.
    The house watchlist (TVL at or above ${money(R.floor_usd)}, ${R.counts.watchlist} protocols) is the floor of that coverage, never the ceiling: ${R.counts.early} ranked protocols sit below it, and finding them is the radar's job.
    Not ranked: the ${R.counts.protocols - R.counts.ranked} protocols whose token already trades or which are products of one that does — they are the calibration set and the <a href="#live">Live tokens</a> view, at the market's own values.</p>
    <h3>Calibration — the market value of $1 of TVL, by category</h3>
    <div class="scroll"><table class="grid">
      <tr><th>Category</th><th class="n">Live samples</th><th class="n">Median mcap / TVL</th><th class="n">Applied multiple</th></tr>
      ${cal.categories.map((c) => `<tr><td>${esc(c.category)}</td><td class="n">${c.live_samples}</td><td class="n">${mult(c.median_ratio)}</td><td class="n">${mult(c.applied_multiple)}</td></tr>`).join('')}
    </table></div>`;
}

/** The live-token view: protocols whose token already trades, at the market's own values. */
function renderLive() {
  $('live').innerHTML = `
    <h2>Live tokens — set aside, never ranked</h2>
    <p>These protocols' tokens already trade, so the board shows the market's own value for them and no model value at all.
    They matter to the radar twice over: they are what a launch is worth being compared against, and their prices are the ground the model's category multiples stand on. The ${R.live.length} largest by market cap:</p>
    <div class="scroll"><table class="grid">
      <tr><th>Protocol</th><th>Category</th><th class="n">TVL</th><th class="n">Market cap</th><th class="n">per $ TVL</th><th class="n">7d</th></tr>
      ${R.live.map((p) => `<tr><td><span class="pname">${esc(p.name)}</span><span class="pslug">${esc(p.slug)}</span></td><td class="cat">${esc(p.category ?? '—')}</td><td class="n">${money(p.tvl_usd)}</td><td class="n">${money(p.mcap_usd)}</td><td class="n">${p.mcap_per_tvl === null ? '—' : mult(p.mcap_per_tvl)}</td><td class="n">${pctHtml(p.change_7d)}</td></tr>`).join('')}
    </table></div>`;
}

/** Route: the board, or one protocol's detail; the model and live sections render once beneath both. */
function route() {
  const s = readState();
  const detail = s.view === 'detail';
  $('boardWrap').hidden = detail;
  $('controls').style.display = detail ? 'none' : '';
  document.querySelector('.hero').style.display = detail ? 'none' : '';
  if (detail) {
    renderDetail(s.slug);
    window.scrollTo(0, 0);
  } else {
    $('detail').hidden = true;
    renderControls(s);
    renderBoard(s);
  }
}

renderChrome();
renderModel();
renderLive();
route();
window.addEventListener('hashchange', route);
