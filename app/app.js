const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shapes={
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  cart:'<path d="M2 3h3l3 12h11l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  home:'<path d="m3 10 9-7 9 7v10H3V10Z"/><path d="M9 20v-7h6v7"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
  back:'<path d="m14 5-7 7 7 7"/>',message:'<path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z"/><path d="M7 9h9M7 13h6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',watch:'<rect x="6" y="5" width="12" height="14" rx="5"/><path d="M9 5V1h6v4M9 19v4h6v-4M12 8v5l3 1"/>',
  wave:'<path d="M2 9c3-4 5 4 8 0s5 4 8 0 4 0 4 0M2 16c3-4 5 4 8 0s5 4 8 0 4 0 4 0"/>',
  bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>',compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5 5-3Z"/>',
  share:'<path d="M12 16V3m-4 4 4-4 4 4M5 12v9h14v-9"/>'
};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${shapes[name]||shapes.watch}</svg>`;
function watchImages(p){const list=Array.isArray(p.images)?p.images.filter(x=>x&&typeof x.src==='string'):[];return list.length?list:[{src:p.image,alt:p.brand+' '+p.name}]}
function photoChoices(p){const list=watchImages(p);return list.length>1?`<div class="photo-choices" role="group" aria-label="Watch photographs">${list.map((x,i)=>`<button data-gallery-id="${p.id}" data-photo-index="${i}" aria-label="View photograph ${i+1}" aria-pressed="${i===0}"><img src="${escape(x.src)}" alt="" loading="lazy"></button>`).join('')}</div>`:''}
function hydrate(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon)})}hydrate();

// Only load the remote film while the hero is visible. Respect motion and data preferences.
const heroVideo=$('#heroVideo'),heroMotion=matchMedia('(prefers-reduced-motion: reduce)');
let heroVisible=false;
function syncHero(){
  const allowed=heroVisible&&!document.hidden&&!heroMotion.matches&&!navigator.connection?.saveData;
  if(!allowed){heroVideo.pause();return}
  if(!heroVideo.src){heroVideo.muted=true;heroVideo.src=heroVideo.dataset.src;heroVideo.load()}
  heroVideo.play().catch(()=>{});
}
heroVideo.addEventListener('playing',()=>{$('.outlet-hero').classList.add('video-ready')});
heroVideo.addEventListener('error',()=>{$('.outlet-hero').classList.remove('video-ready')});
new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;syncHero()},{threshold:.15}).observe($('.outlet-hero'));
document.addEventListener('visibilitychange',syncHero);heroMotion.addEventListener('change',syncHero);

const storageKey='aurevon-selection-v3';let stored={};
if('scrollRestoration'in history)history.scrollRestoration='manual';
try{stored=JSON.parse(localStorage.getItem(storageKey)||localStorage.getItem('aurevon-selection-v2')||localStorage.getItem('aurevon-private-preview-v1')||'{}')||{}}catch{}
let wishes=new Set(Array.isArray(stored.wishes)?stored.wishes:[]),cart=stored.cart||stored.bag||{};
if(typeof cart!=='object'||Array.isArray(cart)||cart===null)cart={};
let catalog=[],view='home',style='',limit=12,currentProduct=null,productTab='details',telegram=null,timer,submitting=false,submitted=false,pendingKey=null,pendingFingerprint='';
const products=new Map(),positions={};
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('visible'),2800)}
function openConcierge(){const url='https://t.me/aurevon_outlet1';try{if(telegram?.initData&&typeof telegram.openTelegramLink==='function'){telegram.openTelegramLink(url);return}}catch{}window.open(url,'_blank','noopener,noreferrer')}
function feedback(){try{if(telegram?.initData)telegram.HapticFeedback?.impactOccurred('light')}catch{}}
function counts(){const n=Object.values(cart).reduce((a,b)=>a+b,0);$$('[data-cart-count]').forEach(el=>{el.textContent=n;el.dataset.zero=String(n===0)});$$('[data-wish-count]').forEach(el=>{el.textContent=wishes.size;el.dataset.zero=String(wishes.size===0)})}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify({wishes:[...wishes],cart}))}catch{toast('Storage unavailable. Keep this page open to retain your selection.')}counts()}
function selectionChanged(){submitted=false;pendingKey=null;pendingFingerprint='';$('#inquirySuccess').hidden=true;$('#cartItems').hidden=false;if(!Object.keys(cart).length)$('#inquiryForm').hidden=true}
function add(id,quiet=false){
  if(submitting){if(!quiet)toast('Please wait while your inquiry is saved.');return false}
  if(!products.has(id))return false;
  if((cart[id]||0)>=10){if(!quiet)toast('For more than 10 pieces, mention the quantity in your inquiry.');return false}
  cart[id]=(cart[id]||0)+1;selectionChanged();persist();renderCart();feedback();if(!quiet)toast('Added to cart');return true;
}
function toggleWish(id){if(!products.has(id))return;const saving=!wishes.has(id);saving?wishes.add(id):wishes.delete(id);persist();renderCards();if(view==='product')updateProductSave();feedback();toast(saving?'Saved to wishlist':'Removed from wishlist')}
function resetFilters(){style='';$('#search').value='';$('#brand').value='';limit=12;updateStyleTabs()}
function updateStyleTabs(){$$('.category-tabs [data-style]').forEach(b=>{const active=b.dataset.style===style;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))})}
function setPage(next,{push=true,restore=true}={}){
  if(!['home','catalog','wishlist','cart','product','about'].includes(next))next='home';
  if(view!==next)positions[view]=window.scrollY;view=next;
  $$('[data-page]').forEach(el=>{el.hidden=el.dataset.page!==next});
  const searchable=next==='home'||next==='catalog';$('#searchArea').hidden=!searchable;$('#categoryArea').hidden=next!=='catalog';
  $('#brandLink').hidden=false;$('#brandLink small').hidden=next!=='home';$('#screenTitle').hidden=next==='home';$('#screenTitle').textContent={catalog:'All watches',wishlist:'Wishlist',cart:'Your cart',product:'Product details',about:'How it works'}[next]||'';
  $('#headerBack').hidden=next!=='product';$('#menuToggle').hidden=next==='product';
  const activeSection=next==='product'?productReturn:next;
  $$('.bottom-nav [data-view],.menu-dialog nav [data-view]').forEach(b=>{const active=b.dataset.view===activeSection;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  $('#headerBack').setAttribute('aria-label','Back to '+({home:'Home',catalog:'Catalog',wishlist:'Wishlist',cart:'Cart'}[productReturn]||'Catalog'));
  if(push)history.pushState({page:next,product:next==='product'?currentProduct:null,from:next==='product'?productReturn:null},'',next==='product'?`#watch/${currentProduct}`:`#${next}`);
  if(next==='cart')renderCart();if(next==='wishlist'||next==='catalog')renderCards();
  requestAnimationFrame(()=>window.scrollTo({top:restore?(positions[next]||0):0,behavior:'instant'}));updateBack();
}
function navigate(next){if(next===view){window.scrollTo({top:0,behavior:heroMotion.matches?'instant':'smooth'})}else setPage(next);for(const d of $$('dialog[open]'))d.close()}
const editorialEdits={'For Him':['W-0125','W-0397','W-0053','W-0025'],'For Her':['W-0182','W-0337','W-0409','W-0445']};
let selectedEdit='For Him';try{const v=sessionStorage.getItem('aurevon.editorial-edit');if(editorialEdits[v])selectedEdit=v}catch{}
function renderEdit(){const ids=editorialEdits[selectedEdit];$('#featuredGrid').innerHTML=ids.map(id=>products.get(id)).filter(Boolean).map(p=>card(p,'home')).join('');$$('[data-pick-edit]').forEach(b=>{const active=b.dataset.pickEdit===selectedEdit;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;if(active)$('#featuredGrid').setAttribute('aria-labelledby',b.id)});$('#editCollection').dataset.style=selectedEdit;$('#featuredGrid').setAttribute('aria-label',selectedEdit+' selected watches')}
function filtered(){const q=$('#search').value.trim().toLowerCase(),brand=$('#brand').value;return catalog.filter(p=>(!brand||p.brand===brand)&&(!style||(style==='Sale'?!!salePrice(p):editorialEdits[style]?editorialEdits[style].includes(p.id):p.style===style))&&(!q||`${p.brand} ${p.name} ${p.style} ${p.id}`.toLowerCase().includes(q)))}
// Supply pricing.original (positive amount) and pricing.currency for an approved sale item.
function salePrice(p){const v=p.pricing;if(!v||typeof v.original!=='number'||!Number.isFinite(v.original)||v.original<=0||!['USD','EUR','GBP','CHF'].includes(v.currency))return null;const original=Math.round(v.original*100);const current=Math.round(original*.6);if(current<1)return null;return {original:original/100,current:current/100,currency:v.currency,discount:Math.round((original-current)/original*1000)/10}}
function priceMarkup(p,detail=false){const v=salePrice(p);if(!v)return detail?'Price on request':'On request';const format=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:v.currency,maximumFractionDigits:2}).format(n);return `<span class="sale-prices"><del aria-label="Original price">${format(v.original)}</del><span class="sale-current" aria-label="Sale price">${format(v.current)}</span><span class="sale-discount">−${v.discount}%</span></span>`}
function card(p,context='catalog'){
  return `<article class="product-card" data-product="${p.id}"><div class="product-photo"><button class="photo-open" data-open="${p.id}" aria-label="View ${escape(p.name)}"><img src="${p.image}" alt="${escape(p.brand+' '+p.name)}" width="${p.width}" height="${p.height}" loading="lazy"></button><button class="save-button ${wishes.has(p.id)?'active':''}" data-wish="${p.id}" aria-label="${wishes.has(p.id)?'Remove from wishlist':'Save to wishlist'}" aria-pressed="${wishes.has(p.id)}">${icon('heart')}</button></div><p class="card-brand">${escape(p.brand)}</p><button class="card-name" data-open="${p.id}">${escape(p.name)}</button><div class="card-bottom"><span class="card-note">${priceMarkup(p)}</span><button class="card-add" data-add="${p.id}" aria-label="Add ${escape(p.name)} to cart">${icon('plus')}</button></div>${context==='wishlist'?`<button class="wishlist-move" data-add="${p.id}">Add to cart</button>`:''}</article>`;
}
function empty(kind){const messages={wishlist:['heart','Your next favourites.','Save a watch with the heart icon to keep it here.'],cart:['cart','Your cart is waiting.','Explore the collection and add the watches you would like to ask about.'],search:['search','No watches found.','Try a different brand, category or search term.']};const [symbol,title,body]=messages[kind];return `<div class="empty"><span data-icon="${symbol}">${icon(symbol)}</span><h2>${title}</h2><p>${body}</p><button class="dark-button" ${kind==='search'?'data-reset':'data-view="catalog"'}>${kind==='search'?'Clear filters':'Explore watches'}</button></div>`}
function renderCards(){
  const sale=catalog.filter(p=>salePrice(p));$('#saleSection').hidden=!sale.length;$$('[data-sale-nav]').forEach(el=>el.hidden=!sale.length);$('.hero-offer').hidden=!sale.length;$('#saleGrid').innerHTML=sale.slice(0,4).map(p=>card(p,'sale')).join('');
  renderEdit();
  $('#dressGrid').innerHTML=catalog.filter(p=>p.style==='Dress'&&!Object.values(editorialEdits).flat().includes(p.id)).slice(0,4).map(p=>card(p,'home')).join('');
  const list=filtered();$('#catalogGrid').innerHTML=list.slice(0,limit).map(p=>card(p)).join('')||empty('search');$('#resultCount').textContent=`${list.length} ${list.length===1?'watch':'watches'} ${style==='Sale'?'· −40%':''}`;$('#more').hidden=limit>=list.length;$('#resetFilters').hidden=!style&&!$('#brand').value&&!$('#search').value;
  const saved=catalog.filter(p=>wishes.has(p.id));$('#wishlistGrid').innerHTML=saved.map(p=>card(p,'wishlist')).join('')||empty('wishlist');$('#wishlistSummary').textContent=saved.length?`${saved.length} ${saved.length===1?'watch':'watches'} saved to your wishlist.`:'Your favourite watches, in one place.';$('#wishlistAll').hidden=!saved.length;
}
let productReturn='catalog';
function openProduct(id){if(!products.has(id))return;productReturn=view==='product'?productReturn:view;currentProduct=id;productTab='details';renderProduct();setPage('product',{restore:false})}
function updateProductSave(){const b=$('#productView [data-wish]');if(!b)return;const saved=wishes.has(currentProduct);b.classList.toggle('active',saved);b.setAttribute('aria-pressed',String(saved));b.innerHTML=icon('heart')+(saved?'Saved':'Save')}
function renderProduct(){const p=products.get(currentProduct);if(!p)return;
  $('#productView').innerHTML=`<div class="product-visual"><button data-zoom="${p.id}" aria-label="Enlarge ${escape(p.name)} photograph"><img src="${p.image}" width="${p.width}" height="${p.height}" alt="${escape(p.brand+' '+p.name)}"></button><span class="photo-zoom" aria-hidden="true">${icon('search')}</span></div>${photoChoices(p)}<div class="product-panel"><p class="product-brand">${escape(p.brand)}</p><h2>${escape(p.name)}</h2><p class="product-status"><strong>${priceMarkup(p,true)}</strong><span>${escape(p.style)} collection</span></p><div class="product-actions"><button class="gold-button" data-add="${p.id}">Add to Cart</button><div class="product-secondary-actions"><button class="${wishes.has(p.id)?'active':''}" data-wish="${p.id}" aria-pressed="${wishes.has(p.id)}">${icon('heart')}${wishes.has(p.id)?'Saved':'Save'}</button></div></div><button class="outline-button full-width" data-advisor>Ask a concierge</button><button class="text-button" data-copy-watch="${p.id}">Copy watch details</button><p class="product-advisor-note">Copy this watch’s details and send them in the concierge chat.</p><p class="product-introduction">${escape(p.introduction||p.description)}</p></div><div class="product-tabs" role="group" aria-label="Product information"><button data-product-tab="details" class="${productTab==='details'?'active':''}" aria-pressed="${productTab==='details'}">Details</button><button data-product-tab="how" class="${productTab==='how'?'active':''}" aria-pressed="${productTab==='how'}">How it works</button></div><div class="product-description">${productTab==='details'?`<p>${escape(p.description)}</p><h3 class="key-details-title">Key details</h3><dl class="product-facts"><div><dt>Brand</dt><dd>${escape(p.brand)}</dd></div><div><dt>Collection</dt><dd>${escape(p.style)}</dd></div><div><dt>Selection ID</dt><dd>${p.id}</dd></div></dl><p class="product-advisor-note">Exact reference, specifications, condition and availability are confirmed with your advisor.</p>`:'<ol class="product-how"><li>Add the watches you like to your cart.</li><li>Send your Cart and Wishlist to the concierge, then say hello in the chat.</li><li>Your advisor confirms availability, price, outlet offer eligibility, delivery and payment.</li></ol>'}</div><section class="related-section"><div class="section-title"><h2>You may also like</h2></div><div class="related-grid">${catalog.filter(x=>x.id!==p.id).sort((a,b)=>Number(b.style===p.style)-Number(a.style===p.style)).slice(0,3).map(x=>card(x,'related')).join('')}</div></section>`;
}
function renderCart(){const selected=catalog.filter(p=>cart[p.id]);$('#cartItems').innerHTML=selected.map(p=>`<article class="cart-row"><img src="${p.image}" alt="${escape(p.name)}"><div class="cart-info"><p class="cart-brand">${escape(p.brand)}</p><h3>${escape(p.name)}</h3><p class="cart-ref">${p.id} · ${priceMarkup(p)}</p><div class="cart-actions"><div class="quantity"><button data-qty="${p.id}" data-step="-1" aria-label="Decrease ${escape(p.name)} quantity">${icon('minus')}</button><span>${cart[p.id]}</span><button data-qty="${p.id}" data-step="1" aria-label="Increase ${escape(p.name)} quantity">${icon('plus')}</button></div><button class="remove-item" data-remove="${p.id}">Remove</button></div></div></article>`).join('')||empty('cart');$('#cartItems').hidden=submitted;$('#inquiryActions').hidden=!selected.length||submitted;$('#inquirySuccess').hidden=!submitted;if(!selected.length)$('#inquiryForm').hidden=true;$$('.concierge-transfer').forEach(node=>node.hidden=(!selected.length&&!wishes.size)||submitted)}
function inquiryText(){return 'AUREVON — Watch inquiry\n\n'+catalog.filter(p=>cart[p.id]).map(p=>`${p.id} | ${p.brand} | ${p.name} | Quantity: ${cart[p.id]}`).join('\n')+'\n\nPlease confirm availability, pricing, outlet offer eligibility, delivery and payment details.'}
function updateBack(){try{if(!telegram?.initData)return;view!=='home'||$$('dialog[open]').length?telegram.BackButton.show():telegram.BackButton.hide()}catch{}}
function back(){const dialog=$$('dialog[open]').at(-1);if(dialog){dialog.close();return}if(view==='product'){if(history.state?.from){history.back();return}setPage(productReturn,{restore:true});return}navigate('home')}
let verifiedTelegramUser=null,conciergeSending=false,conciergeRequest=null;
async function conciergeApi(route,body={}){const initData=telegram?.initData;if(!initData)throw Error('Open AUREVON from Telegram to send your selection.');const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,initData})});const data=await response.json();if(!response.ok)throw Error(data.error||'Please try again.');return data;}
function showTelegramAccount(user,status){const name=$('#accountName'),initial=$('#accountInitial'),username=$('#accountUsername'),label=$('#accountStatus');if(!name||!initial||!username||!label)return;const full=user?[user.firstName,user.lastName].filter(Boolean).join(' ')||'Telegram member':'Guest';name.textContent=full;initial.textContent=Array.from(full)[0]||'A';username.textContent=user?.username?'@'+user.username:'';username.hidden=!user?.username;label.textContent=status;const entry=$('#telegramEntry'),note=$('#telegramEntryNote');if(entry)entry.hidden=Boolean(user);if(note)note.hidden=Boolean(user);}
async function authenticateTelegram(){if(!telegram?.initData)return;showTelegramAccount(null,'Verifying Telegram…');try{const {user}=await conciergeApi('/api/telegram/auth');verifiedTelegramUser=user;showTelegramAccount(user,'Connected via Telegram');const name=$('#inquiryForm [name=name]'),contact=$('#inquiryForm [name=contact]');if(name&&!name.value)name.value=[user.firstName,user.lastName].filter(Boolean).join(' ');if(contact&&!contact.value&&user.username)contact.value='@'+user.username;}catch{verifiedTelegramUser=null;showTelegramAccount(null,'Telegram connection unavailable. Reopen the app to retry.');}}
function showConciergeStatus(text){const node=$('#conciergeTransferStatus');if(node){node.hidden=false;node.textContent=text;node.scrollIntoView({block:'nearest',behavior:'smooth'})}else toast(text)}
async function sendConciergeSelection(){if(conciergeSending)return;if(!telegram?.initData){toast('Open AUREVON from Telegram to send your selection.');return}const items=Object.entries(cart).map(([id,quantity])=>({id,quantity})),wishlist=[...wishes];if(!items.length&&!wishlist.length){toast('Add a watch to Cart or Wishlist first.');return}if(items.length>30||wishlist.length>30){toast('Send up to 30 watches from each list. Please reduce your selection.');return}const fingerprint=JSON.stringify({items,wishlist});if(!conciergeRequest||conciergeRequest.fingerprint!==fingerprint)conciergeRequest={fingerprint,key:crypto.randomUUID()};conciergeSending=true;$$('[data-send-selection]').forEach(b=>b.disabled=true);try{const data=await conciergeApi('/api/concierge/selection',{items,wishlist,requestKey:conciergeRequest.key});conciergeRequest.id=data.id;showConciergeStatus(data.status==='sent'?'Selection sent to your concierge.':'Selection saved. Open the concierge chat and send a message so we can connect your selection.');openConcierge();}catch(error){showConciergeStatus(error.message)}finally{conciergeSending=false;$$('[data-send-selection]').forEach(b=>b.disabled=false)}}
async function refreshConciergeStatus(){if(!conciergeRequest?.id)return;try{const {status}=await conciergeApi('/api/concierge/status',{id:conciergeRequest.id});const messages={pending:'Selection saved. Send your first message in the concierge chat to connect it.',queued:'Selection is queued for your concierge. Delivery is not confirmed yet.',sent:'Selection sent to your concierge.',failed:'Selection could not be delivered. Please message the concierge directly.',uncertain:'Delivery could not be confirmed. Please ask your concierge before sending again.'};showConciergeStatus(messages[status]||'Selection saved.');}catch{}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshConciergeStatus()});
function initTelegram(){const app=window.Telegram?.WebApp;if(!app||telegram)return;telegram=app;try{app.ready();if(app.initData){app.expand();if(app.isVersionAtLeast('6.1')){app.setHeaderColor('#ffffff');app.setBackgroundColor('#ffffff')}app.BackButton.onClick(back);authenticateTelegram()}}catch{}updateBack()}
$('#telegramSdk').addEventListener('load',initTelegram);initTelegram();

$('.edit-tabs').addEventListener('keydown',event=>{if(!event.target.matches('[data-pick-edit]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=$$('[data-pick-edit]'),index=tabs.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].click();tabs[next].focus({preventScroll:true})});
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.pickEdit&&editorialEdits[d.pickEdit]){selectedEdit=d.pickEdit;try{sessionStorage.setItem('aurevon.editorial-edit',selectedEdit)}catch{}renderEdit()}
  if('sendSelection'in d)sendConciergeSelection();
  if('advisor'in d){for(const dialog of $$('dialog[open]'))dialog.close();openConcierge()}
  if(d.copyWatch){const p=products.get(d.copyWatch);if(p)navigator.clipboard.writeText(`${p.brand} — ${p.name} · ${p.id}`).then(()=>toast('Watch details copied. Paste them into the concierge chat.')).catch(()=>toast('Copy unavailable. Mention selection ID '+p.id));}
  if(d.view)navigate(d.view);
  if(d.open)openProduct(d.open);
  if(d.wish)toggleWish(d.wish);
  if(d.add)add(d.add);
  if('style'in d){style=d.style;limit=12;updateStyleTabs();renderCards();setPage('catalog',{restore:false})}
  if('reset'in d){resetFilters();renderCards()}
  if('close'in d)b.closest('dialog').close();
  if(d.qty||d.remove){if(submitting)return toast('Please wait while your inquiry is saved.');const id=d.qty||d.remove,n=d.remove?0:(cart[id]||0)+Number(d.step);if(n>10)return toast('For more than 10 pieces, mention the quantity in your inquiry.');if(n<=0)delete cart[id];else cart[id]=n;selectionChanged();persist();renderCart()}
  if(d.productTab){productTab=d.productTab;const y=window.scrollY;renderProduct();window.scrollTo({top:y,behavior:'instant'})}
  if(d.galleryId){const p=products.get(d.galleryId),photo=watchImages(p)[Number(d.photoIndex)];if(photo){const img=$('.product-visual img');img.src=photo.src;img.alt=photo.alt||`${p.brand} ${p.name}`;$$('[data-gallery-id]').forEach(choice=>choice.setAttribute('aria-pressed',String(choice===b)))}}
  if(d.zoom){const p=products.get(d.zoom);$('#zoomPhoto').src=$('.product-visual img')?.src||p.image;$('#zoomPhoto').alt=`${p.brand} ${p.name}`;$('#photoDialog').showModal();updateBack()}
});
$('#brandLink').onclick=e=>{e.preventDefault();navigate('home');window.scrollTo({top:0,behavior:'instant'})};$('#headerBack').onclick=back;
$('#menuToggle').onclick=()=>{$('#menuDialog').showModal();updateBack()};$('#filterToggle').onclick=()=>{$('#filterDialog').showModal();updateBack()};
$('#applyFilters').onclick=()=>{$('#filterDialog').close();limit=12;renderCards();setPage('catalog',{restore:false})};
$('#search').oninput=()=>{limit=12;renderCards();if(view!=='catalog')setPage('catalog',{restore:false})};
$('#resetFilters').onclick=()=>{resetFilters();renderCards()};$('#more').onclick=()=>{limit+=12;renderCards()};
$('#wishlistAll').onclick=()=>{let added=0;for(const id of wishes)if(add(id,true))added++;toast(added?`${added} ${added===1?'watch added':'watches added'} to cart`:'Your cart already contains the maximum quantity.')};
$$('dialog').forEach(d=>{d.addEventListener('close',updateBack);d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()})});
$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(inquiryText());toast('Selection copied. It has not been sent.')}catch{toast('Copy unavailable. Use Download selection instead.')}};
$('#download').onclick=()=>{const url=URL.createObjectURL(new Blob([inquiryText()],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='aurevon-inquiry.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('#proceed').onclick=()=>{$('#inquiryForm').hidden=false;$('#inquiryForm').scrollIntoView({block:'start',behavior:'smooth'});$('#inquiryForm [name=name]').focus({preventScroll:true})};
$('#editSelection').onclick=()=>{selectionChanged();renderCart()};
$('#inquiryForm').addEventListener('submit',async event=>{
  event.preventDefault();if(submitting||!event.currentTarget.reportValidity()||!Object.keys(cart).length)return;
  const form=new FormData(event.currentTarget),payload={name:String(form.get('name')).trim(),contact:String(form.get('contact')).trim(),country:String(form.get('country')).trim(),note:String(form.get('note')).trim(),consent:form.get('consent')==='on',items:catalog.filter(p=>cart[p.id]).map(p=>({id:p.id,quantity:cart[p.id]}))};
  const fingerprint=JSON.stringify(payload);if(!pendingKey||pendingFingerprint!==fingerprint){pendingKey=crypto.randomUUID();pendingFingerprint=fingerprint}
  const submit=$('#submitInquiry');submitting=true;submit.disabled=true;submit.textContent='Saving your inquiry…';$('#formError').hidden=true;$$('#inquiryForm input, #inquiryForm textarea').forEach(el=>{el.disabled=true});
  try{const response=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,requestKey:pendingKey})}),data=await response.json();if(!response.ok||!data.id)throw new Error(data.error||'Your inquiry could not be saved. Please try again.');submitted=true;$('#inquiryForm').hidden=true;$('#inquiryReference').textContent=`Reference ${data.id}`;renderCart();if(view==='cart'){$('#inquirySuccess').focus();window.scrollTo({top:0,behavior:'instant'})}else toast('Your inquiry is saved in Cart.');feedback()}
  catch(error){$('#formError').textContent=error.message==='Failed to fetch'?'Connection lost. Your selection and details are still here. Please try again.':error.message;$('#formError').hidden=false}
  finally{submitting=false;submit.disabled=false;submit.innerHTML='Save inquiry';$$('#inquiryForm input, #inquiryForm textarea').forEach(el=>{el.disabled=false})}
});
function routeFromUrl(){const target=new URL(location.href);const requested=target.searchParams.get('watch');if(requested){target.searchParams.delete('watch');if(products.has(requested))target.hash='watch/'+requested;history.replaceState(null,'',target.pathname+target.search+target.hash)}const hash=location.hash.slice(1).split('&')[0];if(hash.startsWith('watch/')&&products.has(hash.slice(6))){currentProduct=hash.slice(6);productTab='details';renderProduct();setPage('product',{push:false,restore:false})}else setPage(['home','catalog','wishlist','cart','about'].includes(hash)?hash:'home',{push:false})}
window.addEventListener('popstate',routeFromUrl);
window.addEventListener('hashchange',routeFromUrl);
try{const response=await fetch('catalog.json');if(!response.ok)throw new Error('Catalog unavailable');catalog=await response.json();catalog.forEach(p=>products.set(p.id,p));$$('[data-category-image]').forEach(im=>{im.src=products.get(im.dataset.categoryImage).image});$('.outlet-hero>img').src=products.get('W-0053').image;wishes=new Set([...wishes].filter(id=>products.has(id)));cart=Object.fromEntries(Object.entries(cart).filter(([id,n])=>products.has(id)&&Number.isInteger(n)&&n>0&&n<=10));$('#brand').innerHTML+=[...new Set(catalog.map(p=>p.brand))].sort().map(b=>`<option value="${escape(b)}">${escape(b)}</option>`).join('');persist();renderCards();routeFromUrl();history.replaceState({page:view,product:currentProduct},'',location.hash||'#home')}
catch{const sale=catalog.filter(p=>salePrice(p));$('#saleSection').hidden=!sale.length;$$('[data-sale-nav]').forEach(el=>el.hidden=!sale.length);$('.hero-offer').hidden=!sale.length;$('#saleGrid').innerHTML=sale.slice(0,4).map(p=>card(p,'sale')).join('');
  $('#featuredGrid').innerHTML='<div class="empty"><h2>The collection could not be loaded.</h2><p>Please reload the page to try again.</p><button class="dark-button" id="retryLoad">Reload collection</button></div>';$('#retryLoad').onclick=()=>location.reload()}


