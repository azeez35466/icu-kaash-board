let saveTimer18,conflictBlocked20=false;
let config,session,member,boardRevision=0,serverFingerprint='',pending=false,saveBlocked=false;
const gate=document.createElement('div');gate.className='production-gate';gate.innerHTML='<div class="production-login"><img class="cluster-logo" src="/taif-logo.jpg" alt="Taif Health Cluster"><h1>ICU KAASH</h1><p>Secure pilot · Patient & Census Management</p><div id="login-content">Loading configuration…</div></div>';document.body.append(gate);
const cloudStatus=document.createElement('div');cloudStatus.className='demo-banner';cloudStatus.setAttribute('role','status');
const authHeaders=()=>({apikey:config.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'});
function clone(value){return JSON.parse(JSON.stringify(value))}
function captureBoard(){return clone({patients:patients.filter(p=>p.name&&p.mrn),archivedRecords:archivedRecords3,staffDirectory:{rn:staff,pct:pctNames},shiftRNs,shiftPCTs,shiftAcuity,shiftSide,shiftAttendance,shiftDuties3,scheduleByDate4,scheduleDate:scheduleDate3,linen,linenByDate:linenByDate3,kardexDrafts,counts,note})}
function installBoard(data){if(data.staffDirectory){staff.splice(0,staff.length,...(data.staffDirectory.rn||[]));pctNames.splice(0,pctNames.length,...(data.staffDirectory.pct||[]))}else{const names=map=>[...new Set(Object.values(map||{}).flatMap(shift=>Object.values(shift||{})).filter(Boolean))];staff.splice(0,staff.length,...names(data.shiftRNs));pctNames.splice(0,pctNames.length,...names(data.shiftPCTs))}patients.splice(0,patients.length,...(data.patients||[]));patients.forEach(ensureAdmission8);archivedRecords3=data.archivedRecords||[];const empty=()=>({Day:{},Evening:{},Night:{}});shiftRNs=data.shiftRNs||empty();shiftPCTs=data.shiftPCTs||empty();shiftAcuity=data.shiftAcuity||empty();shiftSide=data.shiftSide||empty();shiftAttendance=data.shiftAttendance||empty();shiftDuties3=data.shiftDuties3||empty();scheduleByDate4=data.scheduleByDate4||{};if(data.scheduleDate)scheduleDate3=data.scheduleDate;linen=data.linen||{date:scheduleDate3,Day:{gowns:0,blankets:0,sheets:0},Evening:{gowns:0,blankets:0,sheets:0},Night:{gowns:0,blankets:0,sheets:0}};linenByDate3=data.linenByDate||{};kardexDrafts=data.kardexDrafts||{};counts=data.counts||Object.fromEntries(Object.keys(counts).map(key=>[key,0]));note=data.note||''}
function status(message){cloudStatus.textContent=message}
const canEdit=()=>['admin','doctor','charge_nurse'].includes(member?.role);
async function sync(){if(pending||saveBlocked)return;if(!canEdit()){status('Read-only role. Changes have not been saved.');return}pending=true;try{let next=captureBoard(),fingerprint=JSON.stringify(next);while(fingerprint!==serverFingerprint){status('Saving to Supabase…');const result=await rest('kaash_boards?unit_id=eq.'+encodeURIComponent(config.unitId)+'&revision=eq.'+boardRevision,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data:next,revision:boardRevision+1})});if(!result.length){saveBlocked=true;conflictBlocked20=true;throw Error('Another user updated the board. Your changes are unsaved. Export your draft, then reload to review the current board.')}boardRevision=result[0].revision;
if(Array.isArray(result[0].data?.archivedRecords)&&result[0].data.archivedRecords.length===0){
 const savedArchives=new Set(next.archivedRecords.map(record=>JSON.stringify(record)));
 archivedRecords3=archivedRecords3.filter(record=>!savedArchives.has(JSON.stringify(record)));
 next.archivedRecords=[];fingerprint=JSON.stringify(next);
}
serverFingerprint=fingerprint;next=captureBoard();fingerprint=JSON.stringify(next)}status('Saved to Supabase · '+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'}).format(new Date())+' · revision '+boardRevision)}catch(e){saveBlocked=true;status(e.message+' Keep this page open.');document.body.classList.add('save-blocked')}finally{pending=false}}
function queueSave(){if(session&&Date.now()>=sessionDeadline20){expireSession20();return}if(saveBlocked){status('Saving is blocked. Retry save or reload after exporting your draft.');return}if(!session){status('Sign in required.');return}if(!canEdit()){status('Read-only access.');return}scheduleByDate4[scheduleDate3]=staffingSnapshot4();linenByDate3[linen.date]=clone(linen);clearTimeout(saveTimer18);status('Changes pending…');saveTimer18=setTimeout(()=>void sync(),200)}
function installCloudPersistence(){savePreview3=queueSave;persist8=()=>{if(!canEdit()||saveBlocked)return false;queueSave();return true};kPersist=()=>{if(!canEdit()||saveBlocked)return false;queueSave();return true};}
function installToolbar(){document.querySelectorAll('.production-toolbar').forEach(el=>el.remove());const bar=document.createElement('div');bar.className='production-toolbar';bar.innerHTML='<button id="retry-save20">Retry save</button><button id="cloud-reload">Reload latest board</button><button id="export-draft">Export unsaved draft</button><button id="sign-out">Sign out</button>';document.querySelector('.top').after(bar);document.getElementById('retry-save20').hidden=!canEdit();document.getElementById('retry-save20').onclick=()=>{if(conflictBlocked20){status('Revision conflict. Export your draft, then reload the current board.');return}saveBlocked=false;document.body.classList.remove('save-blocked');void sync()};document.getElementById('cloud-reload').onclick=()=>{if(pending||saveBlocked||JSON.stringify(captureBoard())!==serverFingerprint){if(!confirm('Reloading discards unsaved changes. Export the draft first if needed. Reload now?'))return}location.reload()};document.getElementById('export-draft').onclick=()=>{const blob=new Blob([JSON.stringify(captureBoard(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ICU_KAASH_unsaved_draft.json';a.click();URL.revokeObjectURL(url)};document.getElementById('sign-out').onclick=async()=>{if(pending||saveBlocked||JSON.stringify(captureBoard())!==serverFingerprint){if(!confirm('Sign out with unsaved changes? Export your draft first if needed.'))return}try{await fetch(config.url+'/auth/v1/logout',{method:'POST',headers:authHeaders()})}finally{session=null;member=null;clearSession20();clearTimeout(saveTimer18);location.reload()}}}
// Real patient data stay in memory; this runtime never saves them to localStorage.
document.addEventListener('click',e=>{if(!session)return;const button=e.target.closest('#save,#save-unified8,#archive-discharge3');if(button&&selected&&(!selected.name?.trim()||!selected.mrn?.trim())){e.preventDefault();e.stopImmediatePropagation();alert('Patient name and MRN are required.')}if(!canEdit()&&e.target.closest('button,input,select,textarea')&&!e.target.closest('.top,.tabs,.production-toolbar,.production-gate')&&!e.target.closest('.tab')&&!e.target.closest('[data-open],.bed,#close,.switch,#open-unified8,#patient-kardex6,#unified-kardex8,#back-profile8,[data-workflow-open8],[data-record18],#record-search3,#records-prev18,#records-next18,#search11,[data-result-open11],[data-sched-view3],[data-shift3],[data-cal-open],[data-cal-move],[data-cal-day]')&&page!=='labels'){e.preventDefault();e.stopImmediatePropagation();status('This account has read-only access.')}},true);
window.addEventListener('beforeunload',e=>{if(session&&(pending||saveBlocked||JSON.stringify(captureBoard())!==serverFingerprint)){e.preventDefault();e.returnValue=''}});
async function queueLabel(){if(!session||!['admin','doctor','charge_nurse'].includes(member.role))throw Error('Print permission is required');const patient=active().find(p=>p.bed===labelDraft.bed);if(!patient?.name||!patient.mrn)throw Error('Choose a patient with name and MRN');const printers=await rest('kaash_printers?unit_id=eq.'+config.unitId+'&enabled=eq.true&select=id,name,model,width_mm,height_mm');if(!printers.length)throw Error('No enabled printer. Configure printer IP, exact label size and 203 dpi first.');const picker=document.getElementById('cloud-printer');if(!picker){throw Error('Select a configured printer from the network print panel.')}const printer=printers.find(p=>p.id===picker.value);if(!printer)throw Error('Choose printer');const id=crypto.randomUUID();await rest('kaash_print_jobs',{method:'POST',body:JSON.stringify({id,unit_id:config.unitId,printer_id:printer.id,payload:{...labelDraft,patientName:patient.name,mrn:patient.mrn}})});return id}
const labelsBeforeCloud=labels5;labels5=function(){labelsBeforeCloud();main.classList.add('cloud-labels');const panel=document.createElement('div');panel.className='section';panel.innerHTML='<h3>Network EPL printing</h3><select id="cloud-printer"><option value="">Loading configured printers…</option></select><button class="btn" id="network-print">Queue EPL label</button><p id="network-print-status" role="status">Uses the hospital print bridge. Sent means delivered to the printer socket, not physical print confirmation.</p>';document.getElementById('label-preview').parentElement.append(panel);void rest('kaash_printers?unit_id=eq.'+config.unitId+'&enabled=eq.true&select=id,name,model,width_mm,height_mm').then(printers=>{const picker=document.getElementById('cloud-printer');if(picker)picker.innerHTML='<option value="">Choose network printer</option>'+printers.map(p=>`<option value="${safe(p.id)}">${safe(p.name)} · ${safe(p.model)} · ${p.width_mm} × ${p.height_mm} mm</option>`).join('')}).catch(e=>{const out=document.getElementById('network-print-status');if(out)out.textContent=e.message});document.getElementById('network-print').onclick=async e=>{e.target.disabled=true;try{const id=await queueLabel();document.getElementById('network-print-status').textContent='Queued · job '+id}catch(error){document.getElementById('network-print-status').textContent=error.message}finally{e.target.disabled=false}}};
const cloudRenderBefore=render;render=function(){main.classList.toggle('cloud-labels',page==='labels');cloudRenderBefore();installStaffPanel20();updateHeader20();applyReadOnly20()};

// Archives are fetched on demand. Only 50 records are rendered at a time.
let recordsRequest18=0;
medicalRecords3=function(){
 const request=++recordsRequest18;
 main.innerHTML='<h2 class="title">Medical records</h2><p class="sub">Database archive · 50 records per page</p><input class="search" id="record-search3" placeholder="Search name, MRN, bed or diagnosis"><div id="record-status18" role="status"></div><div id="records-list3"></div><button class="btn secondary" id="records-prev18" disabled>Previous</button> <button class="btn secondary" id="records-next18" disabled>Next</button>';
 let cursor=null,history=[],rows=[],nextCursor=null,timer,version=0;
 const load=async()=>{
  const current=++version;
  const query=document.getElementById('record-search3').value.trim();
  const statusEl=document.getElementById('record-status18');statusEl.textContent='Loading records…';
  const params=new URLSearchParams({unit_id:'eq.'+config.unitId,select:'data,archived_at,admission_key',order:'archived_at.desc,admission_key.desc',limit:'51'});
  const conditions=[];
  if(query)params.set('search_document','wfts(simple).'+query);
  if(cursor)conditions.push('or(archived_at.lt.'+cursor.at+',and(archived_at.eq.'+cursor.at+',admission_key.lt."'+cursor.key.replace(/["\\]/g,'')+'"))');
  if(conditions.length)params.set('and','('+conditions.join(',')+')');
  try{
   const result=await rest('kaash_records?'+params);
   if(request!==recordsRequest18||current!==version||page!=='records')return;
   rows=result.slice(0,50);const last=rows.at(-1);nextCursor=result.length>50?{at:last.archived_at,key:last.admission_key}:null;
   document.getElementById('records-list3').innerHTML=rows.map(({data:p},i)=>`<article class="card"><div class="label">${safe(p.bed)} · ${safe(p.status||'Discharged')}</div><h3>${safe(p.name)}</h3><p class="meta">MRN ${safe(p.mrn)} · Admitted ${safe(p.doa||'—')} · Discharged ${safe(p.dischargedAt||'—')}</p><p>${safe(p.diagnosis||'')}</p><button class="btn secondary" data-record18="${i}">Open record</button></article>`).join('')||'<p>No matching records.</p>';
   document.querySelectorAll('[data-record18]').forEach(button=>button.onclick=()=>{
    open(clone(rows[+button.dataset.record18].data));
    const fields=document.getElementById('patient-fields');if(fields){fields.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);fields.insertAdjacentHTML('afterbegin','<p class="sub">Archived record · read only</p>');}
   });
   statusEl.textContent='Page '+(history.length+1)+' · '+rows.length+' records';
   document.getElementById('records-prev18').disabled=!history.length;
   document.getElementById('records-next18').disabled=!nextCursor;
  }catch(error){if(current===version&&request===recordsRequest18&&page==='records')statusEl.textContent=error.message+' Ensure the archive database update has been installed.';}
 };
 document.getElementById('record-search3').oninput=()=>{clearTimeout(timer);++version;cursor=null;history=[];timer=setTimeout(load,300)};
 document.getElementById('records-next18').onclick=()=>{if(!nextCursor)return;history.push(cursor);cursor=nextCursor;void load()};
 document.getElementById('records-prev18').onclick=()=>{if(!history.length)return;cursor=history.pop();void load()};
 void load();
};

const SESSION_KEY20='kaash-session-v2',SESSION_DURATION20=60*60*1000;
let sessionDeadline20=0,refreshPromise20=null,sessionTimer20,expiredDraft20=false;
function storeSession20(){try{sessionStorage.setItem(SESSION_KEY20,JSON.stringify({url:config.url,unit:config.unitId,session,deadline:sessionDeadline20}))}catch{status('Session active; browser storage unavailable. Reload will require sign-in.')}}
function clearSession20(){try{sessionStorage.removeItem(SESSION_KEY20)}catch{}clearTimeout(sessionTimer20)}
function dirty20(){return pending||saveBlocked||JSON.stringify(captureBoard())!==serverFingerprint}
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
 const response=await fetch(config.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await readJSON20(response,'Authentication');if(!response.ok)throw Error(data?.msg||data?.error_description||'Authentication failed');return data;
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
 await refreshSession();
 const response=await fetch(config.url+'/rest/v1/'+path,{...options,headers:{...authHeaders(),...(options.headers||{})},signal:options.signal||AbortSignal.timeout(20000)});
 const data=response.status===204?null:await readJSON20(response,'Database');
 if(!response.ok){
  if(response.status===401){expireSession20('Session could not be validated. Sign in again.');throw Error('Sign in again. Unsaved changes have not been discarded.');}
  const error=Error('Database request failed ('+response.status+'). '+(data?.message||'No successful save has been confirmed.'));error.code=data?.code;throw error;
 }
 return data;
}
async function enterApp20(){
 const memberships=await rest('kaash_members?unit_id=eq.'+encodeURIComponent(config.unitId)+'&select=role');
 if(!memberships.length||memberships[0].role==='print_agent')throw Error('No application membership for this unit.');member=memberships[0];
 const rows=await rest('kaash_boards?unit_id=eq.'+encodeURIComponent(config.unitId)+'&select=data,revision');if(!rows.length)throw Error('Unit board is not initialized.');
 installBoard(rows[0].data);boardRevision=rows[0].revision;serverFingerprint=JSON.stringify(captureBoard());saveBlocked=false;conflictBlocked20=false;pending=false;expiredDraft20=false;
 installCloudPersistence();document.getElementById('save-status11')?.remove();document.querySelector('.top').after(cloudStatus);
 document.body.classList.remove('auth-locked','save-blocked');document.body.classList.toggle('read-only',!canEdit());gate.remove();
 page='census';render();installToolbar();storeSession20();armSession20();status((canEdit()?'Connected':'Read-only')+' · '+member.role+' · one-hour session');
}
function loginForm(message=''){
 document.getElementById('login-content').innerHTML=`<p role="status">${safe(message)}</p><form id="login-form"><label>Email<input type="email" name="email" autocomplete="username" required></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button type="submit">Sign in · 1 hour</button></form>`;
 document.getElementById('login-form').onsubmit=async e=>{
  e.preventDefault();if(expiredDraft20&&!confirm('Signing in reloads the database and discards the in-memory draft. Have you exported your unsaved changes?'))return;
  const form=e.target;form.querySelector('button').disabled=true;
  try{session=await authRequest('token?grant_type=password',{email:form.elements.email.value.trim(),password:form.elements.password.value});session.expires_at=Math.floor(Date.now()/1000)+session.expires_in;sessionDeadline20=Date.now()+SESSION_DURATION20;form.elements.password.value='';await enterApp20();}
  catch(error){session=null;clearSession20();loginForm(error.message)}
 };
}
async function initializeSession20(){
 try{
  const response=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(15000)});const data=await readJSON20(response,'Configuration');if(!response.ok)throw Error(data?.error||'Configuration unavailable');config=data;
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
 document.querySelectorAll('#main input,#main select,#main textarea,#patient-fields input,#patient-fields select,#patient-fields textarea,.assignment-overlay3 input,.assignment-overlay3 select').forEach(el=>{if(!el.matches('#record-search3,#search11,#q,.search,#cloud-printer'))el.disabled=true});
 main.querySelectorAll('[data-edit-bed3],[data-duty17],#other-duty17,#network-print').forEach(el=>el.disabled=true);
}
document.addEventListener('input',e=>{if(member&&!canEdit()&&e.target.closest('#patient-fields,.assignment-overlay3')){e.preventDefault();e.stopImmediatePropagation()}},true);
function installStaffPanel20(){
 if(page!=='team')return;
 const section=document.createElement('section');section.className='section';
 section.innerHTML=`<div class="secthead"><h3>Staff directory</h3><small>${staff.length} RN · ${pctNames.length} PCT</small></div>${canEdit()?'<details><summary class="btn secondary">Add staff</summary><form id="add-staff20" class="fields" style="margin-top:10px"><div class="field"><label>Staff name<input id="staff-name20" maxlength="80" required autocomplete="off"></label></div><div class="field"><label>Role<select id="staff-role20"><option value="rn">RN</option><option value="pct">PCT</option></select></label></div><button class="btn" type="submit">Add</button><p id="staff-message20" role="status"></p></form></details>':'<p class="sub">Staff directory managed by the charge nurse.</p>'}`;
 main.querySelector('.schedule-controls3')?.before(section);
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
void initializeSession20();
