/** Gongola Market Intelligence v1.6 — real published briefs only; no fabricated reports. */
import './intelligence.css';
const root = import.meta.env.BASE_URL.replace(/\/+$/, '');
export const intelligenceUrl = `${root}/intelligence`;
const terminalUrl = `${root}/terminal`;
const homeUrl = `${root}/`;
export function isIntelligencePath(){const path=location.pathname.replace(/\/+$/, '');return path===intelligenceUrl;}
const MARKETS = ['XAUUSD','EURUSD','GBPUSD','USDCAD','NAS100'];
const LABELS={XAUUSD:'Gold / US Dollar',EURUSD:'Euro / US Dollar',GBPUSD:'British Pound / US Dollar',USDCAD:'US Dollar / Canadian Dollar',NAS100:'Nasdaq 100'};
const asNY = (date, opts = {}) => new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true,...opts}).format(date);
const isoTime = value=>Number.isFinite(Date.parse(value||'')) ? asNY(new Date(value))+' ET' : 'Not available';
const el=(tag,cls,content)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(content!=null)node.textContent=content;return node;};
const addText=(parent,tag,cls,content)=>{const n=el(tag,cls,content);parent.append(n);return n;};
function rowList(section,values,placeholder){const list=el('ul','gmi-notes');const safe=Array.isArray(values)?values.filter(v=>typeof v==='string'&&v.trim()):[];
if(!safe.length){addText(section,'p','gmi-muted',placeholder);return;}
for(const s of safe.slice(0,9))addText(list,'li','',s.slice(0,900));section.append(list);
}
function sourceLinks(parent, sources){const wrap=el('div','gmi-sources');
for(const [i,s] of (Array.isArray(sources)?sources:[]).entries()){
try{const url=new URL(s.url);if(url.protocol!=='https:')continue;
const a=el('a','gmi-source-link',`${i+1}. ${s.title||url.hostname}`);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';wrap.append(a);}catch{}}
if(!wrap.children.length)addText(parent,'p','gmi-warning','No verifiable source links are attached.');else parent.append(wrap);
}
function viewForSession(container, payload, session){
container.replaceChildren();
if(!payload?.brief){const empty=el('div','gmi-empty');addText(empty,'span','gmi-eyebrow','AWAITING VERIFIED RESEARCH');
addText(empty,'h2','','No briefing published for this session.');
addText(empty,'p','','Gongola never invents macro bias or carries yesterday’s direction forward. A scheduled research service must publish a source-linked report before results can appear here.');
addText(empty,'p','gmi-muted','Refresh retrieves the latest published report; it does not generate a new analysis.');container.append(empty);return;}
const b=payload.brief;
const expiry=Date.parse(b.expiresAt||''), published=Date.parse(b.publishedAt||'');
const expired=!Number.isFinite(expiry)||Date.now()>expiry;
const invalid=!Number.isFinite(published)||published>Date.now()+5*60_000||!Array.isArray(b.sources)||b.sources.length<2||b.session!==session||!Array.isArray(b.markets)||b.markets.length!==5||MARKETS.some(s=>!b.markets.some(m=>m.symbol===s));
const header=el('div','gmi-brief-head');const lhs=el('div');
addText(lhs,'span','gmi-eyebrow',session==='london'?'LONDON PRE-SESSION':'NEW YORK PRE-SESSION');
addText(lhs,'h2','',b.title||'Macro Research Briefing');
addText(lhs,'p','gmi-muted',`Published ${isoTime(b.publishedAt)} · Expires ${isoTime(b.expiresAt)}`);
header.append(lhs);addText(header,'span',expired||invalid?'gmi-label gmi-expired':'gmi-label',invalid?'UNVERIFIED':expired?'EXPIRED':'RESEARCH · UNREVIEWED');container.append(header);
const banner=el('p',expired||invalid?'gmi-alert':'gmi-info',invalid?'This report failed basic provenance checks. Do not rely on its directional assessments.':expired?'This session report has expired. Directional assessments and candidate states are no longer current.':'Source-linked AI research; facts and interpretations are not independently certified. Macro context is not an entry signal.');container.append(banner);
const overview=el('section','gmi-section');addText(overview,'h3','','Session thesis');addText(overview,'p','gmi-lead',b.overview||'No overview supplied.');
const chunks=el('div','gmi-two-col');for(const [title,items] of [['Confirmed drivers',b.drivers],['Risks and catalysts',b.events]]){const blk=el('section','gmi-subsection');addText(blk,'h4','',title);rowList(blk,items,'No evidence published.');chunks.append(blk);}const horizons=el('div','gmi-context-grid');for(const [label,value] of [['WEEKLY BACKDROP',b.weeklyContext],['TODAY’S REASSESSMENT',b.dailyContext]]){const box=el('section','gmi-context-block');addText(box,'span','gmi-eyebrow',label);addText(box,'p','',value||'No separate context supplied.');horizons.append(box);}overview.append(horizons);overview.append(chunks);container.append(overview);
const title=el('div','gmi-section-title');addText(title,'h3','','Instrument assessment');addText(title,'p','gmi-muted','Candidate status is provisional until chart structure and liquidity confirm it.');container.append(title);
const grid=el('div','gmi-market-grid');for(const symbol of MARKETS){const x=b.markets.find(m=>m.symbol===symbol)||{};const card=el('article','gmi-market-card');const bar=el('div','gmi-market-top');const name=el('div');addText(name,'strong','',symbol);addText(name,'small','',LABELS[symbol]);bar.append(name);const bias=['bullish','bearish','neutral','mixed'].includes(x.bias)?x.bias:'unknown';addText(bar,'span',`gmi-bias gmi-${bias}`,expired||invalid?'EXPIRED':bias.toUpperCase());card.append(bar);
const status=x.candidate==='watch'?'WATCH':x.candidate==='rejected'?'REJECTED':'CONTEXT ONLY';
addText(card,'span','gmi-candidate',expired||invalid?'CANDIDATE SUSPENDED':status);
addText(card,'p','gmi-card-reason',x.rationale||'No rationale supplied.');
const details=el('div','gmi-card-details');const lab=el('dl');for(const [label,value] of [['Confidence',x.confidence||'Unrated'],['Watch',x.watch||'No defined trigger'],['Invalidation',x.invalidation||'Not defined']]){addText(lab,'dt','',label);addText(lab,'dd','',value);}details.append(lab);card.append(details);grid.append(card);}container.append(grid);
const footer=el('section','gmi-section gmi-evidence');addText(footer,'h3','','Evidence and review');addText(footer,'p','gmi-muted',b.reviewNote||'Source links are research references, not proof that every interpretation is correct.');sourceLinks(footer,b.sources);container.append(footer);
}
export function mountIntelligencePage(){document.title='Gongola Market Intelligence — Session Briefings';document.body.classList.add('gongola-intelligence-active');const app=document.getElementById('app');
app.innerHTML=`<div class="gmi-page"><header class="gmi-top"><a class="gmi-brand" href="${homeUrl}"><span class="gmi-mark">G.</span><span>GONGOLA <small>MARKET INTELLIGENCE</small></span></a><nav><a href="${terminalUrl}">TERMINAL ↗</a><a href="${homeUrl}">HOME</a></nav></header><main class="gmi-main"><div class="gmi-hero"><div><span class="gmi-eyebrow">THE MACRO DESK / V1.6</span><h1>Know the drivers.<br><em>Respect the price.</em></h1><p>London and New York pre-session intelligence. Fresh macro evidence, cross-market context, and scenarios—not automatic trade orders.</p></div><div class="gmi-time"><span>NEW YORK REFERENCE</span><strong id="gmi-clock">—</strong><small>All release and review times use America/New_York</small></div></div><div class="gmi-strip"><div><span>COVERAGE</span><strong>05 MARKETS</strong></div><div><span>SESSION WINDOWS</span><strong>PRE-LONDON / PRE-NY</strong></div><div><span>TRADING STATUS</span><strong>RESEARCH ONLY</strong></div></div><div class="gmi-controls"><div class="gmi-tabs" role="group" aria-label="Briefing session"><button type="button" data-session="london" class="active" aria-pressed="true">London session</button><button type="button" data-session="newyork" aria-pressed="false">New York session</button></div><button type="button" id="gmi-refresh">↻ Refresh published briefing</button></div><p class="gmi-load-status" id="gmi-load-status" aria-live="polite">Loading latest published research…</p><div id="gmi-report"></div><footer class="gmi-foot">GONGOLA TECH LAB · MACRO BIAS DOES NOT OVERRIDE ICT STRUCTURE · NO BROKER EXECUTION</footer></main></div>`;
let session='london', serial=0;const status=app.querySelector('#gmi-load-status'),report=app.querySelector('#gmi-report');
const renderTime=()=>{app.querySelector('#gmi-clock').textContent=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date())};renderTime();
const load=async()=>{const id=++serial;status.textContent='Checking published '+(session==='london'?'London':'New York')+' research…';viewForSession(report,null,session);
try{const url=`/api/macro?session=${encodeURIComponent(session)}&t=${Date.now()}`;const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});const data=await response.json();if(id!==serial)return;
if(response.ok&&data?.brief){status.textContent='Published research retrieved. Review sources, expiry and scenario invalidation.';viewForSession(report,data,session);}
else{status.textContent=data?.message||'No briefing has been published yet.';viewForSession(report,null,session);}}
catch{if(id!==serial)return;status.textContent='Research feed unavailable. No bias is being shown.';viewForSession(report,null,session);}};
app.querySelectorAll('[data-session]').forEach(b=>b.addEventListener('click',()=>{session=b.dataset.session;app.querySelectorAll('[data-session]').forEach(n=>{const on=n===b;n.classList.toggle('active',on);n.setAttribute('aria-pressed',String(on));});load();}));
app.querySelector('#gmi-refresh').addEventListener('click',load);load();}
