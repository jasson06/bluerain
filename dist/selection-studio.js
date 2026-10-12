(() => {
'use strict';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const client = params.get('mode') === 'client';
if (params.get('embed') === '1') document.body.classList.add('embedded');

const money = value => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(Number(value)||0);
const normalized = value => String(value||'').trim().toLowerCase().replace(/[-\s]+/g,' ');
const pretty = value => String(value).replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const safeUrl = value => { try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
let productDestination='library', productRoom='', editingRoom=null;
let hiddenRooms=[];
const rememberHidden=name=>{if(!hiddenRooms.includes(normalized(name)))hiddenRooms.push(normalized(name));try{localStorage.setItem('hiddenSelectionRooms:'+projectId,JSON.stringify(hiddenRooms));}catch{}};
let projectId, products=[], boards=[], room='', busy=false, onlyFavorites=false;
let additionalRooms=[]; if(!client){try{additionalRooms=JSON.parse(localStorage.getItem('additionalRooms')||'[]');if(!Array.isArray(additionalRooms))additionalRooms=[];}catch{}}
let favorites=[];
try { favorites=JSON.parse(localStorage.getItem('likedProducts')||'[]'); if(!Array.isArray(favorites)) favorites=[]; } catch {}
const notify=(message,error=false)=>{ $('status').textContent=message; $('status').classList.toggle('error',error); if($('product-dialog').open){$('product-notice').textContent=message;$('product-notice').classList.toggle('error',error);} };
const el=(tag,text,className)=>{ const node=document.createElement(tag); if(text!==undefined)node.textContent=text; if(className)node.className=className; return node; };
const button=(label,action)=>{ const node=el('button',label); node.type='button'; node.onclick=action; return node; };
async function api(url,options) { const response=await fetch(url,options); if(!response.ok)throw new Error('Unable to save or load selections. Please try again.'); return response.json(); }
const getBoards=()=>api('/api/selection-boards?projectId='+encodeURIComponent(projectId));
const currentBoard=()=>boards.find(b=>normalized(b.room)===normalized(room));
const selections=()=>currentBoard()?.selections||[];
const identity=p=>p.link||p._id||p.name;
const isSelected=p=>selections().some(s=>identity(s)===identity(p));
async function task(action) {
 if(busy)return; busy=true;
 document.querySelectorAll('button').forEach(b=>b.disabled=true);
 try { await action(); } catch(error){notify(error.message,true);}
 finally {busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);render();}
}
async function save(targetRoom,items) {
 return api('/api/selection-board',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,room:targetRoom,selections:items})});
}
function empty(container,title,description) {const box=el('div',undefined,'empty');box.append(el('strong',title),el('p',description));container.append(box);}
function imageUrls(product) {
 const raw=[product.photo,product.image,product.images].flat(2);
 const urls=raw.map(value=>typeof value==='string'?value:(value?.url||value?.src||''))
 .map(value=>{try{if(!value.trim())return '';const url=new URL(value.trim(),location.origin+'/');return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}}).filter(Boolean);
 return [...new Set(urls)];
}
function productImage(product) {
 const media=el('div',undefined,'image'), urls=imageUrls(product);
 function fallback(){const box=el('div',undefined,'image-fallback');box.append(el('span','◇'),el('small','Image unavailable'));media.replaceChildren(box);}
 if(!urls.length){fallback();return media;}
 const img=el('img');img.alt=product.name||'Product image';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
 let index=0;img.onerror=()=>{if(++index<urls.length)img.src=urls[index];else fallback();};img.src=urls[0];media.append(img);return media;
}
function fixtureHeading(product) {
 const heading=el('h3');heading.title=String(product.name||'Unnamed fixture');
 const name=String(product.name||'Unnamed fixture').trim()||'Unnamed fixture';
 const url=safeUrl(product.link);
 if(url){const link=el('a',name,'fixture-link');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.title='View '+name+' (opens in a new tab)';heading.append(link);}
 else heading.textContent=name;
 return heading;
}
function showDetails(product) {
 const content=$('detail-content'); content.replaceChildren();
 content.append(productImage(product));
 content.append(fixtureHeading(product),el('p',money(product.price)),el('p',product.description));

 $('details').showModal();
}
function card(product,saved) {
 const node=el('article',undefined,'card'), media=productImage(product);
 const body=el('div',undefined,'card-body');body.append(fixtureHeading(product),el('div',money(product.price),'price'));
 const actions=el('div',undefined,'card-actions');
 actions.append(button('Details',()=>showDetails(product)));
 const favorite=button(favorites.includes(product.link)?'♥':'♡',()=>{
 favorites=favorites.includes(product.link)?favorites.filter(x=>x!==product.link):favorites.concat(product.link);
 try{localStorage.setItem('likedProducts',JSON.stringify(favorites));}catch{}
 render();
 });favorite.setAttribute('aria-label','Favorite '+product.name);favorite.setAttribute('aria-pressed',String(favorites.includes(product.link)));favorite.className='favorite-button';node.append(favorite);
 if(saved) actions.append(button('Remove',()=>task(async()=>{
 const target=room; const latest=await getBoards();const board=latest.find(b=>normalized(b.room)===normalized(target));
 await save(board?.room||target,(board?.selections||[]).filter(p=>identity(p)!==identity(product)));
 boards=await getBoards();notify('Product removed from '+pretty(target)+'.');
 })));
 else {
 const add=button(isSelected(product)?'✓ Selected':'+ Add to room',()=>task(async()=>{
 const target=room;if(!target)throw new Error('Choose a room first.');
 const latest=await getBoards();const board=latest.find(b=>normalized(b.room)===normalized(target));
 const items=board?.selections||[];
 if(!items.some(p=>identity(p)===identity(product)))await save(board?.room||target,items.concat([product]));
 boards=await getBoards();notify('Saved to '+pretty(target)+'.');
 }));add.className='primary';add.disabled=isSelected(product)||busy;actions.append(add);
 if(!client)actions.append(button('Delete',()=>{if(confirm('Delete this product from the shared library? Existing room selections will remain.'))task(async()=>{await api('/api/products/'+encodeURIComponent(product._id),{method:'DELETE'});products=products.filter(p=>p._id!==product._id);notify('Product deleted from library.');});}));
 }
 body.append(actions);node.append(media,body);return node;
}
function attachRoomMenu(button,name,edit,remove){
 let timer=null,x=0,y=0,held=false;
 const stop=()=>{clearTimeout(timer);button.classList.remove('holding');};
 const open=()=>{stop();held=true;$('room-actions-title').textContent=pretty(name);$('room-menu-edit').onclick=()=>{$('room-actions').close();edit.onclick();};$('room-menu-delete').onclick=()=>{$('room-actions').close();remove.onclick();};$('room-actions').showModal();};
 button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-describedby','room-hold-hint');
 button.addEventListener('pointerdown',event=>{held=false;if(event.button!==0||!matchMedia('(max-width:700px)').matches)return;x=event.clientX;y=event.clientY;button.classList.add('holding');timer=setTimeout(open,500);});
 button.addEventListener('pointermove',event=>{if(Math.hypot(event.clientX-x,event.clientY-y)>10)stop();});
 ['pointerup','pointercancel','pointerleave'].forEach(type=>button.addEventListener(type,stop));
 button.addEventListener('click',event=>{if(held){event.preventDefault();event.stopImmediatePropagation();held=false;}},true);
 button.addEventListener('contextmenu',event=>{if(matchMedia('(max-width:700px)').matches){event.preventDefault();if(!$('room-actions').open)open();}});
 button.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();open();}});
}
$('room-menu-cancel').onclick=()=>$('room-actions').close();
$('room-actions').addEventListener('click',event=>{if(event.target===$('room-actions')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
function render() {
 const rooms=$('rooms');const roomScroll=rooms.scrollLeft;rooms.replaceChildren();
 const names=new Map();boards.forEach(b=>names.set(normalized(b.room),b.room)); additionalRooms.forEach(r=>{if(r.value&&!names.has(normalized(r.value)))names.set(normalized(r.value),r.value);}); if(room&&!names.has(normalized(room)))names.set(normalized(room),room);
 ['living-room','kitchen','bathroom','bedroom'].forEach(r=>{if(!hiddenRooms.includes(normalized(r))&&!names.has(normalized(r)))names.set(normalized(r),r);});
 if(!room)room=names.values().next().value;
 [...names.values()].forEach(name=>{const b=button(pretty(name),()=>{room=name;render();});b.className='room'+(normalized(name)===normalized(room)?' active':'');b.setAttribute('aria-pressed',String(normalized(name)===normalized(room)));const count=boards.find(x=>normalized(x.room)===normalized(name))?.selections?.length||0;b.append(el('small',String(count)));const row=el('div',undefined,'room-row');const edit=button('✎',()=>{editingRoom=name;$('room-form').elements.room.value=pretty(name);$('room-dialog-title').textContent='Edit room';$('save-room').textContent='Save name';$('room-dialog').showModal();});edit.className='room-action';edit.setAttribute('aria-label','Edit '+pretty(name));
const remove=button('×',()=>{if(!confirm('Remove '+pretty(name)+' and its saved selections?'))return;task(async()=>{const response=await fetch('/api/selection-boards?projectId='+encodeURIComponent(projectId)+'&room='+encodeURIComponent(name),{method:'DELETE'});if(!response.ok&&response.status!==404)throw Error('Could not remove room.');rememberHidden(name);additionalRooms=additionalRooms.filter(r=>normalized(r.value)!==normalized(name));boards=await getBoards();room=boards[0]?.room||'';notify('Room removed.');});});remove.className='room-action';remove.setAttribute('aria-label','Remove '+pretty(name));attachRoomMenu(b,name,edit,remove);row.append(b,edit,remove);rooms.append(row);});
 rooms.scrollLeft=roomScroll;
 $('room-title').textContent=pretty(room||'Choose or add a room');$('count').textContent=selections().length;$('total').textContent=money(selections().reduce((sum,p)=>sum+(Number(p.price)||0),0));
 const selected=$('selected');selected.replaceChildren();selections().forEach(p=>selected.append(card(p,true)));
 if(!selections().length){empty(selected,'No selections for this room yet','Explore the product library to find your finishes and fixtures.');selected.lastElementChild.append(button('Browse products',()=>{setMobileView(true);$('product-library').scrollIntoView({block:'nearest',behavior:'smooth'});}));}
 const query=$('search').value.trim().toLowerCase();
 const filtered=products.filter(p=>(String(p.name)+' '+String(p.description)).toLowerCase().includes(query)&&(!onlyFavorites||favorites.includes(p.link)));
 filtered.sort((a,b)=>$('sort').value==='low'?Number(a.price)-Number(b.price):$('sort').value==='high'?Number(b.price)-Number(a.price):String(a.name).localeCompare(String(b.name)));
 $('results').textContent=filtered.length+' products';
 const library=$('products');library.replaceChildren();filtered.forEach(p=>library.append(card(p,false)));
 if(!filtered.length)empty(library,'No products found','Try another search or add a new product.');
 if(busy)document.querySelectorAll('button').forEach(b=>b.disabled=true);
}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
function setMobileView(products){document.body.classList.toggle('mobile-products',products);$('show-selected').setAttribute('aria-pressed',String(!products));$('show-products').setAttribute('aria-pressed',String(products));}
$('show-selected').onclick=()=>setMobileView(false);$('show-products').onclick=()=>setMobileView(true);
$('search').oninput=render;$('sort').onchange=render;
$('favorites').onclick=()=>{onlyFavorites=!onlyFavorites;$('favorites').setAttribute('aria-pressed',String(onlyFavorites));render();};
$('new-room').onclick=()=>{editingRoom=null;$('room-form').reset();$('room-dialog-title').textContent='Add a room';$('save-room').textContent='Create room';$('room-dialog').showModal();};
function openProductForm(destination) {
 productDestination=destination;productRoom=room;
 cancelImport();lastLink='';$('image-candidates').replaceChildren();$('product-form').reset();$('product-notice').textContent='';$('import-preview-image').hidden=true;$('remove-product-photo').hidden=true;
 $('product-dialog-title').textContent=destination==='room'?'Add a product to '+pretty(room):'Add a library product';
 $('product-destination').textContent=destination==='room'?'Saved only to this room. The shared library will not be changed.':'Saved to the shared product library.';
 $('save-product').textContent=destination==='room'?'Save to room':'Save to library';
 $('product-dialog').showModal();
}
$('new-product').onclick=()=>openProductForm('library');
$('room-product').onclick=()=>openProductForm('room');

$('refresh').onclick=()=>task(async()=>{[boards,products]=await Promise.all([getBoards(),api('/api/products')]);notify('Selections are up to date.');});
$('room-form').onsubmit=event=>{event.preventDefault();task(async()=>{
 const name=new FormData(event.target).get('room').trim();if(!name)throw new Error('Enter a room name.');
 const latest=await getBoards();if(latest.some(b=>normalized(b.room)===normalized(name)&&normalized(b.room)!==normalized(editingRoom)))throw new Error('That room already exists.');
 if(editingRoom){await api('/api/selection-boards',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,room:editingRoom,newRoom:name})});rememberHidden(editingRoom);additionalRooms=additionalRooms.filter(r=>normalized(r.value)!==normalized(editingRoom));boards=await getBoards();room=name;$('room-dialog').close();notify('Room renamed.');return;}
 await save(name,[]);boards=await getBoards();room=name;$('room-dialog').close();event.target.reset();notify('Room created.');
});};
$('product-form').onsubmit=event=>{event.preventDefault();task(async()=>{

 if(importing||importTimer)throw Error('Wait for the preview to finish, or close and reopen the form to enter details manually.');
 const product=Object.fromEntries(new FormData(event.target));product.name=product.name.trim();product.description=product.description.trim();product.price=Number(product.price);
 if(!product.name||!product.description||!Number.isFinite(product.price)||product.price<=0||!safeUrl(product.link)||(!product.photo||!imageUrls({photo:product.photo}).length))throw new Error('Enter valid product details and an http or https link.');
 await verifyPhoto(product.photo);
 if(productDestination==='room'){
 if(!productRoom)throw new Error('Choose a room first.');
 const latest=await getBoards();const board=latest.find(b=>normalized(b.room)===normalized(productRoom));const items=board?.selections||[];
 if(items.some(p=>identity(p)===identity(product)))throw new Error('This product is already in this room.');
 await save(board?.room||productRoom,items.concat([product]));boards=await getBoards();$('product-dialog').close();event.target.reset();notify('Product saved directly to '+pretty(productRoom)+'.');return;
 }
 const created=await api('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(product)});
 products.unshift(created);$('product-dialog').close();event.target.reset();notify('Product added to the library. Choose Add to room to select it.');
});};
async function verifyPhoto(url) {
 const src=imageUrls({photo:url})[0];if(!src)throw new Error('Upload a product photo before saving.');
 await new Promise((resolve,reject)=>{const img=new Image();const timer=setTimeout(()=>{img.src='';reject(Error('Photo could not be verified. Upload another image.'));},8000);img.onload=()=>{clearTimeout(timer);if(img.naturalWidth>0)resolve();else reject(Error('Invalid photo.'));};img.onerror=()=>{clearTimeout(timer);reject(Error('Photo could not load. Upload another image.'));};img.src=src;});
}
async function updatePreview(warnings=[]) {
 const form=$('product-form'),img=$('import-preview-image');const photo=form.elements.photo.value;img.hidden=true;$('remove-product-photo').hidden=!photo;
 if(photo){try{await verifyPhoto(photo);img.src=photo;img.hidden=false;}catch(e){warnings=[...warnings,e.message];}}
}

$('product-form').elements.price.addEventListener('change',()=>updatePreview());
$('remove-product-photo').onclick=()=>{
 $('product-form').elements.photo.value='';$('product-upload').value='';
 $('import-preview-image').removeAttribute('src');$('import-preview-image').hidden=true;
 $('remove-product-photo').hidden=true;updatePreview();notify('Photo removed. Choose a file to upload a replacement.');
};
async function uploadProductPhoto(file) {
 if(!file)return;if(file.size>5*1024*1024)throw Error('Choose an image under 5 MB.');
 cancelImport();const body=new FormData();body.append('image',file);notify('Uploading photo…');
 const response=await fetch('/api/product-image',{method:'POST',body,signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Photo upload failed.');
 $('product-form').elements.photo.value=data.url;await updatePreview();notify('Photo uploaded. You can edit the details and save.');
}
$('product-upload').onchange=()=>task(()=>uploadProductPhoto($('product-upload').files[0]));
$('product-dialog').addEventListener('paste',event=>{const file=[...(event.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'))?.getAsFile();if(file){event.preventDefault();task(()=>uploadProductPhoto(file));}});
$('product-dialog').addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('Files')){event.preventDefault();$('product-dialog').classList.add('drag-photo');}});
$('product-dialog').addEventListener('dragleave',()=>$('product-dialog').classList.remove('drag-photo'));
$('product-dialog').addEventListener('drop',event=>{event.preventDefault();$('product-dialog').classList.remove('drag-photo');const file=[...event.dataTransfer.files].find(f=>f.type.startsWith('image/'));if(file)task(()=>uploadProductPhoto(file));});
let importController=null,importTimer=null,importing=false,lastLink='',importVersion=0;
function cancelImport(){clearTimeout(importTimer);importTimer=null;importVersion++;importController?.abort();importing=false;$('import-loader').hidden=true;$('product-form').removeAttribute('aria-busy');$('save-product').disabled=busy;$('import-product').textContent='Refresh preview';}
$('product-dialog').addEventListener('close',cancelImport);
function showImageChoices(urls){const holder=$('image-candidates');holder.replaceChildren();urls.forEach((url,index)=>{const choice=button(' ',async()=>{const form=$('product-form');form.elements.photo.value=url;await updatePreview();holder.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===choice)));});const img=el('img');img.src=url;img.alt='Product photo option '+(index+1);choice.replaceChildren(img);choice.setAttribute('aria-label','Use product photo '+(index+1));choice.setAttribute('aria-pressed',String(index===0));holder.append(choice);});}
async function importLink(force=false){
 const form=$('product-form'),link=safeUrl(form.elements.link.value.trim());if(!link||busy||(!force&&link===lastLink))return;
 cancelImport();const version=importVersion;const changed=lastLink&&lastLink!==link;lastLink=link;
 if(changed){['name','description','price','photo'].forEach(key=>form.elements[key].value='');$('image-candidates').replaceChildren();await updatePreview();}
 if(version!==importVersion||!$('product-dialog').open)return;
 const before=Object.fromEntries(['name','description','price','photo'].map(key=>[key,form.elements[key].value]));
 importing=true;importController=new AbortController();const timer=setTimeout(()=>importController?.abort(),70000);
 $('import-loader').hidden=false;form.setAttribute('aria-busy','true');$('save-product').disabled=true;$('import-product').textContent='Refreshing…';notify('Finding product details…');
 try{
 const response=await fetch('/api/product-details?url='+encodeURIComponent(link),{signal:importController.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'Preview could not load. Enter details manually or retry.');
 if(version!==importVersion||safeUrl(form.elements.link.value.trim())!==link)return;
 const generic=value=>/^(product\s*(gallery|images?|details?)|gallery|amazon(?:\.com)?|untitled)$/i.test(String(value||'').trim());
 const title=String(data.title&&!generic(data.title)?data.title:data.description||'').replace(/^Amazon\.com\s*:\s*/i,'').replace(/\s*[-|:]\s*Amazon\.com\s*$/i,'').trim().slice(0,200);
 const put=(key,value)=>{if(value!==null&&value!==undefined&&!before[key]&&form.elements[key].value===before[key])form.elements[key].value=value;};
 put('name',title);put('description',data.description||'');put('price',data.currency==='USD'&&Number.isFinite(data.price)&&data.price>0?data.price:null);
 const images=imageUrls({image:data.image,images:data.images});put('photo',images[0]);showImageChoices(images);await updatePreview();
 if(version!==importVersion)return;const missing=[!form.elements.name.value?'name':null,!form.elements.price.value?'USD price':null,!form.elements.photo.value?'photo':null].filter(Boolean);
 notify(missing.length?'Preview ready. Add the missing '+missing.join(', ')+'.':'Preview ready. Edit any details, then save.');
 }catch(error){if(version===importVersion)notify(error.name==='AbortError'?'Preview timed out. Retry or enter details manually.':error.message,true);}
 finally{clearTimeout(timer);if(version===importVersion){importing=false;$('import-loader').hidden=true;form.removeAttribute('aria-busy');$('save-product').disabled=busy;$('import-product').textContent='Refresh preview';}}
}
$('clear-product-link').onclick=()=>{cancelImport();lastLink='';const form=$('product-form');form.elements.link.value='';['name','description','price','photo'].forEach(key=>form.elements[key].value='');$('image-candidates').replaceChildren();$('product-upload').value='';updatePreview();notify('Link cleared. Paste another product link.');form.elements.link.focus();};
$('import-product').onclick=()=>importLink(true);
$('product-form').elements.link.addEventListener('input',()=>{cancelImport();if(lastLink&&safeUrl($('product-form').elements.link.value.trim())!==lastLink){['name','description','price','photo'].forEach(key=>$('product-form').elements[key].value='');$('image-candidates').replaceChildren();updatePreview();}importTimer=setTimeout(()=>{importTimer=null;importLink();},650);});
$('product-form').elements.link.addEventListener('change',()=>importLink());
(async()=>{
 const file=$('product-upload').files[0];if(!file)return;if(file.size>5*1024*1024)throw Error('Choose an image under 5 MB.');
 const body=new FormData();body.append('image',file);notify('Uploading photo…');
 const response=await fetch('/api/product-image',{method:'POST',body,signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Photo upload failed.');
 $('product-form').elements.photo.value=data.url;await updatePreview();notify('Photo uploaded. Review the product before saving.');
});
$('import-product').onclick=()=>task(async()=>{
 const form=$('product-form');const link=form.elements.link.value;if(!safeUrl(link))throw new Error('Enter a valid product link first.');
 $('import-loader').hidden=false;$('product-form').setAttribute('aria-busy','true');$('import-product').textContent='Importing…';
 try {
 const response=await fetch('/api/product-details?url='+encodeURIComponent(link),{signal:AbortSignal.timeout(70000)});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||'Import failed. Enter the details manually or retry.');}
 const data=await response.json();
 const genericName=value=>/^(product\s*(gallery|images?|details?)|gallery|amazon(?:\.com)?|untitled)$/i.test(String(value||'').trim());
 const cleanName=value=>String(value||'').replace(/^Amazon\.com\s*:\s*/i,'').replace(/\s*[-|:]\s*Amazon\.com\s*$/i,'').replace(/\s+/g,' ').trim();
 const importedName=cleanName(data.title&&!genericName(data.title)?data.title:data.description);
 if(importedName&&(!form.elements.name.value||genericName(form.elements.name.value)))form.elements.name.value=importedName.slice(0,200);
 if(data.description&&!form.elements.description.value)form.elements.description.value=data.description;
 const importedImages=imageUrls({image:data.image,images:data.images});if(importedImages.length&&!form.elements.photo.value)form.elements.photo.value=importedImages[0];
 if(data.currency==='USD'&&Number.isFinite(data.price)&&data.price>0&&!form.elements.price.value)form.elements.price.value=String(data.price);
 await updatePreview(data.warnings||[]);
 notify('Review the photo and USD price below. Complete any missing fields before saving.');
 } finally {$('import-loader').hidden=true;$('product-form').removeAttribute('aria-busy');$('import-product').textContent='Fill details from link';}
});
(async()=>{
 try {
 projectId=params.get('projectId');
 if(!projectId&&!client){try{projectId=localStorage.getItem('currentProjectId');}catch{}}
 if(!projectId&&!client)projectId=(await api('/api/projects/current')).projectId;
 if(!projectId)throw new Error('Open this selection board from a project or estimate to continue.');
 try{hiddenRooms=JSON.parse(localStorage.getItem('hiddenSelectionRooms:'+projectId)||'[]');if(!Array.isArray(hiddenRooms))hiddenRooms=[];}catch{}
 [boards,products]=await Promise.all([getBoards(),api('/api/products')]);
 room=params.get('room')||boards[0]?.room||'living-room';render();notify('Choose a room and explore your selections.');
 }catch(error){notify(error.message,true);document.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);}
})();
})();
