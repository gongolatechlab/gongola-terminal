/** Gongola Market Intelligence — private published research, not a trading API.
 * GET  /api/macro?session=london|newyork           public, read-only
 * POST /api/macro?session=london|newyork           admin bearer token only
 * Requires a Vercel private Blob store, GROQ_API_KEY and GONGOLA_MACRO_ADMIN_TOKEN.
 */
import {get, put} from '@vercel/blob';
import {timingSafeEqual} from 'node:crypto';
import {buildResearchBrief,validatePublishedBrief} from './macro-research.mjs';
const sessions=new Set(['london','newyork']);
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'}});
const pathname=s=>`gongola/intelligence/${s}-latest.json`;
const sessionFrom=req=>{const s=new URL(req.url).searchParams.get('session');return sessions.has(s)?s:null;};
const blobAvailable=()=>!!process.env.BLOB_READ_WRITE_TOKEN;
function authorized(req){const configured=process.env.GONGOLA_MACRO_ADMIN_TOKEN||'';
const supplied=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
if(configured.length<24||!supplied)return false;
const a=Buffer.from(configured),b=Buffer.from(supplied);
return a.length===b.length&&timingSafeEqual(a,b);}
async function readBrief(session){const result=await get(pathname(session),{access:'private',useCache:false});
if(!result?.stream)return null;
const payload=JSON.parse(await new Response(result.stream).text());
if(!validatePublishedBrief(payload,session))return null;return payload;}
export async function GET(request){const session=sessionFrom(request);if(!session)return json({status:'invalid_session',message:'Use session=london or session=newyork.'},400);
if(!blobAvailable())return json({status:'not_configured',message:'The research store is not configured. No macro briefing can be shown.'},503);
try{const b=await readBrief(session);if(!b)return json({status:'not_published',message:'No source-linked briefing has been published for this session.'},404);
return json({status:'ok',brief:b});}
catch(err){console.error('Macro read failed:',err?.message);return json({status:'unavailable',message:'Published macro research is temporarily unavailable.'},503);}}
export async function POST(request){const session=sessionFrom(request);if(!session)return json({status:'invalid_session',message:'Select london or newyork.'},400);
if(!authorized(request))return json({status:'unauthorized',message:'Admin authentication required.'},401);
if(!blobAvailable()||!process.env.GROQ_API_KEY)return json({status:'not_configured',message:'Server-side research provider or private store is not configured.'},503);
try{const report=await buildResearchBrief(session);
await put(pathname(session),JSON.stringify(report),{access:'private',allowOverwrite:true,contentType:'application/json'});
return json({status:'published',session,publishedAt:report.publishedAt,expiresAt:report.expiresAt,sourceCount:report.sources.length});}
catch(err){if(err?.message==='Pre-market research only runs weekdays'||err?.message==='Requested pre-session window is over in New York')return json({status:'outside_research_window',message:err.message},409);console.error('Macro research publish failed:',err?.message);return json({status:'research_failed',message:'Fresh source-backed research could not be validated or published. Existing briefing was left unchanged.'},502);}}
