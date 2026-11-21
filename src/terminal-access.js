/* Gongola Terminal access: free guest workspaces and optional shared Supabase email authentication.
   Guest use makes no auth requests beyond checking an existing session; no telemetry or trading records are uploaded.
   A signed-in account stores only its identity-provider email and chart preferences in Supabase Auth user_metadata.
   Scope the ONE existing settings key by login ID; all other localStorage keys are untouched. */
const AUTH_URL = 'https://usayycqwgdyklfzrinvc.supabase.co';
const ANON_PUBLIC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzYXl5Y3F3Z2R5a2xmenJpbnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MTg5NjYsImV4cCI6MjEwOTE5NDk2Nn0.jgEo3bvyKK_ak1yMRILX-32tCrg8BKSlzDvu-ccDq3w';
const SETTINGS_KEY = 'gongola-terminal-ict-settings-v1';
const MEMBER_META_KEY = 'gongolaTerminalSettingsV1';
const GUEST_FLAG = 'gongola-terminal-guest-workspace-v1';
const QUOTES = [
  ['Protect the process', 'A well-executed no-trade day is better than an emotional entry.'],
  ['Let price reveal itself', 'Wait for displacement, structure and your defined entry model.'],
  ['Think in probabilities', 'A loss taken according to plan is not a failure of discipline.'],
  ['Consistency compounds', 'Review your execution before you measure your profit.'],
  ['Respect liquidity', 'Understand the draw on liquidity, but never manufacture certainty.']
];
const make=(tag,className,text)=>{
  const n=document.createElement(tag);
  if(className)n.className=className;
  if(text!==undefined)n.textContent=text;
  return n;
};
const safeRead=(key)=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
let authClient=null;
let activeIdentity=null;
let saveTimer=null;
let welcome=null;
let quoteIndex=0;

function storageKey(profile){
  return profile?.kind==='member' ? SETTINGS_KEY+':'+profile.id : SETTINGS_KEY;
}

/* A narrow compatibility adapter for the existing self-contained chart module.
   This rewrites one known settings key only, not Supabase storage or app data. */
function installScopedSettingsStorage(profile){
  activeIdentity=profile;
  if(Storage.prototype.__gongolaScopedSettingsV1)return;
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
  const toScoped=function(key){
    return this===window.localStorage && key===SETTINGS_KEY
      ? storageKey(activeIdentity) : key;
  };
  Storage.prototype.getItem=function(key){return get.call(this,toScoped.call(this,key));};
  Storage.prototype.setItem=function(key,value){
    const scoped=toScoped.call(this,key);
    const result=set.call(this,scoped,value);
    if(this===window.localStorage && key===SETTINGS_KEY && activeIdentity?.kind==='member'){
      try{enqueueCloudSync(JSON.parse(value));}catch{/* Storage still succeeded. */}
    }
    return result;
  };
  Storage.prototype.removeItem=function(key){return remove.call(this,toScoped.call(this,key));};
  Object.defineProperty(Storage.prototype,'__gongolaScopedSettingsV1',{value:true});
}

function enqueueCloudSync(settings){
  if(!authClient||!activeIdentity||activeIdentity.kind!=='member')return;
  if(!settings||settings.version!==1||!Number.isFinite(settings.savedAt))return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    try{
      const {error}=await authClient.auth.updateUser({data:{[MEMBER_META_KEY]:settings}});
      if(error)throw error;
      announceAccount('Settings synced securely to your account.');
    }catch{announceAccount('Saved on this device. Cloud sync is unavailable right now.');}
  },950);
}

async function hydrateCloudPreferences(user){
  if(!authClient||!user?.id)return;
  try{
    const {data,error}=await authClient.auth.getUser();
    if(error)throw error;
    const remote=data?.user?.user_metadata?.[MEMBER_META_KEY];
    if(!remote||remote.version!==1||!Number.isFinite(remote.savedAt))return;
    const key=storageKey({kind:'member',id:user.id});
    const local=safeRead(key);
    if(!local || !Number.isFinite(local.savedAt) || remote.savedAt>local.savedAt){
      // Per-user writes bypass the legacy-key adapter deliberately.
      localStorage.setItem(key,JSON.stringify(remote));
    }
  }catch{/* Auth provider may be offline; use the member's local settings. */}
}

function announceAccount(message){
  const status=document.getElementById('gongola-access-status');
  if(status)status.textContent=message;
}

function mountAccountControl(profile){
  const btn=make('button','gongola-account-button',profile.kind==='member'?'Account':'Guest');
  btn.type='button';
  btn.title=profile.kind==='member'?'Account settings and sign out':'Sign in to sync chart preferences';
  btn.setAttribute('aria-label',btn.title);
  const status=make('div','gongola-access-status','');
  status.id='gongola-access-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const pop=make('div','gongola-account-popover');
  pop.hidden=true;
  const label=make('strong','',profile.kind==='member'?'Your private workspace':'Guest workspace');
  const note=make('p','',profile.kind==='member'
    ? 'Only chart preferences are synced with Supabase Auth. No trades, screenshots or market data are uploaded.'
    : 'Your settings stay in this browser. Sign in for per-account preference sync.');
  const action=make('button','gongola-access-switch',profile.kind==='member'?'Sign out':'Sign in or switch');
  action.type='button';
  action.addEventListener('click',async()=>{
    action.disabled=true;
    if(profile.kind==='member' && authClient){
      try{await authClient.auth.signOut();}catch{/* Disconnect locally and reload. */}
    }
    try{localStorage.removeItem(GUEST_FLAG);}catch{}
    window.location.replace(window.location.pathname);
  });
  const coffee=make('button','gongola-account-coffee','☕ Support the free Terminal');
  coffee.type='button';
  coffee.addEventListener('click',()=>{
    const link=(import.meta.env.VITE_GONGOLA_SUPPORT_URL||'').trim();
    if(/^https:\/\/[^/]+/i.test(link))window.open(link,'_blank','noopener,noreferrer');
    else status.textContent='Official coffee support link will be available soon.';
  });
  pop.append(label,note,status,action,coffee);
  const box=make('div','gongola-account-wrap');
  box.append(btn,pop);
  btn.addEventListener('click',()=>{pop.hidden=!pop.hidden;btn.setAttribute('aria-expanded',String(!pop.hidden));});
  document.addEventListener('pointerdown',e=>{if(!box.contains(e.target))pop.hidden=true;});
  document.querySelector('.topbar')?.append(box);
}

function buildWelcome(){
  welcome=make('div','gongola-access-overlay');
  welcome.id='gongola-access-overlay';
  welcome.setAttribute('role','dialog');
  welcome.setAttribute('aria-modal','true');
  welcome.setAttribute('aria-label','Welcome to Gongola Terminal');
  const card=make('div','gongola-welcome-card');
  const brand=make('div','gongola-welcome-brand');
  brand.append(make('span','gongola-welcome-logo','G'),make('span','','GONGOLA / TERMINAL'));
  const badge=make('span','gongola-free-badge','FREE BETA · NO SUBSCRIPTION');
  const heading=make('h1','','A disciplined trader’s workspace.');
  const sub=make('p','gongola-welcome-intro','Institutional clarity. ICT-inspired research. An open workspace built around process, not promises.');
  const panel=make('section','gongola-principle');
  const hint=make('div','gongola-principle-heading');
  hint.append(make('span','','THE GONGOLA PRINCIPLE'),make('span','','01 / 05'));
  const principle=make('strong','',QUOTES[0][0]);
  const thought=make('p','',QUOTES[0][1]);
  const next=make('button','gongola-next-principle','Next principle ›');
  next.type='button';
  next.addEventListener('click',()=>{
    quoteIndex=(quoteIndex+1)%QUOTES.length;
    principle.textContent=QUOTES[quoteIndex][0];
    thought.textContent=QUOTES[quoteIndex][1];
    hint.lastElementChild.textContent=String(quoteIndex+1).padStart(2,'0')+' / 05';
  });
  panel.append(hint,principle,thought,next);
  const actions=make('div','gongola-welcome-actions');
  const guest=make('button','gongola-guest-button','Continue as Guest');
  guest.type='button';
  const email=make('button','gongola-email-button','Sign in with email');
  email.type='button';
  actions.append(guest,email);
  const form=make('form','gongola-email-form');
  form.hidden=true;
  const input=make('input','');
  input.type='email';input.required=true;input.autocomplete='email';input.maxLength=254;
  input.placeholder='you@example.com';input.setAttribute('aria-label','Email address for magic link');
  const send=make('button','','Send magic link');
  send.type='submit';
  const feedback=make('p','gongola-email-feedback','');
  feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  form.append(input,send,feedback);
  const privacy=make('p','gongola-welcome-privacy','Guest mode requires no email. Email sign-in uses Supabase Auth and stores your email plus your chart preferences only. No journal, chart screenshots or trading history is collected.');
  const coffee=make('div','gongola-coffee-note');
  coffee.append(make('span','','☕'),make('p','','Gongola Terminal is free. If it helps your journey, you may support the work with a coffee—entirely optional.'));
  const support=make('button','gongola-support-button','Buy us a coffee');
  support.type='button';
  const supportUrl=(import.meta.env.VITE_GONGOLA_SUPPORT_URL||'').trim();
  support.addEventListener('click',()=>{
    if(/^https:\/\/[^/]+/i.test(supportUrl))window.open(supportUrl,'_blank','noopener,noreferrer');
    else supportFeedback.textContent='Our official support link is coming soon. The Terminal stays free.';
  });
  coffee.append(support);
  const supportFeedback=make('p','gongola-support-feedback','');
  supportFeedback.setAttribute('role','status');
  supportFeedback.setAttribute('aria-live','polite');
  coffee.append(supportFeedback);
  card.append(brand,badge,heading,sub,panel,actions,form,privacy,coffee);
  welcome.append(card);
  document.body.append(welcome);
  email.addEventListener('click',()=>{
    form.hidden=!form.hidden;
    if(!form.hidden)input.focus();
  });
  return {guest,form,input,send,feedback};
}

export async function initializeTerminalAccess(){
  if(!document.getElementById('app'))return;
  // Best effort: the Terminal stays available as guest if the CDN or identity server fails.
  if(window.supabase && typeof window.supabase.createClient==='function'){
    try{
      authClient=window.supabase.createClient(AUTH_URL,ANON_PUBLIC_KEY,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      });
    }catch{authClient=null;}
  }
  let signedIn=null;
  if(authClient){
    try{const {data}=await authClient.auth.getSession();signedIn=data?.session?.user||null;}catch{}
  }
  if(signedIn){
    const profile={kind:'member',id:signedIn.id};
    await hydrateCloudPreferences(signedIn);
    installScopedSettingsStorage(profile);
    mountAccountControl(profile);
  }else{
    let guestPreviously=false;
    try{guestPreviously=localStorage.getItem(GUEST_FLAG)==='yes';}catch{}
    if(!guestPreviously){
      const elements=buildWelcome();
      await new Promise(resolve=>{
        elements.guest.addEventListener('click',()=>{
          try{localStorage.setItem(GUEST_FLAG,'yes');}catch{}
          welcome.remove();welcome=null;resolve();
        });
        elements.form.addEventListener('submit',async e=>{
          e.preventDefault();
          if(!authClient){
            elements.feedback.textContent='Email sign-in is unavailable. Continue as Guest.';
            return;
          }
          const address=elements.input.value.trim();
          if(!address)return;
          elements.send.disabled=true;elements.feedback.textContent='Sending secure login link…';
          try{
            const {error}=await authClient.auth.signInWithOtp({
              email:address,options:{emailRedirectTo:window.location.origin+'/terminal'}
            });
            if(error)throw error;
            elements.feedback.textContent='Check your inbox for your sign-in link. Open it on this device, or continue as a guest.';
          }catch(error){elements.feedback.textContent='Could not send link: '+(error.message||'Authentication unavailable');}
          finally{elements.send.disabled=false;}
        });
      });
    }
    const profile={kind:'guest',id:'guest'};
    installScopedSettingsStorage(profile);
    mountAccountControl(profile);
  }
  // The identity provider may complete magic-link auth after the chart is mounted.
  // Reload to bind a new identity before reading any personal settings.
  if(authClient){
    authClient.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_IN' && session?.user && activeIdentity?.id!==session.user.id){
        window.location.replace(window.location.pathname);
      }
    });
  }
}
