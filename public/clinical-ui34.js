import {englishDigits26} from './workflow26.js';
const clean=(value,max)=>englishDigits26(typeof value==='string'?value.trim():'').slice(0,max);
export function dischargeDestination34(department='',room='',bed=''){
 return {department:clean(department,80),room:clean(room,32),bed:clean(bed,32)};
}
export function destinationLabel34(record){
 const d=record?.dischargeDestination;if(!d||typeof d!=='object')return '';
 const value=dischargeDestination34(d.department,d.room,d.bed);
 return [value.department,value.room?'Room '+value.room:'',value.bed?'Bed '+value.bed:''].filter(Boolean).join(' · ');
}
export function dischargeFields34(){return `<fieldset class="discharge-destination34"><legend>Discharge destination</legend><p class="sub">Optional · unit / ward, room and bed. Example: MS5 · Room 260 · Bed 1.</p><div class="fields"><div class="field wide"><label>Destination unit / ward<input id="discharge-department34" maxlength="80" placeholder="MS5, another hospital, or home" autocomplete="off"></label></div><div class="field"><label>Room<input id="discharge-room34" maxlength="32" placeholder="260" dir="ltr" autocomplete="off"></label></div><div class="field"><label>Destination bed<input id="discharge-bed34" maxlength="32" placeholder="1" dir="ltr" autocomplete="off"></label></div></div><p class="destination-preview34" id="discharge-preview34" role="status">Destination not documented.</p></fieldset>`;}
export function readDischargeDestination34(box){return dischargeDestination34(box.querySelector('#discharge-department34').value,box.querySelector('#discharge-room34').value,box.querySelector('#discharge-bed34').value);}
export function previewDischarge34(box){const target=box.querySelector('#discharge-preview34');target.textContent=destinationLabel34({dischargeDestination:readDischargeDestination34(box)})||'Destination not documented.';}
export function organizeAdmission34(form){
 if(!form||form.dataset.organized34)return;form.dataset.organized34='true';form.classList.add('admission-form34');
 const original=form.querySelector('.admission-optional26'),rows=original?.querySelector('.fields'),identity=form.querySelector(':scope > .fields');if(!original||!rows||!identity)return;
 const field=key=>form.elements.namedItem(key)?.closest('.field');
 const header=form.parentElement.querySelector('h3');if(header)header.textContent='Patient admission';
 const description=form.parentElement.querySelector('p.sub');if(description)description.textContent='Patient name and MRN are required. Add other documented details now or complete them later.';
 const identityBox=document.createElement('fieldset');identityBox.className='admission-identity34';const legend=document.createElement('legend');legend.textContent='1 · Patient identity';identity.before(identityBox);identityBox.append(legend,identity);
 for(const key of ['age','gender']){const node=field(key);if(node)identity.append(node)}
 original.querySelector('summary').textContent='2 · Admission details (optional)';
 for(const key of ['doa','toa','diagnosis','admissionSource','patientType']){const node=field(key);if(node)rows.append(node)}
 const care=document.createElement('details');care.className='section admission-care34';care.innerHTML='<summary>3 · Current care (optional)</summary><p class="sub">Choose only what is documented. Blank means not documented.</p><div class="fields"></div>';
 for(const key of ['code','oxygen','precautions']){const node=field(key);if(node)care.querySelector('.fields').append(node)}original.after(care);
 const submit=form.querySelector('button[type=submit]');if(submit){const footer=document.createElement('div');footer.className='admission-actions34';submit.before(footer);footer.append(submit);const cancel=document.createElement('button');cancel.type='button';cancel.className='btn secondary quick-nav21';cancel.textContent='Cancel';cancel.onclick=()=>document.getElementById('close')?.click();footer.append(cancel);}
 for(const input of form.querySelectorAll('input'))input.autocomplete='off';
 form.addEventListener('invalid',event=>{const details=event.target.closest('details');if(details)details.open=true;},true);
}
