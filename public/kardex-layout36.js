const normalized=value=>String(value||'').replace(/\s+/g,' ').trim();
const missing=value=>['','—','Not recorded','Not documented'].includes(normalized(value));

// Reflow the existing clinical document. Never deduplicate event/medication rows:
// two separately recorded events may legitimately have the same displayed values.
export function collectKardex36(html){
 const source=document.createElement('div');source.innerHTML=html;
 const pages=[...source.querySelectorAll('article.k7-page')],groups=[],overviewSeen=new Set();let duplicates=0;
 const collect=(element,title)=>{
  const group={id:groups.length,title,items:[],missing:[]};
  for(const child of element.children){
   if(child.tagName==='H3')continue;
   if(child.tagName==='TABLE'){
    const headings=[...child.querySelectorAll('thead th')].map(el=>normalized(el.textContent));
    const pairs=headings.length===2&&headings[0]==='Item'&&headings[1]==='Details';
    const rows=[],overview=[];
    for(const original of child.querySelectorAll('tbody>tr')){
     const cells=[...original.children];
     if(cells.length===1&&missing(cells[0].textContent)){group.missing.push('No entries documented');continue;}
     if(pairs&&cells.length===2){
      const label=normalized(cells[0].textContent);
      let displayed=cells[1].textContent;
      if(label==='Handover')displayed=displayed.split('\n').filter(line=>!['Day','Evening','Night'].includes(line.trim())).join('\n');
      const value=normalized(displayed);
      if(missing(value)){group.missing.push(label);continue;}
      const key=label+'\u0000'+value;
      if(overviewSeen.has(key)){duplicates++;continue;}overviewSeen.add(key);
      const p=document.createElement('p');p.className='k36-overview';const b=document.createElement('b');b.textContent=label+': ';p.append(b,document.createTextNode(displayed));overview.push({type:'paragraph',html:p.outerHTML});continue;
     }
     rows.push(original.outerHTML);
    }
    group.items.push(...overview);
    if(rows.length)group.items.push({type:'table',head:child.querySelector('thead')?.outerHTML||'',rows});
   }else if(child.tagName==='P'){
    if(normalized(child.textContent)){const p=child.cloneNode(true);if(title==='Daily goals'&&normalized(p.firstElementChild?.textContent)==='Daily goals:')p.firstElementChild.remove();group.items.push({type:'paragraph',html:p.outerHTML});}
   }
  }
  if(group.missing.length){const p=document.createElement('p');p.className='k36-missing';p.textContent='Not recorded: '+[...new Set(group.missing)].join('; ')+'.';group.items.push({type:'paragraph',html:p.outerHTML});}
  if(group.items.length)groups.push(group);
 };
 for(const page of pages)for(const child of page.children){
  if(child.tagName==='SECTION')collect(child,child.querySelector('h3')?.textContent||'Clinical information');
  else if(child.classList.contains('k7-columns'))for(const section of child.children)collect(section,section.querySelector('h3')?.textContent||'Clinical information');
  else if(child.tagName==='P'){const wrapper=document.createElement('div');wrapper.append(child.cloneNode(true));collect(wrapper,'Daily goals');}
 }
 return {pages,groups,duplicates};
}

export function fitKardex36(zone,html,{paper='A4'}={}){
 paper=paper==='A3'?'A3':'A4';
 const model=collectKardex36(html);if(model.pages.length!==2)return {ok:false,error:'Invalid Kardex document.'};
 const build=density=>{
  zone.replaceChildren();zone.classList.add('k36-zone');const columns=[];
  for(let i=0;i<2;i++){
   const page=document.createElement('article');page.className='k7-page k36-page';page.dataset.density36=density;page.dataset.paper36=paper;
   const template=model.pages[i];for(const selector of ['header','.k7-id','.k7-alert']){const el=template.querySelector(selector);if(el)page.append(el.cloneNode(true));}
   const body=document.createElement('div');body.className='k36-columns';
   for(let j=0;j<2;j++){const col=document.createElement('div');col.className='k36-column';body.append(col);columns.push(col);}page.append(body);
   const foot=template.querySelector('footer')?.cloneNode(true)||document.createElement('footer');foot.classList.add('k36-footer');page.append(foot);zone.append(page);
  }
  let column=0,currentGroup=null,currentBlock=null;
  const fits=()=>columns[column].scrollHeight<=columns[column].clientHeight+1&&columns[column].scrollWidth<=columns[column].clientWidth+1;
  const next=()=>{column++;currentGroup=null;currentBlock=null;return column<columns.length;};
  const block=group=>{
   if(currentGroup===group.id)return currentBlock;
   const continued=columns.some(col=>[...col.children].some(section=>section.dataset.section36===String(group.id)&&section.children.length>1));
   const section=document.createElement('section');section.className='k36-section';section.dataset.section36=String(group.id);const title=document.createElement('h3');title.textContent=group.title+(continued?' (continued)':'');section.append(title);columns[column].append(section);currentGroup=group.id;currentBlock=section;return section;
  };
  const cleanEmpty=section=>{if(section.children.length===1){section.remove();currentGroup=null;currentBlock=null;}};
  for(const group of model.groups)for(const [itemIndex,item] of group.items.entries()){
   if(item.type==='paragraph'){
    let section=block(group);const p=document.createElement('div');p.innerHTML=item.html;const el=p.firstElementChild;section.append(el);
    const tableFollows=group.items[itemIndex+1]?.type==='table';
    const remaining=columns[column].getBoundingClientRect().bottom-section.getBoundingClientRect().bottom;
    if(!fits()||(tableFollows&&remaining<50)){el.remove();cleanEmpty(section);if(!next())return false;section=block(group);section.append(el);if(!fits())return false;}
   }else{
    let section=block(group),table=document.createElement('table');table.className='k7-table k36-table';table.innerHTML=item.head+'<tbody></tbody>';section.append(table);
    for(const row of item.rows){
     table.tBodies[0].insertAdjacentHTML('beforeend',row);
     if(!fits()){
      const pending=table.tBodies[0].lastElementChild;pending.remove();if(!table.tBodies[0].children.length)table.remove();cleanEmpty(section);
      if(!next())return false;section=block(group);table=document.createElement('table');table.className='k7-table k36-table';table.innerHTML=item.head+'<tbody></tbody>';section.append(table);table.tBodies[0].append(pending);if(!fits())return false;
     }
    }
   }
  }
  return [...zone.querySelectorAll('.k36-page')].every(page=>page.scrollHeight<=page.clientHeight+1&&page.scrollWidth<=page.clientWidth+1);
 };
 for(const density of ['comfortable','compact','dense'])if(build(density))return {ok:true,density,paper,duplicates:model.duplicates};
 zone.replaceChildren();return {ok:false,error:'The complete record exceeds two readable '+paper+' pages. No data was removed or clipped. '+(paper==='A4'?'Choose A3 for a larger two-page document, or retain a separate full record.':'A separate full record is required for this volume of information.')};
}
