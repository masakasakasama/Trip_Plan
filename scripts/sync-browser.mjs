import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(resolve(root,'visto-astra/package.json'))('@playwright/test');
let data={schemaVersion:2,activeTripId:'fixture',trips:[{id:'fixture',title:'Base fixture',destination:'Fixture',startDate:'2026-10-02',endDate:'2026-10-03',travelers:['A','B'],days:[],todos:[],pois:[],budgetItems:[]}]};
let sha='fixture-1', writes=0, allowWrites=false, conflicts=0;
const clone=value=>JSON.parse(JSON.stringify(value));
const workerScope={exports:{},Response,Request,TextEncoder,TextDecoder,URL,atob,btoa,fetch:async (url,init={})=>{
  assert.equal(new URL(url).hostname,'api.github.com');
  assert.match(new URL(url).pathname,/fixture-owner\/fixture-repo\/contents\//);
  if(init.method==='PUT') {
    if(!allowWrites)return new Response('{}',{status:503});
    const body=JSON.parse(init.body);
    assert.equal(body.sha,sha);
    data=JSON.parse(Buffer.from(body.content,'base64').toString());sha=`fixture-${++writes+1}`;
    return Response.json({content:{sha}});
  }
  return Response.json({sha,content:Buffer.from(JSON.stringify(data)).toString('base64')});
}};
vm.runInNewContext((await readFile(resolve(root,'worker.js'),'utf8')).replace('export default','exports.worker ='),workerScope);
const env={GITHUB_TOKEN:'fixture-only',GITHUB_OWNER:'fixture-owner',GITHUB_REPO:'fixture-repo',ALLOWED_ORIGIN:'http://127.0.0.1'};
const server=createServer(async(req,res)=>{
  try {
    const origin=`http://127.0.0.1:${server.address().port}`;
    const path=new URL(req.url,origin).pathname;
    if(path==='/state') {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(req.method==='PUT'?{body:Buffer.concat(chunks)}:{})});
      const response=await workerScope.exports.worker.fetch(request,env);
      if(response.status===409)conflicts++;
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(path==='/sync-config.js'){res.setHeader('Content-Type','text/javascript');res.end(`window.TRIP_SYNC_WORKER_URL=${JSON.stringify(origin)};`);return;}
    if(path==='/trip-plan.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;}
    const filename=path==='/'?'index.html':path.slice(1);
    const allowed=new Set(['index.html','styles.css','app.js','sync-merge.js','budget-jpy.js','weather-live.js']);
    if(!allowed.has(filename)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html');
    res.end(await readFile(resolve(root,filename)));
  }catch(error){res.writeHead(500);res.end(String(error));}
});
const profile=await mkdtemp(resolve(tmpdir(),'trip-sync-fixture-'));
let context;const errors=[];let blockedExternal=0;
async function open(origin){
  context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,viewport:{width:412,height:915}});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();blockedExternal++;return route.fulfill({status:200,contentType:'application/json',body:'{}'});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin);await page.waitForFunction(()=>typeof state!=='undefined'&&state?.trips?.length);
  return page;
}
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let page=await open(origin); // Verify immediately after starting the fixture server.
  const initial=clone(data);
  const noHeader=await fetch(origin+'/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(initial)});
  assert.equal(noHeader.status,428);
  const stale=await fetch(origin+'/state',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'old-fixture'},body:JSON.stringify(initial)});
  assert.equal(stale.status,409);assert.equal(writes,0);
  await page.evaluate(()=>commitChange(()=>{currentTrip().title='Local offline fixture';}));
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('trip-plan-pending-v1'))?.state.trips[0].title==='Local offline fixture');
  await context.close();context=null;
  // A different device edits the same field while this browser is stopped.
  data.trips[0].title='Remote concurrent fixture';sha='fixture-remote';
  page=await open(origin);
  assert.equal(await page.evaluate(()=>currentTrip().title),'Local offline fixture');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('trip-plan-recovery-v1'))?.length>0);
  const recovery=await page.evaluate(()=>JSON.parse(localStorage.getItem('trip-plan-recovery-v1')));
  assert.equal(recovery[0].remote.trips[0].title,'Remote concurrent fixture');
  assert.equal(recovery[0].local.trips[0].title,'Local offline fixture');
  assert.ok(recovery[0].conflicts.length>0);assert.ok(conflicts>=2);
  allowWrites=true;
  await page.evaluate(()=>saveRemote());
  await page.waitForFunction(()=>!dirty&&!saving&&localStorage.getItem('trip-plan-pending-v1')===null);
  assert.equal(data.trips[0].title,'Local offline fixture');assert.equal(writes,1);
  await context.close();context=null;page=await open(origin);
  assert.equal(await page.evaluate(()=>currentTrip().title),'Local offline fixture');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('trip-plan-recovery-v1'))),recovery);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:['428 missing If-Match','409 stale SHA','offline pending process restart','same-field conflict recovery','retry ACK clears pending','recovery process restart'],fixtureWrites:writes,productionRequests:0,blockedExternal,jsErrors:errors}));
}finally{await context?.close();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true});}
