import {organizeAdmission34,dischargeFields34,readDischargeDestination34,previewDischarge34,destinationLabel34} from './clinical-ui34.js';
import {mergeBoard30,pause30,retryDelay30,admissionSignature30} from './concurrency30.js';
import {englishDigits26,onCallReport26} from './workflow26.js';
import {employeeLogin25} from './employee-login.js';
import {createBackupWriter,verifyBackup} from './backup-tools.js';
let saveTimer18,conflictBlocked20=false;let staffingPolicy24={maxPatientsPerRN:null},formDraft24=false,lastSavedAt24=null;
let boardExtras30={};
let config,session,member,boardRevision=0,serverFingerprint='',pending=false,saveBlocked=false;
let configurationRequest25=null;
async function loadConfiguration25(){
 if(config)return config;
 if(!configurationRequest25)configurationRequest25=(async()=>{
  const response=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  const data=await readJSON20(response,'Configuration');
  if(!response.ok)throw Error(data?.error||'Configuration unavailable. Retry connection.');
  if(!data||typeof data.url!=='string'||typeof data.publishableKey!=='string'||!data.publishableKey||typeof data.unitId!=='string'||!/^[0-9a-f-]{36}$/i.test(data.unitId))throw Error('Application configuration is incomplete. Check SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and ICU_UNIT_ID in Vercel.');
  let address;try{address=new URL(data.url)}catch{throw Error('SUPABASE_URL is invalid. Check Vercel configuration.');}
  if(address.protocol!=='https:')throw Error('SUPABASE_URL must use HTTPS.');
  config={...data,url:data.url.replace(/\/$/,'')};return config;
 })().finally(()=>{configurationRequest25=null});
 return configurationRequest25;
}
const gate=document.createElement('div');gate.className='production-gate';gate.innerHTML='<div class="production-login"><img class="cluster-logo" src="/taif-logo.jpg" alt="Taif Health Cluster"><h1>ICU KAASH</h1><p>Secure pilot · Patient & Census Management</p><div id="login-content">Loading configuration…</div></div>';document.body.append(gate);
const cloudStatus=document.createElement('div');cloudStatus.className='demo-banner';cloudStatus.setAttribute('role','status');
const authHeaders=()=>({apikey:config.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'});
function clone(value){return JSON.parse(JSON.stringify(value))}
function captureBoard(){return clone({...boardExtras30,patients:patients.filter(p=>p.name&&p.mrn),archivedRecords:archivedRecords3,staffingPolicy:staffingPolicy24,staffDirectory:{rn:staff,pct:pctNames},shiftRNs,shiftPCTs,shiftAcuity,shiftSide,shiftAttendance,shiftDuties3,scheduleByDate4,scheduleDate:scheduleDate3,linen,linenByDate:linenByDate3,kardexDrafts,counts,note})}
function installBoard(data){boardExtras30=clone(data);staffingPolicy24=data.staffingPolicy||{maxPatientsPerRN:null};if(data.staffDirectory){staff.splice(0,staff.length,...(data.staffDirectory.rn||[]));pctNames.splice(0,pctNames.length,...(data.staffDirectory.pct||[]))}else{const names=map=>[...new Set(Object.values(map||{}).flatMap(shift=>Object.values(shift||{})).filter(Boolean))];staff.splice(0,staff.length,...names(data.shiftRNs));pctNames.splice(0,pctNames.length,...names(data.shiftPCTs))}patients.splice(0,patients.length,...(data.patients||[]));patients.forEach(ensureAdmission8);archivedRecords3=data.archivedRecords||[];const empty=()=>({Day:{},Evening:{},Night:{}});shiftRNs=data.shiftRNs||empty();shiftPCTs=data.shiftPCTs||empty();shiftAcuity=data.shiftAcuity||empty();shiftSide=data.shiftSide||empty();shiftAttendance=data.shiftAttendance||empty();shiftDuties3=data.shiftDuties3||empty();scheduleByDate4=data.scheduleByDate4||{};if(data.scheduleDate)scheduleDate3=data.scheduleDate;linen=data.linen||{date:scheduleDate3,Day:{gowns:0,blankets:0,sheets:0},Evening:{gowns:0,blankets:0,sheets:0},Night:{gowns:0,blankets:0,sheets:0}};linenByDate3=data.linenByDate||{};kardexDrafts=data.kardexDrafts||{};counts=data.counts||Object.fromEntries(Object.keys(counts).map(key=>[key,0]));note=data.note||''}
function status(message){cloudStatus.textContent=message}
const canEdit=()=>['admin','doctor','charge_nurse'].includes(member?.role);
async function sync(){
 clearTimeout(saveTimer18);saveTimer18=null;if(pending||saveBlocked)return;if(!canEdit()){status('Read-only role.');return;}pending=true;
 try{
  let retries=0,next=captureBoard(),fingerprint=JSON.stringify(next);
  while(fingerprint!==serverFingerprint){
   status('Saving to Supabase…');
   const result=await rest('kaash_boards?unit_id=eq.'+encodeURIComponent(config.unitId)+'&revision=eq.'+boardRevision,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data:next,revision:boardRevision+1})});
   if(!Array.isArray(result))throw Error('Invalid save response. No successful save has been confirmed.');
   if(!result.length){
    if(formDraft24||(document.querySelector('#shade.show')&&patientView21==='advanced')){conflictBlocked20=true;throw Error('Another user changed the board while a patient editor is open. Your draft is preserved. Export it and reload to review the current record.');}
    if(retries++>=6)throw Error('Board is busy. Your changes remain unsaved. Retry save after a short pause.');
    await pause30(retryDelay30(retries));const rows=await rest('kaash_boards?unit_id=eq.'+encodeURIComponent(config.unitId)+'&select=data,revision');if(!rows?.[0]?.data)throw Error('Latest board unavailable.');
    const base=JSON.parse(serverFingerprint),remote={...clone(base),...rows[0].data},merged=mergeBoard30(base,captureBoard(),remote);
    if(merged.conflicts.length){conflictBlocked20=true;throw Error('Another user changed the same field ('+merged.conflicts.slice(0,2).join(', ')+'). Your draft is preserved. Export it and reload to review the changes.');}
    if(formDraft24)throw Error('An admission draft is being edited. Save or export it before retrying.');
    const selectedId=selected?.admissionId;installBoard(merged.data);if(selectedId){selected=patients.find(patient=>patient.admissionId===selectedId)||null;if(!selected)document.getElementById('shade')?.classList.remove('show');}
    boardRevision=rows[0].revision;serverFingerprint=JSON.stringify(remote);next=captureBoard();fingerprint=JSON.stringify(next);render();
    if(document.querySelector('#shade.show')&&selected&&patientView21==='summary')detail();
    status('Merged independent updates. Saving your changes…');continue;
   }
   boardRevision=result[0].revision;reconcileCompletion24(next,result[0].data);fingerprint=JSON.stringify(next);
   if(Array.isArray(result[0].data?.archivedRecords)&&result[0].data.archivedRecords.length===0){const savedArchives=new Set(next.archivedRecords.map(record=>JSON.stringify(record)));archivedRecords3=archivedRecords3.filter(record=>!savedArchives.has(JSON.stringify(record)));next.archivedRecords=[];fingerprint=JSON.stringify(next);}
   serverFingerprint=fingerprint;next=captureBoard();fingerprint=JSON.stringify(next);retries=0;
  }
  status('Saved to Supabase · '+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'}).format(new Date())+' · revision '+boardRevision);
 }catch(error){saveBlocked=true;status(error.message+' Keep this page open.');document.body.classList.add('save-blocked');}finally{pending=false;}
}
function queueSave(){if(session&&Date.now()>=sessionDeadline20){expireSession20();return}if(saveBlocked){status('Saving is blocked. Retry save or reload after exporting your draft.');return}if(!session){status('Sign in required.');return}if(!canEdit()){status('Read-only access.');return}if(admissionSignature30({patients})!==admissionSignature30(JSON.parse(serverFingerprint||'{}'))||archivedRecords3.length)admissionReportCache22=null;stampTasks24();scheduleByDate4[scheduleDate3]=staffingSnapshot4();linenByDate3[linen.date]=clone(linen);clearTimeout(saveTimer18);status('Changes pending…');saveTimer18=setTimeout(()=>void sync(),200)}
function installCloudPersistence(){savePreview3=queueSave;persist8=()=>{if(!canEdit()||saveBlocked)return false;queueSave();return true};kPersist=()=>{if(!canEdit()||saveBlocked)return false;queueSave();return true};}
function installToolbar(){document.querySelectorAll('.production-toolbar').forEach(el=>el.remove());const bar=document.createElement('div');bar.className='production-toolbar';bar.innerHTML='<button id="retry-save20">Retry save</button><button id="cloud-reload">Reload latest board</button><button id="export-draft">Export unsaved draft</button><button id="sign-out">Sign out</button>';document.querySelector('.top').after(bar);document.getElementById('retry-save20').hidden=!canEdit();document.getElementById('retry-save20').onclick=()=>{if(conflictBlocked20){status('Revision conflict. Export your draft, then reload the current board.');return}saveBlocked=false;document.body.classList.remove('save-blocked');void sync()};document.getElementById('cloud-reload').onclick=()=>{if(canEdit()&&dirty20()){if(!confirm('Reloading discards unsaved changes. Export the draft first if needed. Reload now?'))return}location.reload()};document.getElementById('export-draft').onclick=()=>{const blob=new Blob([JSON.stringify(captureBoard(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ICU_KAASH_unsaved_draft.json';a.click();URL.revokeObjectURL(url)};document.getElementById('sign-out').onclick=async()=>{if(canEdit()&&dirty20()){if(!confirm('Sign out with unsaved changes? Export your draft first if needed.'))return}try{await fetch(config.url+'/auth/v1/logout',{method:'POST',headers:authHeaders()})}finally{session=null;member=null;clearSession20();clearTimeout(saveTimer18);location.reload()}}}
// Real patient data stay in memory; this runtime never saves them to localStorage.
document.addEventListener('click',e=>{if(!session)return;const button=e.target.closest('#save,#save-unified8,#archive-discharge3');if(button&&selected&&(!selected.name?.trim()||!selected.mrn?.trim())){e.preventDefault();e.stopImmediatePropagation();alert('Patient name and MRN are required.')}if(!canEdit()&&e.target.closest('button,input,select,textarea')&&!e.target.closest('.top,.tabs,.production-toolbar,.production-gate')&&!e.target.closest('.tab')&&!e.target.closest('[data-open],.bed,#close,.switch,#open-unified8,#patient-kardex6,#unified-kardex8,.quick-nav21,#search21,#ward-shift24,#tools-shift24,#back-profile8,[data-workflow-open8],[data-record18],#record-search3,#records-prev18,#records-next18,#search11,[data-result-open11],[data-sched-view3],[data-shift3],[data-cal-open],[data-cal-move],[data-cal-day]')&&page!=='labels'){e.preventDefault();e.stopImmediatePropagation();status('This account has read-only access.')}},true);
window.addEventListener('beforeunload',e=>{if(session&&(formDraft24||dirty20())){e.preventDefault();e.returnValue=''}});
async function queueLabel(){if(!session||!['admin','doctor','charge_nurse'].includes(member.role))throw Error('Print permission is required');const patient=active().find(p=>p.bed===labelDraft.bed);if(!patient?.name||!patient.mrn)throw Error('Choose a patient with name and MRN');const printers=await rest('kaash_printers?unit_id=eq.'+config.unitId+'&enabled=eq.true&select=id,name,model,width_mm,height_mm');if(!printers.length)throw Error('No enabled printer. Configure printer IP, exact label size and 203 dpi first.');const picker=document.getElementById('cloud-printer');if(!picker){throw Error('Select a configured printer from the network print panel.')}const printer=printers.find(p=>p.id===picker.value);if(!printer)throw Error('Choose printer');const id=crypto.randomUUID();await rest('kaash_print_jobs',{method:'POST',body:JSON.stringify({id,unit_id:config.unitId,printer_id:printer.id,payload:{...labelDraft,patientName:patient.name,mrn:patient.mrn}})});return id}
const labelsBeforeCloud=labels5;labels5=function(){labelsBeforeCloud();main.classList.add('cloud-labels');const panel=document.createElement('div');panel.className='section';panel.innerHTML='<h3>Network EPL printing</h3><select id="cloud-printer"><option value="">Loading configured printers…</option></select><button class="btn" id="network-print">Queue EPL label</button><p id="network-print-status" role="status">Uses the hospital print bridge. Sent means delivered to the printer socket, not physical print confirmation.</p>';document.getElementById('label-preview').parentElement.append(panel);void rest('kaash_printers?unit_id=eq.'+config.unitId+'&enabled=eq.true&select=id,name,model,width_mm,height_mm').then(printers=>{const picker=document.getElementById('cloud-printer');if(picker)picker.innerHTML='<option value="">Choose network printer</option>'+printers.map(p=>`<option value="${safe(p.id)}">${safe(p.name)} · ${safe(p.model)} · ${p.width_mm} × ${p.height_mm} mm</option>`).join('')}).catch(e=>{const out=document.getElementById('network-print-status');if(out)out.textContent=e.message});document.getElementById('network-print').onclick=async e=>{e.target.disabled=true;try{const id=await queueLabel();document.getElementById('network-print-status').textContent='Queued · job '+id}catch(error){document.getElementById('network-print-status').textContent=error.message}finally{e.target.disabled=false}}};
const cloudRenderBefore=render;render=function(){if(page!=='records'){recordsAbort30?.abort();recordsRequest18++;}main.classList.toggle('cloud-labels',page==='labels');cloudRenderBefore();installStaffPanel20();updateHeader20();applyReadOnly20()};

// Archives are fetched on demand. Only 50 records are rendered at a time.
let recordsRequest18=0,recordsAbort30=null;
medicalRecords3=function(){
 recordsAbort30?.abort();const request=++recordsRequest18;
 main.innerHTML='<h2 class="title">Medical records</h2><p class="sub">Database archive · 50 records per page</p><input class="search" id="record-search3" placeholder="Search name, MRN, bed or diagnosis"><div id="record-status18" role="status"></div><div id="records-list3"></div><button class="btn secondary" id="records-prev18" disabled>Previous</button> <button class="btn secondary" id="records-next18" disabled>Next</button>';
 let cursor=null,history=[],rows=[],nextCursor=null,timer,version=0;
 const load=async()=>{
  if(page!=='records'||request!==recordsRequest18||!document.getElementById('record-search3'))return;
  recordsAbort30?.abort();recordsAbort30=new AbortController();const activeAbort=recordsAbort30,timeout=setTimeout(()=>activeAbort.abort(new DOMException('Records request timed out. Retry search.','TimeoutError')),12000);const current=++version;
  document.getElementById('records-prev18').disabled=true;document.getElementById('records-next18').disabled=true;
  const query=document.getElementById('record-search3').value.trim();
  const statusEl=document.getElementById('record-status18');statusEl.textContent='Loading records…';
  const params=new URLSearchParams({unit_id:'eq.'+config.unitId,select:'data,archived_at,admission_key',order:'archived_at.desc,admission_key.desc',limit:'51'});
  const conditions=[];
  if(query)params.set('search_document','wfts(simple).'+query);
  if(cursor)conditions.push('or(archived_at.lt.'+cursor.at+',and(archived_at.eq.'+cursor.at+',admission_key.lt."'+cursor.key.replace(/["\\]/g,'')+'"))');
  if(conditions.length)params.set('and','('+conditions.join(',')+')');
  try{
   const result=await rest('kaash_records?'+params,{signal:recordsAbort30.signal});
   if(request!==recordsRequest18||current!==version||page!=='records')return;
   rows=result.slice(0,50);const last=rows.at(-1);nextCursor=result.length>50?{at:last.archived_at,key:last.admission_key}:null;
   document.getElementById('records-list3').innerHTML=rows.map(({data:p},i)=>`<article class="card"><div class="label">${safe(p.bed)} · ${safe(p.status||'Discharged')}</div><h3>${safe(p.name)}</h3><p class="meta">MRN ${safe(p.mrn)} · Admitted ${safe(p.doa||'—')} · Discharged ${safe(p.dischargedAt||'—')}</p>${destinationLabel34(p)?`<p class="destination-preview34">Discharged to: ${safe(destinationLabel34(p))}</p>`:''}<p>${safe(p.diagnosis||'')}</p><button class="btn secondary" data-record18="${i}">Open record</button></article>`).join('')||'<p>No matching records.</p>';
   document.querySelectorAll('[data-record18]').forEach(button=>button.onclick=()=>{
    open(clone(rows[+button.dataset.record18].data));
    const fields=document.getElementById('patient-fields');if(fields){fields.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);fields.insertAdjacentHTML('afterbegin','<p class="sub">Archived record · read only</p>');}
   });
   statusEl.textContent='Page '+(history.length+1)+' · '+rows.length+' records';
   document.getElementById('records-prev18').disabled=!history.length;
   document.getElementById('records-next18').disabled=!nextCursor;
  }catch(error){if(current===version&&request===recordsRequest18&&page==='records')statusEl.textContent=error.message+' Retry the search; install the archive database update if missing.';}finally{clearTimeout(timeout);}
 };
 document.getElementById('record-search3').oninput=()=>{clearTimeout(timer);recordsAbort30?.abort();++version;cursor=null;history=[];timer=setTimeout(load,300)};
 document.getElementById('records-next18').onclick=()=>{if(!nextCursor)return;history.push(cursor);cursor=nextCursor;void load()};
 document.getElementById('records-prev18').onclick=()=>{if(!history.length)return;cursor=history.pop();void load()};
 void load();
};

const SESSION_KEY20='kaash-session-v2',SESSION_DURATION20=60*60*1000;
let sessionDeadline20=0,refreshPromise20=null,sessionTimer20,expiredDraft20=false;
function storeSession20(){try{sessionStorage.setItem(SESSION_KEY20,JSON.stringify({url:config.url,unit:config.unitId,session,deadline:sessionDeadline20}))}catch{status('Session active; browser storage unavailable. Reload will require sign-in.')}}
function clearSession20(){try{sessionStorage.removeItem(SESSION_KEY20)}catch{}clearTimeout(sessionTimer20)}
function dirty20(){if(member&&!canEdit())return false;return pending||saveBlocked||JSON.stringify(captureBoard())!==serverFingerprint}
function exportDraft20(){const url=URL.createObjectURL(new Blob([JSON.stringify(captureBoard(),null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='ICU_KAASH_unsaved_draft.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function expireSession20(message='Your one-hour session has ended. Sign in again.'){
 expiredDraft20=!!member&&dirty20();session=null;clearSession20();clearTimeout(saveTimer18);
 document.body.classList.add('auth-locked');document.querySelectorAll('.shade.show,.assignment-overlay3.show').forEach(el=>el.classList.remove('show'));
 if(!gate.isConnected)document.body.append(gate);loginForm(message);
 if(expiredDraft20){document.getElementById('login-content').insertAdjacentHTML('afterbegin','<p>Unsaved changes remain in memory. Export them before signing in again.</p><button id="locked-export20" type="button">Export unsaved draft</button>');document.getElementById('locked-export20').onclick=exportDraft20;}
}
function armSession20(){clearTimeout(sessionTimer20);sessionTimer20=setTimeout(()=>expireSession20(),Math.max(0,sessionDeadline20-Date.now()))}
async function readJSON20(response,label){const text=await response.text();try{return text?JSON.parse(text):null}catch{throw Error(label+' returned an unexpected page (HTTP '+response.status+'). Check deployment and API configuration.')}}
async function authRequest(path,body){
 await loadConfiguration25();
 const response=await fetch(config.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await readJSON20(response,'Authentication');if(!response.ok)throw Error(data?.msg||data?.error_description||'Authentication failed');if(!data?.access_token||!data?.refresh_token||!Number.isFinite(data.expires_in))throw Error('Authentication returned an incomplete session. Check Supabase authentication settings.');return data;
}
async function refreshSession(){
 if(!session)throw Error('Sign in required');
 if(Date.now()>=sessionDeadline20){expireSession20();throw Error('One-hour session ended. Sign in again.');}
 if(session.expires_at*1000>Date.now()+60000)return;
 if(!refreshPromise20)refreshPromise20=(async()=>{
  const current=session;
  try{const updated=await authRequest('token?grant_type=refresh_token',{refresh_token:current.refresh_token});
   if(session!==current||Date.now()>=sessionDeadline20)throw Error('Session ended during refresh.');
   session=updated;session.expires_at=Math.floor(Date.now()/1000)+session.expires_in;storeSession20();
  }finally{refreshPromise20=null}
 })();
 await refreshPromise20;
}
async function rest(path,options={}){
 const retryable=(options.method||'GET')==='GET'||['rpc/kaash_admission_report','rpc/kaash_care_quality_report','rpc/kaash_backup_manifest'].includes(path);
 for(let attempt=0;attempt<3;attempt++){
  await refreshSession();let response;
  try{response=await fetch(config.url+'/rest/v1/'+path,{...options,cache:'no-store',headers:{...authHeaders(),...(options.headers||{})},signal:options.signal||AbortSignal.timeout(12000)});}
  catch(error){if(retryable&&!options.signal?.aborted&&attempt<2){await pause30(retryDelay30(attempt));continue;}throw error;}
  if(retryable&&[429,502,503,504].includes(response.status)&&attempt<2){const retryAfter=Number(response.headers.get('Retry-After'));await pause30(Math.min(5000,retryAfter>0?retryAfter*1000:retryDelay30(attempt)));if(options.signal?.aborted)throw new DOMException('Request cancelled','AbortError');continue;}
  const data=response.status===204?null:await readJSON20(response,'Database');
  if(!response.ok){if(response.status===401){expireSession20('Session could not be validated. Sign in again.');throw Error('Sign in again. Unsaved changes have not been discarded.');}
   const missingSchema=['PGRST205','42P01'].includes(data?.code);const error=Error(missingSchema?'Application database tables are missing. Install the ICU KAASH database setup in the Supabase project used by this app.':'Database request failed ('+response.status+'). '+(data?.message||'No successful save has been confirmed.'));error.code=data?.code;throw error;}
  return data;
 }
}
async function enterApp20(){
 const memberships=await rest('kaash_members?unit_id=eq.'+encodeURIComponent(config.unitId)+'&select=role');
 if(!Array.isArray(memberships)||!memberships[0]?.role||memberships[0].role==='print_agent')throw Error('No application membership for this unit.');member=memberships[0];
 const rows=await rest('kaash_boards?unit_id=eq.'+encodeURIComponent(config.unitId)+'&select=data,revision');if(!Array.isArray(rows)||!rows[0]?.data)throw Error('Unit board is not initialized.');
 installBoard(rows[0].data);boardRevision=rows[0].revision;serverFingerprint=JSON.stringify(captureBoard());saveBlocked=false;conflictBlocked20=false;pending=false;expiredDraft20=false;
 installCloudPersistence();document.getElementById('save-status11')?.remove();document.querySelector('.top').after(cloudStatus);
 document.body.classList.remove('auth-locked','save-blocked');document.body.classList.toggle('read-only',!canEdit());gate.remove();
 page='census';render();installToolbar();storeSession20();armSession20();status((canEdit()?'Connected':'Read-only')+' · '+member.role+' · one-hour session');
}
function loginForm(message=''){
 document.getElementById('login-content').innerHTML=`<p role="status">${safe(message)}</p><form id="login-form"><label>Employee number or email<input type="text" name="email" autocomplete="username" required></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button type="submit">Sign in · 1 hour</button></form>`;
 document.getElementById('login-form').onsubmit=async e=>{
  e.preventDefault();if(expiredDraft20&&!confirm('Signing in reloads the database and discards the in-memory draft. Have you exported your unsaved changes?'))return;
  const form=e.currentTarget;form.querySelector('button').disabled=true;
  try{const identity=form.elements.namedItem('email'),password=form.elements.namedItem('password');if(!identity||!password)throw Error('Sign-in form could not be loaded. Reload the page.');session=await authRequest('token?grant_type=password',{email:employeeLogin25(identity.value),password:password.value});session.expires_at=Math.floor(Date.now()/1000)+session.expires_in;sessionDeadline20=Date.now()+SESSION_DURATION20;password.value='';await enterApp20();}
  catch(error){session=null;clearSession20();loginForm(error.message)}
 };
}
async function initializeSession20(){
 try{
  await loadConfiguration25();
  let saved;try{saved=JSON.parse(sessionStorage.getItem(SESSION_KEY20)||'null')}catch{}
  if(saved&&saved.url===config.url&&saved.unit===config.unitId&&saved.deadline>Date.now()&&saved.deadline<=Date.now()+SESSION_DURATION20&&saved.session?.refresh_token){session=saved.session;sessionDeadline20=saved.deadline;await enterApp20();}
  else{clearSession20();loginForm();}
 }catch(error){
  if(session&&sessionDeadline20>Date.now()){
   storeSession20();loginForm(error.message);
   document.getElementById('login-content').insertAdjacentHTML('afterbegin','<button type="button" id="retry-connect20">Retry connection</button>');
   document.getElementById('retry-connect20').onclick=()=>void initializeSession20();
  }else{session=null;clearSession20();loginForm(error.message);}
 }
}
document.addEventListener('visibilitychange',()=>{if(session&&document.visibilityState==='visible')void refreshSession().catch(error=>status(error.message))});

function applyReadOnly20(){
 if(!member)return;
 if(selected?.status&&document.querySelector('#shade.show'))document.querySelectorAll('#patient-fields input,#patient-fields select,#patient-fields textarea,#patient-fields button').forEach(el=>el.disabled=true);
 if(canEdit())return;
 document.querySelectorAll('#main input,#main select,#main textarea,#patient-fields input,#patient-fields select,#patient-fields textarea,.assignment-overlay3 input,.assignment-overlay3 select').forEach(el=>{if(!el.matches('#record-search3,#search11,#search21,#q,.search,#cloud-printer'))el.disabled=true});
 main.querySelectorAll('[data-edit-bed3],[data-duty17],#other-duty17,#network-print').forEach(el=>el.disabled=true);
}
document.addEventListener('input',e=>{if(member&&!canEdit()&&e.target.closest('#patient-fields,.assignment-overlay3')){e.preventDefault();e.stopImmediatePropagation()}},true);
function installStaffPanel20(){
 if(page!=='team'||main.querySelector('[data-staff-panel24]'))return;
 const section=document.createElement('section');section.className='section';section.dataset.staffPanel24='true';
 section.innerHTML=`<div class="secthead"><h3>Staff directory</h3><small>${staff.length} RN · ${pctNames.length} PCT</small></div>${canEdit()?'<details><summary class="btn secondary">Add staff</summary><form id="add-staff20" class="fields" style="margin-top:10px"><div class="field"><label>Staff name<input id="staff-name20" maxlength="80" required autocomplete="off"></label></div><div class="field"><label>Role<select id="staff-role20"><option value="rn">RN</option><option value="pct">PCT</option></select></label></div><button class="btn" type="submit">Add</button><p id="staff-message20" role="status"></p></form></details>':'<p class="sub">Staff directory managed by the charge nurse.</p>'}`;
 main.querySelector('.schedule-controls3')?.before(section);
 const reload=document.createElement('button');reload.type='button';reload.className='btn secondary';reload.id='reload-staff25';reload.textContent='Load nursing directory';section.append(reload);
 const message=document.createElement('p');message.id='directory-status25';message.setAttribute('role','status');message.className='sub';message.textContent='Board revision '+boardRevision;section.append(message);
 reload.onclick=async()=>{
  if(pending||saveBlocked||dirty20()){message.textContent='Save or export your pending changes before loading the directory.';return;}
  reload.disabled=true;message.textContent='Loading directory from Supabase…';
  try{
   const rows=await rest('kaash_boards?unit_id=eq.'+encodeURIComponent(config.unitId)+'&select=data,revision');
   const row=Array.isArray(rows)?rows[0]:null;
   if(!row?.data||!Array.isArray(row.data.staffDirectory?.rn))throw Error('No nursing directory returned for unit '+config.unitId+'. Check the import destination.');
   if(pending||saveBlocked||dirty20())throw Error('New changes are pending. Save them before loading the directory.');
   installBoard(row.data);boardRevision=row.revision;serverFingerprint=JSON.stringify(captureBoard());render();
   const text='Loaded '+staff.length+' RN from database · revision '+boardRevision;
   document.getElementById('directory-status25').textContent=text;status(text);
  }catch(error){if(message.isConnected)message.textContent=error.message;}
  finally{if(reload.isConnected)reload.disabled=false;}
 };
 const form=section.querySelector('#add-staff20');if(!form)return;
 form.onsubmit=e=>{
  e.preventDefault();if(!canEdit()||!session||saveBlocked){section.querySelector('#staff-message20').textContent='Sign in with an editing role and resolve any save error first.';return;}
  const name=section.querySelector('#staff-name20').value.trim().replace(/\s+/g,' ');
  if(!name||name.length>80){section.querySelector('#staff-message20').textContent='Enter a name up to 80 characters.';return;}
  if([...staff,...pctNames].some(existing=>existing.toLowerCase()===name.toLowerCase())){section.querySelector('#staff-message20').textContent='This staff name already exists.';return;}
  (section.querySelector('#staff-role20').value==='pct'?pctNames:staff).push(name);queueSave();render();
 };
}
const detailBeforeReadOnly20=detail;
detail=function(){detailBeforeReadOnly20();applyReadOnly20()};
const unifiedBeforeReadOnly20=patientUnified8;
patientUnified8=function(){unifiedBeforeReadOnly20();applyReadOnly20()};

function updateHeader20(){
 const now=new Date(),label=new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn',{timeZone:'Asia/Riyadh',dateStyle:'full'}).format(now);
 document.querySelector('.top .shift').textContent=(currentShift3||'Day')+' SHIFT · '+label;
 if(page==='census'){const hero=main.querySelector('.hero');if(hero){hero.querySelector('h2').textContent='Patient census';hero.querySelector('p').textContent=label+' · '+(currentShift3||'Day')+' shift';}}
}
let patientView21='summary';
const originalOpen21=open,originalDetail21=detail,originalUnified21=patientUnified8;
open=function(patient){if(!patient.name&&!patient.mrn){patient.code='';patient.precautions='';}patientView21=patient.name?'summary':'admission';originalOpen21(patient)};
function admissionISO21(value){const raw=String(value||'');if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const match=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return match?`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`:''}
function patientTabs21(){document.querySelector('#shade .switch').innerHTML=[['summary','Overview'],['admission','Admission'],['advanced','Clinical details']].map(([view,label])=>`<button type="button" class="quick-nav21 ${patientView21===view?'on':''}" data-quick21="${view}">${label}</button>`).join('');document.querySelectorAll('[data-quick21]').forEach(button=>button.onclick=()=>{patientView21=button.dataset.quick21;detailMode='profile';detail()})}
detail=function(){
 if(!selected)return;
 if(patientView21==='advanced'){
  originalDetail21();const fields=document.getElementById('patient-fields');
  fields.insertAdjacentHTML('afterbegin','<p class="sub">Expand only the section you need. Admission data stays in the Admission tab.</p>');
  fields.querySelectorAll('.admission-group3').forEach(section=>section.open=false);
  const back=document.createElement('button');back.className='btn secondary quick-nav21';back.type='button';back.textContent='Back to overview';back.onclick=()=>{patientView21='summary';detail()};fields.prepend(back);applyReadOnly20();return;
 }
 patientTabs21();const p=selected,fields=document.getElementById('patient-fields');
 if(patientView21==='summary'){
  const completed=(p.tasks||[]).filter(task=>task.status==='Completed').length;
  fields.innerHTML=`<section class="section"><div class="toprow"><div><div class="label">${safe(p.bed)} · MRN ${safe(p.mrn||'—')}</div></div>${pill(p.code||'Not documented',p.code==='DNR'?'red':'')}</div><p>${safe(p.diagnosis||'Diagnosis not documented')}</p><p class="meta">Age ${safe(p.age||'—')} · ${safe(p.gender||'—')} · Admission ${safe(p.doa||'—')} ${safe(p.toa||'')}</p></section><section class="section"><h3>Current care</h3><div class="grid2">${metric('Airway / oxygen',p.oxygen||'Not documented')}${metric('Precautions',p.precautions||'Not documented')}${metric('Recorded active lines',(p.lines||[]).filter(line=>!['Removed','Stopped'].includes(line.stage)).length)}${metric('Pending tasks',(p.tasks||[]).length-completed)}</div><p class="meta">Special endorsement: ${safe(p.endorsement||'—')}</p></section>${p.status?`<section class="section"><h3>Discharge details</h3><p>${safe(p.dischargeType||p.status)} � ${safe(p.dischargedAtISO||p.dischargedAt||'Not documented')}</p><p class="destination-preview34">Discharged to: ${safe(destinationLabel34(p)||'Not documented')}</p></section>`:''}<section class="section"><h3>Next action</h3><div class="label-tools"><button class="btn secondary quick-nav21" id="quick-care21">Open care & handover</button><button class="btn secondary quick-nav21" id="quick-kardex21">Open 24h Kardex</button>${canEdit()&&!p.status?'<button class="btn secondary" id="quick-discharge21">Discharge</button>':''}</div></section><p id="patient-save-status21" role="status" class="sub">${safe(cloudStatus.textContent)}</p>`;
  document.getElementById('quick-care21').onclick=()=>{patientView21='advanced';patientUnified8()};
  document.getElementById('quick-kardex21').onclick=()=>{if(p.status){status('Archived record is read only.');return;}kardexBed=p.bed;document.getElementById('shade').classList.remove('show');page='kardex';render()};
  const discharge=document.getElementById('quick-discharge21');if(discharge)discharge.onclick=()=>{if(!canEdit()||saveBlocked||!confirm('Discharge this patient and move this admission to Records?'))return;ensureAdmission8(p);archivedRecords3.unshift({...p,status:'Discharged',dischargedAt:englishDate3(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())),dischargeType:'Transfer-out'});const index=patients.indexOf(p);if(index>=0)patients.splice(index,1);queueSave();document.getElementById('shade').classList.remove('show');page='records';render()};
 }else{
  const admissionSelect26=(key,label,options)=>`<div class="field"><label>${label} (optional)<select name="${key}"><option value="">Not documented</option>${[...new Set([...(p[key]?[p[key]]:[]),...options])].map(value=>`<option value="${safe(value)}" ${p[key]===value?'selected':''}>${safe(value)}</option>`).join('')}</select></label></div>`;
  fields.innerHTML=`<section class="section"><h3>Quick admission</h3><p class="sub">Start with patient name and MRN. Other details can be added later; blank means not documented.</p><form id="quick-admission21"><div class="fields">${[['name','Patient name'],['mrn','MRN']].map(([key,label])=>`<div class="field"><label>${label} (required)<input name="${key}" type="text" required maxlength="120" value="${safe(p[key]||'')}" ${key==='mrn'?'dir="ltr"':''}></label></div>`).join('')}</div><details class="section admission-optional26"><summary>Admission details (optional)</summary><div class="fields"><div class="field"><label>Age (optional)<input name="age" type="number" min="0" max="130" step="1" value="${safe(p.age||'')}"></label></div>${admissionSelect26('gender','Gender',['M','F','Other'])}<div class="field wide"><label>Primary diagnosis (optional)<input name="diagnosis" list="diagnosis-options26" maxlength="300" value="${safe(p.diagnosis||'')}" placeholder="Choose or type the documented diagnosis"></label><datalist id="diagnosis-options26">${['Respiratory failure','Sepsis','Postoperative monitoring','Shock','Neurological monitoring','Trauma','Cardiac monitoring'].map(value=>`<option value="${safe(value)}"></option>`).join('')}</datalist><p class="sub">Shortcuts for documented information; no diagnosis is selected automatically.</p></div>${admissionSelect26('admissionSource','Admission source',selectOptions3.admissionSource)}${admissionSelect26('patientType','Patient type',selectOptions3.patientType)}${admissionSelect26('code','Code status',['FULL','DNR'])}${admissionSelect26('oxygen','Oxygen support',selectOptions3.oxygen)}${admissionSelect26('precautions','Precautions',selectOptions3.precautions)}<div class="field"><label>Admission date (optional)<input name="doa" type="date" value="${safe(admissionISO21(p.doa))}"></label></div><div class="field"><label>Admission time (optional)<input name="toa" type="text" placeholder="HH:mm · 24-hour" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" value="${safe(p.toa||'')}"></label></div></div><button type="button" class="btn secondary" id="admission-now26">Use current Riyadh date & time</button></details>${canEdit()&&!p.status?'<button class="btn" type="submit">Save admission</button>':''}<p id="quick-error21" role="status"></p></form></section><p id="patient-save-status21" role="status" class="sub">${safe(cloudStatus.textContent)}</p>`;
  document.getElementById('quick-admission21').onsubmit=e=>{e.preventDefault();if(!canEdit()||p.status||saveBlocked){document.getElementById('quick-error21').textContent='Editing is unavailable. Resolve any save error first.';return;}const form=e.target,values=Object.fromEntries(['name','mrn','age','diagnosis','gender','code','doa','toa','admissionSource','patientType','oxygen','precautions'].map(key=>[key,['mrn','age','doa','toa'].includes(key)?englishDigits26(form.elements.namedItem(key).value.trim()):form.elements.namedItem(key).value.trim()]));if(!values.name||!values.mrn)return;if(active().some(other=>other!==p&&String(other.mrn||'').trim().toLowerCase()===values.mrn.toLowerCase())){document.getElementById('quick-error21').textContent='This MRN is already assigned to an active patient.';return;}Object.assign(p,values);ensureAdmission8(p);document.getElementById('patient-name').textContent=p.name;queueSave();patientView21='summary';detail();render()};
 }
 applyReadOnly20();document.querySelector('#shade .modal').scrollTop=0;
};
patientUnified8=function(){originalUnified21();const container=document.getElementById('patient-fields');[...container.children].filter(section=>section.tagName==='SECTION').forEach((section,index)=>{if(index===0)return;const heading=section.querySelector('h3');if(!heading)return;const details=document.createElement('details');details.className='section';const summary=document.createElement('summary');summary.textContent=heading.textContent;heading.remove();details.append(summary);while(section.firstChild)details.append(section.firstChild);section.replaceWith(details)});applyReadOnly20()};
patientList=function(){
 main.innerHTML='<h2 class="title">Patient list</h2><p class="sub">Bed, identity and diagnosis at a glance. Open a patient for further details.</p><input class="search" id="search21" placeholder="Search name, MRN, bed or diagnosis"><div id="list21"></div>';
 const paint=()=>{
  if(page!=='patients'||!document.getElementById('search21'))return;
  const query=englishDigits26(document.getElementById('search21').value).trim().toLowerCase(),rows=active().filter(p=>[p.name,p.mrn,p.bed,p.diagnosis].some(value=>String(value||'').toLowerCase().includes(query))).sort((a,b)=>a.bed.localeCompare(b.bed));
  document.getElementById('list21').innerHTML=rows.map(p=>`<article class="card"><div class="toprow"><div><div class="label">${safe(p.bed)} · MRN ${safe(p.mrn)}</div><h3>${safe(p.name)}</h3></div>${pill(p.code||'Not documented',p.code==='DNR'?'red':'')}</div><p>${safe(p.diagnosis||'Diagnosis not documented')}</p><div>${p.oxygen?pill(p.oxygen,'blue'):''}${p.precautions&&p.precautions!=='Standard'?pill(p.precautions,'amber'):''}</div><p class="meta">Admission ${safe(p.doa||'—')} · Pending tasks ${(p.tasks||[]).filter(task=>task.status!=='Completed').length}</p><button class="btn secondary" data-open="${safe(p.bed)}">View patient</button>${canEdit()?`<details class="section"><summary>Transfer bed</summary><select data-destination21="${safe(p.bed)}"><option value="">Choose available bed</option>${groups.flatMap(group=>group.ids).filter(bed=>bed!==p.bed&&!active().some(patient=>patient.bed===bed)).map(bed=>`<option>${safe(bed)}</option>`).join('')}</select><input data-transfer-by21="${safe(p.bed)}" placeholder="Staff / initials"><button class="btn secondary" data-transfer21="${safe(p.bed)}">Transfer</button></details>`:''}</article>`).join('')||'<section class="section">No matching patients. Select an available bed in Census to admit a patient.</section>';
  document.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>open(active().find(p=>p.bed===button.dataset.open)));
  document.querySelectorAll('[data-transfer21]').forEach(button=>button.onclick=()=>{try{const p=active().find(p=>p.bed===button.dataset.transfer21);transferPatient11(p,main.querySelector(`[data-destination21="${p.bed}"]`).value,main.querySelector(`[data-transfer-by21="${p.bed}"]`).value);paint()}catch(error){status(error.message)}});
 };
 let timer;document.getElementById('search21').oninput=()=>{clearTimeout(timer);timer=setTimeout(paint,150)};paint();
};
const baseStatus21=status;status=function(message){baseStatus21(message);const local=document.getElementById('patient-save-status21');if(local)local.textContent=message};
const baseCensus21=census;census=function(){baseCensus21();const beds=groups.flatMap(group=>group.ids).length,n=active().length,box=document.createElement('section');box.className='section';const complete=active().filter(p=>p.name&&p.mrn&&p.diagnosis&&p.doa).length;box.innerHTML=`<h3>Unit overview</h3><div class="grid2">${metric('Bed occupancy',beds?Math.round(n/beds*100)+'%':'—')}${metric('Core admission fields',n?Math.round(complete/n*100)+'%':'—')}</div><p class="sub">Occupancy: ${n}/${beds} beds. Core fields: name, MRN, diagnosis and admission date (${complete}/${n}). Missing data does not mean a negative clinical finding.</p>`;main.querySelector('.hero')?.after(box)};

const linenItems21={gowns:'Gowns',blankets:'Blankets',sheets:'Bed sheets'},linenActions21={received:'Receive clean stock',issued:'Issue for use',soiled:'Collect dirty linen',sent:'Send to laundry',returned:'Return from laundry',loss:'Record loss / discard'};
let linenViewRequest21=0,pendingLinenMove21=null;
linenScreen3=function(){
 const request=++linenViewRequest21;
 main.innerHTML=`<h2 class="title">Linen inventory</h2><p class="sub">Current balances · clean → in use → dirty → laundry → clean</p><p id="linen-status21" role="status">Loading inventory…</p><div id="linen-stock21"></div><section class="section"><h3>Record movement</h3>${canEdit()?`<form id="linen-move21"><div class="fields"><div class="field"><label>Item<select id="linen-item21">${Object.entries(linenItems21).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label></div><div class="field"><label>Movement<select id="linen-action21">${Object.entries(linenActions21).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label></div><div class="field"><label>Quantity<input id="linen-quantity21" type="number" min="1" max="1000000" step="1" inputmode="numeric" required></label></div><div class="field"><label>Shift<select id="linen-shift21">${shifts3.map(shift=>`<option ${shift===currentShift3?'selected':''}>${shift}</option>`).join('')}</select></label></div><div class="field" id="linen-loss-field21" hidden><label>Remove from<select id="linen-bucket21"><option value="clean">Clean</option><option value="in_use">In use</option><option value="dirty">Dirty</option><option value="laundry">Laundry</option></select></label></div><div class="field wide"><label>Reference / reason<input id="linen-note21" maxlength="300" placeholder="Delivery reference, laundry slip or loss reason"></label></div></div><button class="btn" type="submit">Record movement</button></form>`:'<p>View only · movements are recorded by CHARGE.</p>'}</section><section class="section"><h3>Recent movements</h3><p class="sub">Latest 50 entries · balances above include all movements</p><div id="linen-history21"></div></section>`;
 let stocks=[];
 const refresh=async()=>{
  const [stock,moves]=await Promise.all([
   rest('kaash_linen_stock?unit_id=eq.'+encodeURIComponent(config.unitId)+'&select=*'),
   rest('kaash_linen_moves?unit_id=eq.'+encodeURIComponent(config.unitId)+'&select=item,action,quantity,shift,note,at&order=at.desc,id.desc&limit=50')
  ]);
  if(request!==linenViewRequest21||page!=='linen')return;
  stocks=stock;
  document.getElementById('linen-stock21').innerHTML=`<section class="section"><div style="overflow-x:auto"><table class="linen-table"><thead><tr><th>Item</th><th>Clean</th><th>In use</th><th>Dirty</th><th>Laundry</th><th>Total</th></tr></thead><tbody>${Object.entries(linenItems21).map(([key,label])=>{const row=stock.find(row=>row.item===key);return `<tr><td>${label}</td>${['clean','in_use','dirty','laundry'].map(bucket=>`<td>${row?.initialized?row[bucket]:'—'}</td>`).join('')}<td>${row?.initialized?row.clean+row.in_use+row.dirty+row.laundry:'Not initialized'}</td></tr>`}).join('')}</tbody></table></div></section>${canEdit()?Object.entries(linenItems21).filter(([key])=>!stock.some(row=>row.item===key&&row.initialized)).map(([key,label])=>`<details class="section"><summary>Set opening balance · ${label}</summary><form data-opening21="${key}"><p class="sub">Count existing stock once. Previous issued quantities are not opening balances.</p><div class="fields">${[['clean','Clean'],['in_use','In use'],['dirty','Dirty'],['laundry','At laundry']].map(([bucket,title])=>`<div class="field"><label>${title}<input name="${bucket}" type="number" min="0" max="1000000" step="1" value="0" required></label></div>`).join('')}</div><button class="btn" type="submit">Set opening balance</button></form></details>`).join(''):''}`;
  document.querySelectorAll('[data-opening21]').forEach(form=>form.onsubmit=async event=>{event.preventDefault();if(!canEdit())return;const opening=Object.fromEntries(['clean','in_use','dirty','laundry'].map(bucket=>[bucket,Number(form.elements[bucket].value)]));if(Object.values(opening).some(value=>!Number.isInteger(value)||value<0||value>1000000))return;await submit({p_item:form.dataset.opening21,p_action:'opening',p_quantity:0,p_opening:opening,p_shift:currentShift3,p_note:'Opening physical stock count',p_bucket:null},form)});
  document.getElementById('linen-history21').innerHTML=moves.map(move=>`<div class="row"><div><b>${safe(linenItems21[move.item])} · ${safe(move.action==='opening'?'Opening balance':linenActions21[move.action])} · ${move.quantity}</b><div class="meta">${safe(kTime(new Date(move.at)))} · ${safe(move.shift)} · ${safe(move.note)}</div></div></div>`).join('')||'<p>No movements recorded.</p>';
  document.getElementById('linen-status21').textContent='Inventory loaded. Opening balances are required before recording movements.';
 };
 const submit=async(payload,form)=>{
  if(!canEdit()||!session)return;
  const statusEl=document.getElementById('linen-status21'),button=form.querySelector('button');button.disabled=true;
  const signature=JSON.stringify(payload);
  if(pendingLinenMove21&&pendingLinenMove21.signature!==signature){statusEl.textContent='A previous movement has an uncertain result. Retry that exact movement or verify its entry in the movement history before continuing.';button.disabled=false;return;}
  pendingLinenMove21||={signature,body:{...payload,p_id:crypto.randomUUID(),p_unit:config.unitId}};
  statusEl.textContent='Recording movement…';
  try{await rest('rpc/kaash_linen_move',{method:'POST',body:JSON.stringify(pendingLinenMove21.body)});pendingLinenMove21=null;await refresh();if(request===linenViewRequest21&&page==='linen')statusEl.textContent='Movement recorded. Balances updated.';}
  catch(error){if(error.code)pendingLinenMove21=null;if(request===linenViewRequest21&&page==='linen')statusEl.textContent=error.message+(pendingLinenMove21?' Retry the same movement; its ID prevents counting it twice.':'');}
  finally{if(button.isConnected)button.disabled=false;}
 };
 const form=document.getElementById('linen-move21');if(form){
  document.getElementById('linen-action21').onchange=()=>document.getElementById('linen-loss-field21').hidden=document.getElementById('linen-action21').value!=='loss';
  form.onsubmit=async event=>{event.preventDefault();const quantity=Number(document.getElementById('linen-quantity21').value),item=document.getElementById('linen-item21').value,action=document.getElementById('linen-action21').value,note=document.getElementById('linen-note21').value.trim();if(!Number.isInteger(quantity)||quantity<1||quantity>1000000)return;const stock=stocks.find(row=>row.item===item);if(!stock?.initialized){document.getElementById('linen-status21').textContent='Set opening balance for this item first.';return;}if(action==='loss'&&!note){document.getElementById('linen-status21').textContent='Enter a reason for the loss.';return;}await submit({p_item:item,p_action:action,p_quantity:quantity,p_shift:document.getElementById('linen-shift21').value,p_note:note,p_bucket:action==='loss'?document.getElementById('linen-bucket21').value:null,p_opening:null},form)};
 }
 if(pendingLinenMove21){
  const retry=document.createElement('button');retry.type='button';retry.className='btn secondary';retry.textContent='Retry last uncertain movement';
  const retryPanel=document.createElement('div');retryPanel.append(retry);document.getElementById('linen-status21').after(retryPanel);
  retry.onclick=async()=>{if(!pendingLinenMove21)return;const {p_id,p_unit,...payload}=pendingLinenMove21.body;await submit(payload,retryPanel);if(!pendingLinenMove21)retry.remove()};
 }
 void refresh().catch(error=>{if(request===linenViewRequest21&&page==='linen')document.getElementById('linen-status21').textContent=error.message+' Install 007_linen_inventory.sql in Supabase.'});
};

let lastPage21;const renderBefore21=render;render=function(){const changed=lastPage21!==page;renderBefore21();if(changed){window.scrollTo(0,0);lastPage21=page}};
let admissionReportCache22=null,admissionReportTime22=0;
function admissionChange22(value){return value===null||value===undefined?'N/A':(value>0?'+':'')+Number(value).toFixed(1)+'%'}
function admissionReportHTML22(report){
 return `<div class="grid2">${metric('This week · so far',report.this_week)}${metric('This month · so far',report.this_month)}${metric('Last complete week',report.last_week)}${metric('Weekly change',admissionChange22(report.week_change))}${metric('Last complete month',report.last_month)}${metric('Monthly change',admissionChange22(report.month_change))}</div><p class="sub">Week begins Monday · calendar months · Riyadh time. Current week starts ${safe(report.week_start)}; month starts ${safe(report.month_start)}.</p><p class="sub">Weekly change compares ${report.last_week} admissions with ${report.preceding_week} in the preceding complete week. Monthly change compares ${report.last_month} with ${report.preceding_month} in the preceding complete month. N/A means the earlier count is zero.</p><p class="sub">Based on recorded ICU admissions, including repeat admissions. Each admission is counted once across active patients and Records. ${report.missing_dates} missing/invalid dates and ${report.future_dates} future dates are excluded. Earliest recorded admission: ${safe(report.earliest_date||'—')}.</p><p class="sub">Operational ICU activity report. It is not the WHO population-based annual hospital admission rate.</p>`;
}
const censusBeforeAdmissions22=census;
census=function(){
 censusBeforeAdmissions22();const panel=document.createElement('section');panel.className='section';panel.id='admission-report22';panel.innerHTML='<div class="secthead"><h3>ICU admissions · week & month</h3><button class="btn secondary quick-nav21" id="refresh-admissions22">Refresh</button></div><div id="admission-report-body22" role="status">Loading admission report…</div>';
 main.querySelector('.hero')?.after(panel);
 const load=async(force=false)=>{
  const target=panel.querySelector('#admission-report-body22'),button=panel.querySelector('button');button.disabled=true;
  try{
   if(force||!admissionReportCache22||Date.now()-admissionReportTime22>60000){admissionReportCache22=await rest('rpc/kaash_admission_report',{method:'POST',body:JSON.stringify({p_unit:config.unitId})});admissionReportTime22=Date.now();}
   if(panel.isConnected&&page==='census')target.innerHTML=admissionReportHTML22(admissionReportCache22);
  }catch(error){if(panel.isConnected)target.textContent=error.message+' Install 008_admission_reports.sql in Supabase.';}
  finally{if(button.isConnected)button.disabled=false;}
 };
 panel.querySelector('button').onclick=()=>void load(true);void load();
};

function today24(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function instant24(value){if(!value)return null;const text=String(value),ms=Date.parse(text+(/(?:Z|[+-]\d{2}:\d{2})$/i.test(text)?'':'+03:00'));return Number.isFinite(ms)?ms:null}
function date24(value){const ms=instant24(value);return ms===null?'':new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms))}
function assignments24(shift=currentShift3){const source=scheduleDate3===today24()?{rn:shiftRNs,pct:shiftPCTs}:scheduleByDate4[today24()]||{};return {rn:source.rn?.[shift]||{},pct:source.pct?.[shift]||{}}}
function workload24(shift=currentShift3){const assignments=assignments24(shift),loads=new Map(),unassigned=[];active().forEach(patient=>{const rn=String(assignments.rn[patient.bed]||'').trim();if(!rn)unassigned.push(patient.bed);else loads.set(rn,[...(loads.get(rn)||[]),patient.bed])});return {assignments,loads,unassigned}}
function latestHandover24(patient,shift){return [...(patient.handovers||[])].reverse().find(h=>h.shift===shift&&date24(h.createdAt)===today24())}
function taskTiming24(){let eligible=0,onTime=0,unknown=0;const now=Date.now();active().forEach(patient=>(patient.tasks||[]).forEach(task=>{const due=instant24(task.status==='Completed'&&Object.hasOwn(task,'dueAtCompletion')?task.dueAtCompletion:task.due);if(due===null||due>now||due<now-7*86400000)return;if(task.status==='Completed'){const completed=instant24(task.completedAt);if(completed===null){unknown++;return;}eligible++;if(completed<=due)onTime++;}else eligible++;}));return {eligible,onTime,unknown,percentage:eligible?Math.round(onTime/eligible*100):null}}
function stampTasks24(){let previous;try{previous=JSON.parse(serverFingerprint||'{}')}catch{previous={}}const old=new Map();(previous.patients||[]).forEach(patient=>(patient.tasks||[]).forEach(task=>old.set(patient.admissionId+'/'+task.id,task)));active().forEach(patient=>(patient.tasks||[]).forEach(task=>{const former=old.get(patient.admissionId+'/'+task.id);if(task.status==='Completed'&&!task.completedAt&&former?.status!=='Completed')task.completedAt=new Date().toISOString();if(task.status!=='Completed'&&former?.status==='Completed')delete task.completedAt;}))}
let wardShift24='Day';
function wardRows24(shift){const assignments=assignments24(shift),now=Date.now();return active().map(patient=>{const pending=(patient.tasks||[]).filter(task=>task.status!=='Completed'),overdue=pending.filter(task=>instant24(task.due)!==null&&instant24(task.due)<now),handover=latestHandover24(patient,shift);return {patient,pending,overdue,handover,rn:assignments.rn[patient.bed]||'',pct:assignments.pct[patient.bed]||''}}).sort((a,b)=>b.overdue.length-a.overdue.length||Number(!b.rn)-Number(!a.rn)||a.patient.bed.localeCompare(b.patient.bed))}
async function reloadBoard24(){if(dirty20()){status('Save or export your draft before refreshing the board.');return;}const rows=await rest('kaash_boards?unit_id=eq.'+encodeURIComponent(config.unitId)+'&select=data,revision');if(!rows.length)throw Error('Unit board is unavailable.');installBoard(rows[0].data);boardRevision=rows[0].revision;serverFingerprint=JSON.stringify(captureBoard());admissionReportCache22=null;render();status('Loaded latest board · revision '+boardRevision)}
function wardBoard24(){
 const rows=wardRows24(wardShift24),loads=workload24(wardShift24),timing=taskTiming24(),limit=staffingPolicy24.maxPatientsPerRN;
 main.innerHTML=`<h2 class="title">Shift board</h2><p class="sub">${safe(today24())} · current patient board · revision ${boardRevision}. Overdue tasks are evaluated now.</p><div class="label-tools"><select id="ward-shift24">${shifts3.map(shift=>`<option ${wardShift24===shift?'selected':''}>${shift}</option>`).join('')}</select><button class="btn secondary quick-nav21" id="ward-refresh24">Load latest board</button><button class="btn secondary quick-nav21" id="ward-print24">Print shift report</button></div><div class="stats">${metric('Overdue tasks',rows.reduce((sum,row)=>sum+row.overdue.length,0))}${metric('Beds without RN',loads.unassigned.length)}${metric('Handover awaiting receipt',rows.filter(row=>row.handover&&!row.handover.receivedAt).length)}</div><section class="section"><h3>Recorded task completion · last 7 days</h3><p>${timing.percentage===null?'N/A':timing.percentage+'%'} completed by their due time · ${timing.onTime}/${timing.eligible} assessable tasks</p><p class="sub">Active-patient tasks that are already due. ${timing.unknown} completed tasks have unknown completion time and are excluded. This measures recorded task timing, not clinical quality.</p></section><section class="section"><h3>RN workload · ${safe(wardShift24)}</h3><p class="sub">${limit?'Configured unit limit: '+limit+' patients/RN.':'No unit workload limit has been configured.'} Counts do not assess acuity or determine safe staffing.</p>${[...loads.loads].map(([rn,beds])=>`<div class="row"><b>${safe(rn)}</b><span>${beds.length} · ${safe(beds.join(', '))} ${limit&&beds.length>limit?'· Above unit limit':''}</span></div>`).join('')||'<p>No RN assignments recorded for today.</p>'}</section><div id="ward-patients24">${rows.map(row=>`<article class="card"><div class="toprow"><div><div class="label">${safe(row.patient.bed)} · ${safe(row.patient.mrn)}</div><h3>${safe(row.patient.name)}</h3></div>${row.overdue.length?pill(row.overdue.length+' overdue','amber'):''}</div><p>${safe(row.patient.diagnosis||'Not documented')}</p><p class="meta">RN ${safe(row.rn||'Unassigned')} · PCT ${safe(row.pct||'Unassigned')} · Handover ${row.handover?(row.handover.receivedAt?'received':'awaiting receipt'):'not recorded for this shift'}</p>${row.pending.slice(0,3).map(task=>`<div class="row"><b>${safe(task.title)}</b><span>${safe(task.owner||'No owner')} · ${safe(task.due||'No due time')}</span></div>`).join('')}<button class="btn secondary quick-nav21" data-ward-open24="${safe(row.patient.admissionId)}">Open patient</button></article>`).join('')||'<section class="section">No active patients.</section>'}</div><p id="ward-message24" role="status"></p>`;
 document.getElementById('ward-shift24').onchange=e=>{wardShift24=e.target.value;wardBoard24()};
 document.querySelectorAll('[data-ward-open24]').forEach(button=>button.onclick=()=>open(active().find(p=>p.admissionId===button.dataset.wardOpen24)));
 document.getElementById('ward-refresh24').onclick=()=>void reloadBoard24().catch(error=>status(error.message));
 document.getElementById('ward-print24').onclick=()=>printShift24(wardShift24);
}
function printShift24(shift){
 if(dirty20()){status('Save changes before printing the confirmed shift report.');return;}
 const rows=wardRows24(shift),loads=workload24(shift);let zone=document.getElementById('print-zone');if(!zone){zone=document.createElement('div');zone.id='print-zone';document.body.append(zone)}
 zone.className='';zone.innerHTML=`<article class="shift-print24"><h1>ICU KAASH · Shift report</h1><p>${safe(today24())} · ${safe(shift)} · revision ${boardRevision} · generated ${safe(kTime(new Date()))}</p><p>Current board snapshot · ${rows.length} active patients · ${loads.unassigned.length} beds without RN. Empty fields mean not documented.</p><table><thead><tr><th>Bed / MRN</th><th>Patient / diagnosis</th><th>RN / PCT</th><th>Care summary</th><th>Pending work</th><th>Handover</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${safe(row.patient.bed)}<br>${safe(row.patient.mrn)}</td><td>${safe(row.patient.name)}<br>${safe(row.patient.diagnosis||'—')}</td><td>${safe(row.rn||'Unassigned')}<br>${safe(row.pct||'Unassigned')}</td><td>${safe(row.patient.oxygen||'Not documented')}<br>${safe(row.patient.precautions||'Not documented')}<br>${safe(row.patient.code||'Not documented')}</td><td>${row.pending.map(task=>`${safe(task.title)} · ${safe(task.owner||'—')} · ${safe(task.due||'No due time')}`).join('<br>')||'No recorded pending tasks'}</td><td>${row.handover?`${safe(row.handover.summary)}<br>${row.handover.receivedAt?'Received by '+safe(row.handover.receivedBy):'Awaiting receipt'}`:'Not recorded for this shift'}</td></tr>`).join('')}</tbody></table><h2>Staff assignments</h2>${[...loads.loads].map(([rn,beds])=>`<p>${safe(rn)} · ${safe(beds.join(', '))}</p>`).join('')}<p>Unit note: ${safe(note||'—')}</p></article>`;
 const style=document.createElement('style');style.id='shift-print-style24';style.textContent='@media print{@page{size:A4 landscape;margin:10mm}.shift-print24{font:10px Arial,sans-serif;color:black}.shift-print24 h1{font-size:18px}.shift-print24 table{width:100%;border-collapse:collapse;table-layout:fixed}.shift-print24 th,.shift-print24 td{border:1px solid #666;padding:5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}.shift-print24 thead{display:table-header-group}.shift-print24 tr{break-inside:avoid}}';document.head.append(style);
 window.addEventListener('afterprint',()=>{style.remove();zone.innerHTML=''},{once:true});window.print();
}
function installWorkloadPolicy24(){
 if(page!=='team'||!canEdit()||document.getElementById('staff-policy24'))return;const panel=document.createElement('details');panel.className='section';panel.innerHTML=`<summary>Unit workload setting</summary><p class="sub">Enter the approved unit limit. No clinical staffing limit is assumed by the app.</p><form id="staff-policy24"><label>Maximum patients per RN<input id="staff-limit24" type="number" min="1" max="${groups.flatMap(g=>g.ids).length}" step="1" value="${staffingPolicy24.maxPatientsPerRN||''}" placeholder="Not configured"></label><button class="btn secondary">Save unit limit</button></form>`;main.querySelector('.schedule-controls3')?.after(panel);panel.querySelector('form').onsubmit=e=>{e.preventDefault();if(!canEdit()||saveBlocked)return;const raw=panel.querySelector('input').value,n=raw?Number(raw):null;if(n!==null&&(!Number.isInteger(n)||n<1||n>groups.flatMap(g=>g.ids).length))return;staffingPolicy24={maxPatientsPerRN:n};queueSave();render()};
}
let auditView24=0;
function auditScreen24(){
 main.innerHTML='<h2 class="title">Change history</h2><p class="sub">Database-confirmed changes since this feature was enabled. The actor is the signed-in account, not the manually entered initials.</p><p id="audit-status24" role="status"></p><div id="audit-list24"></div><button class="btn secondary quick-nav21" id="audit-more24">Load older changes</button>';
 if(!['admin','charge_nurse'].includes(member?.role)){document.getElementById('audit-status24').textContent='History access requires administrator or charge nurse.';document.getElementById('audit-more24').hidden=true;return;}
 const view=++auditView24;let cursor=null;
 const load=async()=>{const button=document.getElementById('audit-more24');button.disabled=true;try{
  const params=new URLSearchParams({unit_id:'eq.'+config.unitId,select:'revision,actor_name,at,changes,patient_context',order:'revision.desc',limit:'25'});if(cursor)params.set('revision','lt.'+cursor);
  const rows=await rest('kaash_change_history?'+params);if(view!==auditView24||page!=='audit24')return;
  document.getElementById('audit-list24').insertAdjacentHTML('beforeend',rows.map(row=>`<details class="section"><summary>Revision ${row.revision} · ${safe(row.actor_name)} · ${safe(kTime(new Date(row.at)))}</summary><p class="meta">${Object.values(row.patient_context||{}).map(patient=>safe(patient.name)+' · '+safe(patient.mrn)+' · '+safe(patient.bed)).join(' / ')}</p>${row.changes.map(change=>`<div class="section"><b>${safe(change.path)}</b><details><summary>Before / after</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">Before: ${safe(JSON.stringify(change.before,null,2))}\nAfter: ${safe(JSON.stringify(change.after,null,2))}</pre></details></div>`).join('')}</details>`).join(''));
  if(rows.length)cursor=rows.at(-1).revision;button.hidden=rows.length<25;document.getElementById('audit-status24').textContent=cursor?'Loaded through revision '+cursor:'No detailed changes recorded yet.';
 }catch(error){if(view===auditView24&&page==='audit24')document.getElementById('audit-status24').textContent=error.message+' Install 009_change_history.sql.';}finally{if(button.isConnected)button.disabled=false}};
 document.getElementById('audit-more24').onclick=()=>void load();void load();
}

async function exportUnitBackup24(password,onProgress){
 if(member?.role!=='admin')throw Error('Administrator role required.');if(dirty20())throw Error('Save pending changes before creating a database-confirmed backup.');
 const manifest=await rest('rpc/kaash_backup_manifest',{method:'POST',body:JSON.stringify({p_unit:config.unitId})});if(!manifest?.board)throw Error('Unit backup manifest is unavailable.');
 const writer=await createBackupWriter(password);await writer.add('manifest',manifest);const counts={records:0,audit:0,linen_moves:0};
 for(const section of ['records','audit','linen_moves']){
  let cursor=null;
  while(true){
   const params=new URLSearchParams({unit_id:'eq.'+config.unitId,limit:'25'});let table;
   if(section==='records'){table='kaash_records';params.set('select','unit_id,admission_key,data,archived_at');params.set('order','admission_key.asc');if(cursor)params.set('admission_key','gt.'+JSON.stringify(cursor.key));}
   else if(section==='audit'){table='kaash_change_history';params.set('select','unit_id,revision,actor,actor_name,at,changes,patient_context');params.set('order','revision.asc');params.set('revision','lte.'+manifest.revision);if(cursor)params.set('and','(revision.gt.'+cursor.revision+',revision.lte.'+manifest.revision+')');}
   else {table='kaash_linen_moves';params.set('select','*');params.set('order','at.asc,id.asc');if(cursor)params.set('or','(at.gt.'+cursor.at+',and(at.eq.'+cursor.at+',id.gt.'+cursor.id+'))');}
   const rows=await rest(table+'?'+params);if(!Array.isArray(rows))throw Error('Invalid backup page.');if(!rows.length)break;
   if(rows.some(row=>row.unit_id!==manifest.unit_id))throw Error('Backup page contains another unit.');
   await writer.add(section,rows);counts[section]+=rows.length;onProgress?.('Backing up '+section+' · '+counts[section]+' rows');
   const last=rows.at(-1);cursor={key:last.admission_key,revision:last.revision,at:last.at,id:last.id};if(rows.length<25)break;
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 }
 const after=await rest('rpc/kaash_backup_manifest',{method:'POST',body:JSON.stringify({p_unit:config.unitId})});
 const beforeToken=JSON.stringify([manifest.revision,manifest.records_count,manifest.audit_count,manifest.linen_moves_count,manifest.linen_stock]);
 const afterToken=JSON.stringify([after.revision,after.records_count,after.audit_count,after.linen_moves_count,after.linen_stock]);
 if(beforeToken!==afterToken)throw Error('Unit data changed while the backup was being read. No backup was downloaded. Retry during a quiet period.');
 for(const [key,property] of Object.entries({records:'records_count',audit:'audit_count',linen_moves:'linen_moves_count'})){if(counts[key]!==manifest[property])throw Error('Backup page counts do not match the database manifest.');}
 await writer.add('footer',{unit_id:manifest.unit_id,revision:manifest.revision,counts,chunks:writer.sequence});
 const blob=writer.finish();onProgress?.('Verifying the encrypted backup before download…');await verifyBackup(blob,password);
 return {blob,manifest};
}
function reportsTools24(){
 main.innerHTML=`<h2 class="title">Reports & backup</h2><section class="section"><h3>Shift report</h3><p class="sub">Current patients, RN/PCT assignment, pending work and handover status from the confirmed board.</p><select id="tools-shift24">${shifts3.map(shift=>`<option ${shift===currentShift3?'selected':''}>${shift}</option>`).join('')}</select><button class="btn secondary quick-nav21" id="tools-print24">Print shift report</button></section><section class="section"><h3>Recorded care indicators</h3><div id="quality-body24" role="status">Loading indicators…</div></section>${member?.role==='admin'?`<section class="section"><h3>Encrypted unit backup</h3><p class="sub">Includes patient board, archived admissions, change history and linen inventory. Accounts, passwords, printer settings and full database configuration are not included.</p><form id="backup-form24"><label>Backup passphrase<input id="backup-password24" type="password" minlength="12" required autocomplete="off"></label><button class="btn" type="submit">Create encrypted backup</button></form><p id="backup-status24" role="status"></p></section><section class="section"><h3>Verify restore file locally</h3><p class="sub">Decrypts and checks every page in this browser. It does not replace live data or prove restoration into PostgreSQL.</p><form id="verify-form24"><label>Backup file<input id="backup-file24" type="file" accept=".kaash" required></label><label>Backup passphrase<input id="verify-password24" type="password" minlength="12" required autocomplete="off"></label><button class="btn secondary" type="submit">Verify backup</button></form><p id="verify-status24" role="status"></p></section>`:'<section class="section">Unit backups require an administrator account.</section>'}`;
 document.getElementById('tools-print24').onclick=()=>printShift24(document.getElementById('tools-shift24').value);
 void rest('rpc/kaash_care_quality_report',{method:'POST',body:JSON.stringify({p_unit:config.unitId})}).then(report=>{
  const target=document.getElementById('quality-body24');if(page!=='tools24'||!target)return;
  target.innerHTML=`<div class="grid2">${metric('Mean recorded ICU stay',report.mean_stay_days===null?'N/A':report.mean_stay_days+' days')}${metric('Observed ICU return within 30 days',report.return_rate===null?'N/A':report.return_rate+'%')}</div><p class="sub">Last completed month: ${safe(report.period_start)} to ${safe(report.period_end)}. Stay duration uses ${report.duration_count} discharges with valid admission/discharge times; ${report.missing_duration} are not assessable.</p><p class="sub">Return rate: ${report.return_count}/${report.followup_count} discharged admissions with recorded discharge time and a full 30-day follow-up window. Same-unit MRN matching; repeat admissions are separate stays. This is limited to recorded data, not a validated hospital-wide outcome measure.</p>`;
 }).catch(error=>{const target=document.getElementById('quality-body24');if(page==='tools24'&&target)target.textContent=error.message+' Install 011_care_quality.sql.'});
 const backupForm=document.getElementById('backup-form24');if(backupForm)backupForm.onsubmit=async e=>{
  e.preventDefault();const button=backupForm.querySelector('button'),target=document.getElementById('backup-status24');button.disabled=true;
  try{if(dirty20())throw Error('Save pending changes before backing up.');let saveHandle=null;if(typeof window.showSaveFilePicker==='function')saveHandle=await window.showSaveFilePicker({suggestedName:'ICU-KAASH-'+today24()+'.kaash',types:[{description:'Encrypted ICU KAASH backup',accept:{'application/octet-stream':['.kaash']}}]});const password=document.getElementById('backup-password24').value;const {blob,manifest}=await exportUnitBackup24(password,message=>target.textContent=message);if(saveHandle){const writable=await saveHandle.createWritable();await writable.write(blob);await writable.close();document.getElementById('backup-password24').value='';target.textContent='Encrypted backup verified and saved to your selected file.';return;}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='ICU-KAASH-'+today24()+'-revision-'+manifest.revision+'.kaash';link.id='download-backup24';link.className='btn secondary';link.textContent='Download encrypted backup';const previous=document.getElementById('download-backup24');if(previous){URL.revokeObjectURL(previous.href);previous.remove()}target.after(link);document.getElementById('backup-password24').value='';target.textContent='Encrypted backup verified. Click Download encrypted backup to save the file. Store the file and passphrase separately.';}catch(error){target.textContent=error.message;}finally{button.disabled=false;}
 };
 const verifyForm=document.getElementById('verify-form24');if(verifyForm)verifyForm.onsubmit=async e=>{
  e.preventDefault();const button=verifyForm.querySelector('button'),target=document.getElementById('verify-status24');button.disabled=true;
  try{const file=document.getElementById('backup-file24').files[0];if(!file)throw Error('Choose a backup file.');const result=await verifyBackup(file,document.getElementById('verify-password24').value);document.getElementById('verify-password24').value='';target.textContent=`File verified: ${result.patients} active patients, ${result.counts.records} archived admissions, ${result.counts.audit} history entries and ${result.counts.linen_moves} linen movements. Revision ${result.revision}. No live data was changed.`;}catch(error){target.textContent=error.message;}finally{button.disabled=false;}
 };
}

function saveBadge24(){
 document.getElementById('patient-save-status21')?.remove();const fields=document.getElementById('patient-fields');if(!fields||!document.querySelector('#shade.show'))return;
 let badge=document.getElementById('save-badge24');if(!badge){badge=document.createElement('div');badge.id='save-badge24';badge.className='section';badge.setAttribute('role','status');fields.prepend(badge);}
 badge.textContent=cloudStatus.textContent+(lastSavedAt24?' · Last confirmed save '+kTime(new Date(lastSavedAt24)):'');
 badge.style.borderColor=saveBlocked?'#bd3f43':pending?'#bb8a20':'#b9cddd';
}
const statusBefore24=status;status=function(message){if(message.startsWith('Saved to Supabase'))lastSavedAt24=new Date().toISOString();statusBefore24(message);saveBadge24()};
function enhancePatient24(){
 saveBadge24();const form=document.getElementById('quick-admission21');if(form){form.oninput=()=>{if(canEdit()){formDraft24=true;status('Admission form draft · not saved yet.')}};form.addEventListener('submit',()=>setTimeout(()=>{if(!document.getElementById('quick-admission21'))formDraft24=false},0));}
 const discharge=document.getElementById('quick-discharge21');if(discharge&&canEdit()&&!selected?.status)discharge.onclick=()=>{
  if(dirty20()){status('Save pending changes before recording discharge.');return;}const patient=selected,box=document.createElement('section');box.className='section';const now=new Date(),local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now).replace(' ','T');
  box.innerHTML=`<h3>Record discharge</h3><form id="discharge-form24"><label>Actual discharge time · Riyadh<input id="discharge-time24" type="datetime-local" value="${safe(local)}" required></label><label>Disposition<select id="discharge-type24"><option value="">Choose disposition</option>${['Discharged','Transfer-out','Expired','DAMA','Absconded','Other'].map(type=>`<option>${type}</option>`).join('')}</select></label>${dischargeFields34()}<div class="label-tools"><button class="btn" type="submit">Confirm discharge to Records</button><button type="button" class="btn secondary" id="cancel-discharge34">Cancel discharge</button></div><p id="discharge-error24" role="status"></p></form>`;
  discharge.disabled=true;document.getElementById('patient-fields').append(box);box.scrollIntoView({block:'nearest'});
  box.querySelector('form').oninput=()=>{formDraft24=true;previewDischarge34(box)};
  box.querySelector('#cancel-discharge34').onclick=()=>{formDraft24=false;box.remove();discharge.disabled=false};
  box.querySelector('form').onsubmit=e=>{e.preventDefault();if(!canEdit()||saveBlocked)return;const at=instant24(box.querySelector('#discharge-time24').value),admit=instant24(admissionISO21(patient.doa)+'T'+patient.toa),type=box.querySelector('#discharge-type24').value;
   if(at===null||at>Date.now()+60000||(admit!==null&&at<admit)||!type){box.querySelector('#discharge-error24').textContent='Choose a valid discharge time and disposition. Discharge cannot precede admission or be in the future.';return;}
   ensureAdmission8(patient);const record={...patient,status:'Discharged',dischargedAt:date24(new Date(at).toISOString()),dischargedAtISO:new Date(at).toISOString(),dischargeType:type,dischargeDestination:readDischargeDestination34(box)};archivedRecords3.unshift(record);patients.splice(patients.indexOf(patient),1);formDraft24=false;queueSave();document.getElementById('shade').classList.remove('show');page='records';render();
  };
 };
}
const detailBefore24=detail;detail=function(){detailBefore24();enhancePatient24()};
const unifiedBefore24=patientUnified8;patientUnified8=function(){unifiedBefore24();enhancePatient24()};
document.addEventListener('click',e=>{if(!formDraft24)return;if(e.target.closest('#close,[data-quick21]')){if(!confirm('Discard the unsaved form fields?')){e.preventDefault();e.stopImmediatePropagation();return;}formDraft24=false;}},true);
function addNavigation24(){
 for(const [key,label] of [['ward24','Shift board'],['audit24','History'],['tools24','Reports']]){const button=document.createElement('button');button.className='tab';button.dataset.page=key;button.textContent=label;button.onclick=()=>{page=key;render()};document.querySelector('.tabs').append(button);}
}
addNavigation24();
const renderBefore24=render;render=function(){
 if(['ward24','audit24','tools24'].includes(page)){
  document.body.classList.remove('schedule-active4');main.classList.remove('cloud-labels');document.querySelectorAll('.tab').forEach(button=>button.classList.toggle('on',button.dataset.page===page));
  ({ward24:wardBoard24,audit24:auditScreen24,tools24:reportsTools24}[page])();window.scrollTo(0,0);
 }else{renderBefore24();installWorkloadPolicy24();}
 document.querySelector('[data-page="audit24"]').hidden=!['admin','charge_nurse'].includes(member?.role);
};

const secondaryPages24=new Set(['handover','labels','kardex','audit24','tools24']);
function moreScreen24(){
 const links=[['handover','Unit handover summary','Recorded unit census and care summary'],['labels','Labels','Patient, line and infusion labels'],['kardex','24h Kardex','Patient observations and 24-hour document'],['tools24','Reports & backup','Shift printing, recorded indicators and encrypted unit backup']];
 if(['admin','charge_nurse'].includes(member?.role))links.push(['audit24','Change history','Who saved a change, when and before/after values']);
 main.innerHTML='<h2 class="title">More tools</h2>'+links.map(([key,label,description])=>`<section class="section"><h3>${label}</h3><p class="sub">${description}</p><button class="btn secondary quick-nav21" data-more-page24="${key}">Open ${label}</button></section>`).join('');
 document.querySelectorAll('[data-more-page24]').forEach(button=>button.onclick=()=>{page=button.dataset.morePage24;render()});
}
const moreButton24=document.createElement('button');moreButton24.className='tab';moreButton24.dataset.page='more24';moreButton24.textContent='More';moreButton24.onclick=()=>{page='more24';render()};document.querySelector('.tabs').append(moreButton24);
const renderWithoutMore24=render;render=function(){
 if(page==='more24'){moreScreen24();document.querySelectorAll('.tab').forEach(button=>button.classList.toggle('on',button.dataset.page===page));window.scrollTo(0,0)}else renderWithoutMore24();
 for(const button of document.querySelectorAll('.tab'))if(secondaryPages24.has(button.dataset.page))button.hidden=true;
 moreButton24.classList.toggle('on',page==='more24'||secondaryPages24.has(page));
};

const teamBefore24=team;team=function(){teamBefore24();installStaffPanel20();installWorkloadPolicy24();applyReadOnly20()};

function reconcileCompletion24(submitted,returned){
 if(!Array.isArray(returned?.patients))return;
 for(const patient of submitted.patients){const confirmed=returned.patients.find(row=>row.admissionId===patient.admissionId);if(!confirmed)continue;
  for(const task of patient.tasks||[]){const saved=confirmed.tasks?.find(row=>row.id===task.id);if(!saved)continue;const current=patients.find(row=>row.admissionId===patient.admissionId)?.tasks?.find(row=>row.id===task.id);
   for(const key of ['completedAt','dueAtCompletion']){const before=task[key];if(Object.hasOwn(saved,key)){task[key]=saved[key];if(current&&current.status===task.status&&current[key]===before)current[key]=saved[key];}else{delete task[key];if(current&&current.status===task.status&&current[key]===before)delete current[key];}}
  }
 }
}
let onCallMonth26='';
function searchableStaff26(select,label){
 if(!select||select.dataset.searchable26)return;select.dataset.searchable26='true';
 const search=document.createElement('input');search.type='search';search.className='search';search.placeholder='Search '+label+' names';search.setAttribute('aria-label','Search '+label+' names');search.autocomplete='off';
 const options=[...select.options].map(option=>({value:option.value,text:option.textContent}));
 let chosen=select.value;select.addEventListener('change',()=>{chosen=select.value});
 select.before(search);search.oninput=()=>{const query=search.value.trim().toLowerCase();select.replaceChildren(...options.filter(option=>!option.value||option.value===chosen||option.text.toLowerCase().includes(query)).map(option=>new Option(option.text,option.value,false,option.value===chosen)));};
}
const openBedBefore26=openBedAssignment3;openBedAssignment3=function(bed){openBedBefore26(bed);const shade=document.querySelector('.assignment-overlay3');shade?.querySelectorAll('input[data-staff-search26]').forEach(input=>input.remove());for(const [id,label] of [['assignment-rn3','RN'],['assignment-pct3','PCT']]){const select=document.getElementById(id);delete select.dataset.searchable26;select.previousElementSibling?.matches('input[type="search"]')&&select.previousElementSibling.remove();searchableStaff26(select,label);select.previousElementSibling.dataset.staffSearch26='true';}};
function monthLabel26(month){return new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z'))}
function shiftMonth26(month,offset){const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+offset);return date.toISOString().slice(0,7)}
function installAttendance26(){
 if(page!=='team'||main.querySelector('#attendance-panel26'))return;
 const people=[...new Set([...staff,...pctNames,...Object.keys(shiftAttendance[currentShift3]||{})])].sort((a,b)=>a.localeCompare(b,'en'));
 const section=document.createElement('details');section.className='section';section.id='attendance-panel26';
 section.innerHTML=`<summary>Attendance & on-call · ${safe(currentShift3)} · ${safe(scheduleDate3)}</summary><p class="sub">Record each person’s status for the selected date and shift. Blank means not recorded.</p><label>Search staff names<input class="search" id="attendance-search26" type="search" placeholder="Search RN / PCT name"></label><div id="attendance-rows26">${people.map(name=>`<div class="row" data-person26="${safe(name.toLowerCase())}"><b>${safe(name)}</b><label><span class="sr-only26">Attendance for ${safe(name)}</span><select data-attendance26="${safe(name)}"><option value="">Not recorded</option>${['On Duty','Absent','On-call','Pull-out','FO'].map(state=>`<option ${shiftAttendance[currentShift3]?.[name]===state?'selected':''}>${state}</option>`).join('')}</select></label></div>`).join('')}</div><p id="attendance-empty26" hidden>No matching staff.</p>`;
 main.append(section);section.querySelector('#attendance-search26').oninput=e=>{const query=e.target.value.trim().toLowerCase();let visible=0;section.querySelectorAll('[data-person26]').forEach(row=>{row.hidden=!row.dataset.person26.includes(query);if(!row.hidden)visible++});section.querySelector('#attendance-empty26').hidden=visible>0;};
 section.querySelectorAll('[data-attendance26]').forEach(select=>{select.disabled=!canEdit();select.onchange=()=>{if(!canEdit())return;shiftAttendance[currentShift3]||={};if(select.value)shiftAttendance[currentShift3][select.dataset.attendance26]=select.value;else delete shiftAttendance[currentShift3][select.dataset.attendance26];queueSave();paintOnCall26();}});
}
function paintOnCall26(){
 const panel=document.getElementById('oncall-panel26');if(!panel)return;
 const report=onCallReport26(scheduleByDate4,scheduleDate3,shiftAttendance,onCallMonth26);panel.querySelector('#oncall-month-label26').textContent=monthLabel26(onCallMonth26);
 panel.querySelector('#oncall-summary26').innerHTML=`${metric('Recorded on-call shifts',report.shifts)}${metric('Staff with on-call',report.staff)}${metric('Days with any recorded attendance',report.recordedDays)}`;
 const query=panel.querySelector('#oncall-search26').value.trim().toLowerCase();const rows=report.people.filter(row=>row.name.toLowerCase().includes(query));
 panel.querySelector('#oncall-rows26').innerHTML=rows.map(row=>`<details class="section"><summary>${safe(row.name)} · ${row.shifts} shifts · ${row.days} days</summary>${row.entries.map(entry=>`<p>${safe(entry.date)} · ${safe(entry.shift)}</p>`).join('')}</details>`).join('')||'<p>No recorded on-call entries match this month/search.</p>';
}
function installOnCall26(){
 if(!['team','tools24'].includes(page)||main.querySelector('#oncall-panel26'))return;
 onCallMonth26||=today24().slice(0,7);const section=document.createElement('section');section.className='section';section.id='oncall-panel26';
 section.innerHTML='<h3>Monthly on-call report</h3><div class="label-tools"><button type="button" class="btn secondary" id="oncall-prev26" aria-label="Previous month">Previous month</button><b id="oncall-month-label26"></b><button type="button" class="btn secondary" id="oncall-next26" aria-label="Next month">Next month</button></div><div class="grid2" id="oncall-summary26"></div><p class="sub">One count per person, date and shift marked On-call. Two shifts on one date count as two shifts and one day. This counts recorded availability, not call-outs or hours. Missing attendance is excluded.</p><label>Search on-call names<input type="search" class="search" id="oncall-search26" placeholder="Search staff name"></label><div id="oncall-rows26"></div>';
 main.append(section);section.querySelector('#oncall-prev26').onclick=()=>{onCallMonth26=shiftMonth26(onCallMonth26,-1);paintOnCall26()};section.querySelector('#oncall-next26').onclick=()=>{onCallMonth26=shiftMonth26(onCallMonth26,1);paintOnCall26()};section.querySelector('#oncall-search26').oninput=paintOnCall26;paintOnCall26();
}
function enhanceAdmission26(){
 const form=document.getElementById('quick-admission21');if(!form||form.dataset.enhanced26)return;form.dataset.enhanced26='true';
 const button=form.querySelector('#admission-now26');if(button)button.onclick=()=>{const parts=new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).reduce((all,part)=>(all[part.type]=part.value,all),{});form.elements.namedItem('doa').value=parts.year+'-'+parts.month+'-'+parts.day;form.elements.namedItem('toa').value=parts.hour+':'+parts.minute;form.dispatchEvent(new Event('input',{bubbles:true}));};
}
function englishControls26(root=document){
 root.querySelectorAll('input[type="number"],input[type="time"],input[data-date-type],input[name="mrn"],input[name="toa"]').forEach(input=>{input.lang='en-GB-u-nu-latn';input.dir='ltr';if(input.type==='time'){input.type='text';input.placeholder='HH:mm';input.pattern='([01][0-9]|2[0-3]):[0-5][0-9]';}input.value=englishDigits26(input.value);});
}
document.addEventListener('input',e=>{const input=e.target;if(input.matches('input[name="mrn"],input[name="toa"],input[data-date-type],input[type="number"],input[data-key="mrn"],input[data-key="toa"]'))input.value=englishDigits26(input.value);},true);
const openBefore26=open;open=function(patient){if(!patient.name&&!patient.mrn)for(const key of ['patientType','pi','piStage','sedated','cancelled','corrected','dnrSystem'])patient[key]='';openBefore26(patient)};
const detailBefore26=detail;detail=function(){detailBefore26();enhanceAdmission26();englishControls26();};
const teamBefore26=team;team=function(){teamBefore26();main.querySelectorAll('[data-duty17],[data-duty3]').forEach(select=>searchableStaff26(select,'staff'));installAttendance26();installOnCall26();englishControls26();};
const renderBefore26=render;render=function(){renderBefore26();installOnCall26();enhanceAdmission26();englishControls26();};
const style26=document.createElement('style');style26.textContent='.sr-only26{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}[hidden]{display:none!important}.assignment-overlay3 input.search{width:100%;margin-bottom:6px}#attendance-rows26{max-height:380px;overflow:auto}#attendance-rows26 .row{gap:10px;align-items:center}#attendance-rows26 b{font-size:12px;overflow-wrap:anywhere}#attendance-rows26 select{min-width:125px}.duty-card3 input.search{min-width:0;width:100%;font-size:12px}.admission-optional26 summary{cursor:pointer;font-weight:600}#oncall-panel26 .label-tools{flex-wrap:wrap}';document.head.append(style26);

const detailBefore34=detail;detail=function(){detailBefore34();organizeAdmission34(document.getElementById('quick-admission21'));};
const themeSheet34=document.createElement('link');themeSheet34.rel='stylesheet';themeSheet34.href='/theme34.css';document.head.append(themeSheet34);
void initializeSession20();;



