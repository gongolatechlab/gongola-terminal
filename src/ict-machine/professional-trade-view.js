/**
 * Presentation-only reflow of an existing v1.3 research scenario.
 * Does not calculate or modify price, target, stop, R:R, data, events, or orders.
 * The original text nodes are MOVED to named, semantic sections.
 */
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function presentResearchTicket(body, data) {
  if (!body || !data || !body.querySelector('.gongola-trade-warning')) return;
  const pairs = new Map();
  for (const node of Array.from(body.children)) {
    if (node.tagName !== 'DT') continue;
    const next = node.nextElementSibling;
    if (next?.tagName === 'DD') pairs.set(node.textContent, [node, next]);
  }
  const note = body.querySelector('.gongola-trade-note');
  const warning = body.querySelector('.gongola-trade-warning');
  const p = data.plan;
  const available = Boolean(p && p.status !== 'unavailable');

  const ticket = el('div', 'g-pro-ticket');
  const overline = el('div', 'g-pro-eyebrow', 'SETUP INSPECTION  /  RESEARCH ONLY');
  const synopsis = el('div', 'g-pro-synopsis');
  const heading = el('div', 'g-pro-subtitle', 'Calculated scenario');
  const side = el('span', 'g-pro-side');
  const direction = pairs.get('Direction')?.[1]?.textContent ?? '';
  side.textContent = available ? direction : 'NO ACTIVE PLAN';
  side.classList.add(available && p.direction === 'bullish' ? 'is-long' : available && p.direction === 'bearish' ? 'is-short' : 'is-unavailable');
  synopsis.append(heading, side);
  // The direction is already displayed in the side badge. Avoid duplicate detail rows.
  pairs.delete('Direction');
  ticket.append(overline, synopsis);

  function movePair(key, destination, cardClass = '') {
    const pair = pairs.get(key);
    if (!pair) return;
    const cell = el('div', `g-pro-pair ${cardClass}`);
    cell.append(pair[0], pair[1]);
    destination.append(cell);
    pairs.delete(key);
  }

  if (available) {
    const prices = el('section', 'g-pro-prices');
    prices.setAttribute('aria-label', 'Entry, stop and target');
    movePair('Entry', prices, 'is-entry');
    movePair('Stop Loss', prices, 'is-stop');
    movePair('Take Profit (next untaken liquidity)', prices, 'is-target');
    ticket.append(prices);

    const rr = el('section', 'g-pro-rr');
    rr.setAttribute('aria-label', 'Risk to reward');
    movePair('Risk:Reward', rr, 'is-rr');
    const qualifier = el('span', 'g-pro-rr-note', 'Model output · not an order');
    rr.append(qualifier);
    ticket.append(rr);
  } else {
    const noPlan = el('div', 'g-pro-empty', 'No eligible research scenario for this drawing.');
    ticket.append(noPlan);
  }

  const mechanics = el('details', 'g-pro-disclosure');
  const mechanicsLabel = el('summary', '', 'Method & calculations');
  const methodGrid = el('div', 'g-pro-method-grid');
  for (const key of ['Entry model', 'Stop rule', 'Target source', 'Risk distance', 'Reward distance', 'Research plan']) {
    movePair(key, methodGrid);
  }
  mechanics.append(mechanicsLabel, methodGrid);
  ticket.append(mechanics);

  const provenance = el('details', 'g-pro-disclosure');
  provenance.append(el('summary', '', 'Zone details & provenance'));
  const provenanceGrid = el('div', 'g-pro-method-grid');
  for (const key of ['Upper boundary', 'Lower boundary', 'Origin (UTC)', 'Current state', 'Source']) {
    movePair(key, provenanceGrid);
  }
  provenance.append(provenanceGrid);
  ticket.append(provenance);

  if (note) {
    note.classList.add('g-pro-note');
    ticket.append(note);
  }
  if (warning) {
    warning.classList.add('g-pro-warning');
    ticket.append(warning);
  }
  // Every original field is preserved, including unforeseen additions.
  const extra = el('div', 'g-pro-other');
  for (const [key] of pairs) movePair(key, extra);
  if (extra.childElementCount) ticket.append(extra);
  body.replaceChildren(ticket);
}
