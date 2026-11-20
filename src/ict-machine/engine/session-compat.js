/** Historical subset of Pine time('', session): bar-open session membership.
 * Timezone must be the symbol's exchange timezone, NOT automatically New York.
 * Does not emulate Pine's synthetic session bars for non-aligned chart periods.
 */
const formatterCache=new Map();
function parts(ms,tz){
 let f=formatterCache.get(tz);
 if(!f){f=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'});formatterCache.set(tz,f)}
 const p=Object.fromEntries(f.formatToParts(new Date(ms)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return {minute:Number(p.hour)*60+Number(p.minute),day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday)+1};
}
export function sessionContains(timestamp,session,timezone){
 if(!timezone)throw new Error('Symbol exchange timezone required');
 const m=/^(\d{2})(\d{2})-(\d{2})(\d{2})(?::([1-7]+))?$/.exec(session);
 if(!m)throw new Error('Unsupported Pine session: '+session);
 const start=Number(m[1])*60+Number(m[2]),end=Number(m[3])*60+Number(m[4]);
 if(start>1440||end>1440||Number(m[2])>59||Number(m[4])>59)throw new Error('Invalid session time');
 const {minute,day}=parts(timestamp,timezone),days=m[5]||'1234567';
 if(start===end)return days.includes(String(day));
 if(start<end)return days.includes(String(day))&&minute>=start&&minute<end;
 // Overnight session: evening belongs to start date, early hours to previous date.
 const prev=day===1?7:day-1;
 return minute>=start?days.includes(String(day)):minute<end&&days.includes(String(prev));
}
export function makeFVGSessionEligibility({exchangeTimezone,useAsia=false,useLondon=true,useNY=true,asia='2000-0000',london='0300-0500',ny='0900-1030',fvgSessionFilter=false}={}){
 if(!exchangeTimezone)throw new Error('exchangeTimezone required: Pine time() defaults to symbol exchange timezone');
 const active=[[useAsia,asia],[useLondon,london],[useNY,ny]].filter(([enabled])=>enabled).map(([,session])=>session);
 return (i,bars)=>{
  if(!active.length)return !fvgSessionFilter;
  const offsets=fvgSessionFilter?[0,1,2]:[0];
  return offsets.some(offset=>i-offset>=0&&active.some(session=>sessionContains(bars[i-offset].time,session,exchangeTimezone)));
 };
}
/** isWithinTimeWindow source: with signal filter disabled or chart TF > 15, always true.
 * Enabled branch needs source's currentSessionStartTime from session state engine.
 */
export function makeFVGTimeEligibility({enableSignalFilter=false,chartTfMinutes=15,currentSessionStartTimeAt}={}){
 if(!enableSignalFilter||chartTfMinutes>15)return ()=>true;
 if(typeof currentSessionStartTimeAt!=='function')throw new Error('currentSessionStartTimeAt required when signal filter enabled');
 return (formationTime,i,bars)=>{
  const {minute}=parts(formationTime,'America/New_York');
  if(Math.floor(minute/60)===5||(minute>=16*60&&minute<20*60))return false;
  const start=currentSessionStartTimeAt(i,bars);
  if(!Number.isFinite(start))return false;
  // Preserve V0.99 literal 7200000 despite its misleading '1 hour' comment.
  return formationTime>=start-7200000;
 };
}
