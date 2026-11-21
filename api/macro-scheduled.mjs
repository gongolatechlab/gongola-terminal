/** Gongola private schedules. No API keys, credentials or manual POSTs in this route.
 * Jobs are created by vercel.json and run ONLY after explicit server-side opt-in.
 */
import {handleSchedule} from '@vercel/schedules';
import {get,put} from '@vercel/blob';
import {buildResearchBrief,validatePublishedBrief} from './macro-research.mjs';
const enabled=()=>process.env.GONGOLA_MACRO_AUTO_ENABLED==='true';
const names=new Map([['gongola-london','london'],['gongola-newyork','newyork']]);
const nyDate=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const location=s=>`gongola/intelligence/${s}-latest.json`;
export function classifySchedule(name){return names.get(name)||null;}
export async function runScheduledResearch(metadata,{now=new Date(),read=get,write=put,research=buildResearchBrief}={}){
  const session=classifySchedule(metadata?.name);
  if(!session)throw new Error('Unrecognized Gongola research schedule');
  if(!enabled())return {status:'disabled',session};
  const wd=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short'}).format(now);
  if(wd==='Sat'||wd==='Sun')return {status:'outside_research_window',session};
  if(!process.env.BLOB_READ_WRITE_TOKEN||!process.env.GROQ_API_KEY)
    throw new Error('Research provider or storage not configured');
  // Guard against duplicate publish retries on the same New York calendar day.
  const existing=await read(location(session),{access:'private',useCache:false});
  if(existing?.stream){
    const old=JSON.parse(await new Response(existing.stream).text());
    if(validatePublishedBrief(old,session)&&nyDate(new Date(old.publishedAt))===nyDate(now))
      return {status:'already_published',session};
  }
  const brief=await research(session,{now});
  if(!validatePublishedBrief(brief,session))throw new Error('Refusing to publish unverified research format');
  await write(location(session),JSON.stringify(brief),{access:'private',allowOverwrite:true,contentType:'application/json'});
  return {status:'published',session,sourceCount:brief.sources.length};
}
export const POST=handleSchedule(async metadata=>{
  const result=await runScheduledResearch(metadata);
  console.info('Gongola scheduled research:',JSON.stringify(result));
});
