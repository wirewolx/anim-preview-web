// === Appwrite init ===
const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT  = '690ca6e20020dbc4f584'; // без <>
const DB_ID = '690ca7cd0022f8fe8ff8';
const SHARES_TABLE = 'shares';
const BUCKET_ID = 'project-assets';

// ---- permanent share token (per editor) ----
const STORAGE_TOKEN_KEY = 'shareToken';
const URL_TOKEN  = new URLSearchParams(location.search).get('share') || null;
let   SHARE_TOKEN = localStorage.getItem(STORAGE_TOKEN_KEY) || null;
const isViewer = () => URL_TOKEN && URL_TOKEN !== SHARE_TOKEN;

// ---- Appwrite client ----
const awClient  = new Appwrite.Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT);
const awAccount = new Appwrite.Account(awClient);
const awDB      = new Appwrite.Databases(awClient);
const awStorage = new Appwrite.Storage(awClient);

// анонимная сессия + авто-создание документа и подмена URL
(async () => {
  try { await awAccount.get(); } catch { await awAccount.createAnonymousSession(); }
  if (!URL_TOKEN) {
    try {
      await ensureShareDoc();
      if (SHARE_TOKEN) history.replaceState(null, '', `${location.pathname}?share=${SHARE_TOKEN}`);
    } catch (e) { console.error('ensureShareDoc failed', e); }
  }
})();

// ====== DOM ======
const lottie = window.lottie;
const dropzone       = document.getElementById('dropzone');
const controls       = document.getElementById('controls');
const bgFileInput    = document.getElementById('bgFile');
const assetFileInput = document.getElementById('assetFile');
const lottieFileInput= document.getElementById('lottieFile');

const bgLayer   = document.getElementById('bgLayer');
const mount     = document.getElementById('svgMount');
const stage     = document.getElementById('stage');
const browserEl = document.getElementById('browser');
const tabTitle  = document.getElementById('tabTitle');

const lottieWrap      = document.getElementById('lottieWrap');
const lottieClose     = document.getElementById('lottieClose');
const lottieContainer = document.getElementById('lottie');

// ====== state ======
let animation = null;
let currentLottieJsonText = null;
let framedMode = false;
let READ_ONLY  = false;

let MODE = 'desktop';
let BASE_W = 1440, BASE_H = 800;

// нормализованные координаты (0..1)
let openedFromShare = false;
let sharedRectNorm  = null;
let rectNormLive    = null;

/* ===== helpers ===== */
// фон установлен?
function hasBackground() {
  return !!extractCssUrl(bgLayer.style.backgroundImage);
}

// включить/выключить панель редактирования по факту фона
function updateEditingUIAvailability() {
  const enabled = hasBackground() && !READ_ONLY;
  dropzone.style.display = enabled ? 'grid' : 'none';
  controls.style.display = enabled ? 'flex' : 'none';
}
function resetLottieUI(){
  dragging=false; resizing=null;
  lottieWrap.classList.remove('active');
  lottieWrap.style.cursor='grab';
  document.body.style.cursor='';
  window.getSelection?.().removeAllRanges?.();
}
function hasBackground() {
  return !!extractCssUrl(bgLayer.style.backgroundImage);
}

function updateEditingUIAvailability() {
  const enabled = hasBackground() && !READ_ONLY;
  dropzone.style.display = enabled ? 'grid' : 'none';
  controls.style.display = enabled ? 'flex' : 'none';
}
function setReadOnly(on){
  READ_ONLY = !!on;
  if (controls) controls.style.display = on ? 'none' : 'flex';
  if (dropzone)  dropzone.style.display  = on ? 'none' : 'grid';

  bgFileInput.disabled    = on;
  assetFileInput.disabled = on;
  lottieFileInput.disabled= on;

  const btnShare = document.getElementById('btnShare');
  const btnClear = document.getElementById('btnClear');
  if (btnShare) btnShare.style.display = on ? 'none' : 'inline-block';
  if (btnClear) btnClear.style.display = on ? 'none' : 'inline-block';

  lottieWrap.style.pointerEvents = on ? 'none' : 'auto';
}
function applyLottieRectFromNorm(rect){
  if (!rect) return;
  const s = stage.getBoundingClientRect();
  Object.assign(lottieWrap.style, {
    left:   (rect.x * s.width)  + 'px',
    top:    (rect.y * s.height) + 'px',
    width:  (rect.w * s.width)  + 'px',
    height: (rect.h * s.height) + 'px'
  });
}
function computeRectNormFromCurrent(){
  const s = stage.getBoundingClientRect();
  const r = lottieWrap.getBoundingClientRect();
  return {
    x: (r.left - s.left) / s.width,
    y: (r.top  - s.top)  / s.height,
    w:  r.width  / s.width,
    h:  r.height / s.height
  };
}
function resetLottieRectToDefaults(){
  lottieWrap.style.left = '40px';
  lottieWrap.style.top  = '40px';
  lottieWrap.style.width  = '200px';
  lottieWrap.style.height = '200px';
}
function clearLottie(){
  if (animation){ animation.destroy(); animation = null; }
  lottieContainer.innerHTML = '';
  resetLottieUI();
  resetLottieRectToDefaults();
  lottieWrap.classList.add('hidden');
  lottieFileInput.value = '';
  currentLottieJsonText = null;
}

function parseNumberWithUnits(v){ if(v==null) return null; const n=parseFloat(String(v).replace(',','.')); return isFinite(n)?n:null; }
function ensureViewBox(svg){ if(!svg.getAttribute('viewBox')){ const w=parseNumberWithUnits(svg.getAttribute('width')); const h=parseNumberWithUnits(svg.getAttribute('height')); if(w&&h) svg.setAttribute('viewBox',`0 0 ${w} ${h}`);} }
function getSvgIntrinsicSize(svg){
  const vb = svg.getAttribute('viewBox');
  if (vb){ const p = vb.trim().split(/\s+/).map(Number); if (p.length===4 && p[2]>0 && p[3]>0) return {w:p[2], h:p[3]}; }
  const w = parseNumberWithUnits(svg.getAttribute('width'));
  const h = parseNumberWithUnits(svg.getAttribute('height'));
  if (w && h) return {w, h};
  return null;
}
function clearMount(){ mount.innerHTML=''; }
async function readFileAsDataURL(f){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(f); }); }
async function readFileAsText(f){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsText(f); }); }
function isSVGFile(f){ const t=(f.type||'').toLowerCase(); const n=(f.name||'').toLowerCase(); return t==='image/svg+xml'||n.endsWith('.svg'); }
function isRasterImageFile(f){ const t=(f.type||'').toLowerCase(); const n=(f.name||'').toLowerCase(); return (t.startsWith('image/')&&t!=='image/svg+xml')||/\.(png|jpe?g|webp|gif)$/i.test(n); }

/* ===== mode detection ===== */
function clamp(x,a,b){ return Math.max(a, Math.min(b,x)); }
function setDesktopBase(){
  MODE='desktop'; BASE_W=1440; BASE_H=800;
  tabTitle.textContent='Design Preview';
  browserEl.classList.remove('mobile');
}
function setMobileBaseFromIntrinsic(w,h){
  MODE='mobile';
  const targetW = clamp(Math.round(w), 360, 475);
  const scale   = targetW / w;
  BASE_W = targetW;
  BASE_H = clamp(Math.round(h * scale), 600, 900);
  tabTitle.textContent='Mobile Preview';
  browserEl.classList.add('mobile');
}
function detectAndSetModeByWidth(w,h){
  if (w>=360 && w<=475) { setMobileBaseFromIntrinsic(w,h); return; }
  const portrait = h >= w*1.2;
  if (portrait){
    if (w>=700 && w<=950)   { setMobileBaseFromIntrinsic(w/2, h/2); return; }
    if (w>=1050 && w<=1500) { setMobileBaseFromIntrinsic(w/3, h/3); return; }
  }
  setDesktopBase();
}

/* ===== layout ===== */
function layoutToBaseFrame(){
  const g  = 32;
  const ch = (MODE==='mobile'?0:64);
  const sidebarCss = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')) || 220;
  const sidebar    = READ_ONLY ? 0 : sidebarCss;

  const availW = window.innerWidth  - g*2 - sidebar - (sidebar ? 16 : 0);
  const availH = window.innerHeight - g*2;

  const s  = Math.min(availW/BASE_W, (availH - ch)/BASE_H);
  const sw = Math.round(BASE_W * s);
  const sh = Math.round(BASE_H * s);
  const bw = sw, bh = Math.round(ch + sh);

  const left = READ_ONLY
    ? Math.round((window.innerWidth  - bw) / 2)
    : Math.max(g + sidebar + 16, Math.round((window.innerWidth - bw) / 2));

  const top  = Math.round((window.innerHeight - bh) / 2);

  Object.assign(browserEl.style, {
    width:  bw+'px', height: bh+'px',
    left: left+'px', top: top+'px',
    right: 'auto', bottom: 'auto'
  });
  Object.assign(stage.style, { flex:'0 0 auto', height: sh+'px', width:'100%' });

  framedMode = true;
  browserEl.style.display = 'flex';
  controls.style.display  = READ_ONLY ? 'none' : 'flex';
  dropzone.style.display  = READ_ONLY ? 'none' : 'grid';
}
function layoutToEmpty(){
  Object.assign(browserEl.style, {
    left:'calc(var(--gutter) + var(--sidebar-w) + 16px)',
    top:'var(--gutter)', right:'var(--gutter)', bottom:'var(--gutter)',
    width:'', height:''
  });
  Object.assign(stage.style, { flex:'1 1 auto', height:'auto', width:'100%' });
  framedMode = false;
  browserEl.style.display='none';
  controls.style.display  = READ_ONLY ? 'none' : 'flex';
  dropzone.style.display  = READ_ONLY ? 'none' : 'grid';
}

/* ===== mount image/SVG ===== */
function mountSVG(svgText){
  const doc=new DOMParser().parseFromString(svgText,'image/svg+xml');
  const svg=doc.documentElement.tagName.toLowerCase()==='svg'?doc.documentElement:doc.querySelector('svg');
  if(!svg){ alert('Не удалось прочитать SVG.'); return; }

  const size = getSvgIntrinsicSize(svg);
  if (size) detectAndSetModeByWidth(size.w, size.h); else setDesktopBase();

  clearLottie();
  clearMount(); ensureViewBox(svg);
  svg.removeAttribute('width'); svg.removeAttribute('height'); svg.removeAttribute('style');
  svg.setAttribute('preserveAspectRatio','xMidYMin slice');
  Object.assign(svg.style,{width:'100%',height:'100%',inset:'0',position:'absolute'});
  mount.appendChild(svg);
  layoutToBaseFrame();
}
async function mountForegroundImage(dataURL){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{
      clearLottie();
      detectAndSetModeByWidth(img.naturalWidth, img.naturalHeight);
      clearMount();
      Object.assign(img.style,{objectFit:'cover',objectPosition:'top center',width:'100%',height:'100%',position:'absolute',inset:'0'});
      mount.appendChild(img);
      layoutToBaseFrame();
      res();
    };
    img.onerror=rej; img.src=dataURL;
  });
}

/* ===== inputs / paste ===== */
dropzone.addEventListener('click', ()=>{ if (READ_ONLY) return; assetFileInput.click(); });

assetFileInput.addEventListener('change', async e=>{
  if (READ_ONLY) return;
  const f=e.target.files?.[0]; if(!f) return;
  clearLottie();
  try{
    if (isSVGFile(f)){
      mountSVG(await readFileAsText(f));
    } else if (isRasterImageFile(f)){
      const webpBlob = await compressToWebP(f, { maxW: MAX_W, maxH: MAX_H, quality: WEBP_QUALITY });
      const dataURL  = await blobToDataURL(webpBlob);
      await mountForegroundImage(dataURL);
      console.log(`Сжато (file): ${(f.size/1024).toFixed(1)}KB → ${(webpBlob.size/1024).toFixed(1)}KB`);
    }
  }catch{ alert('Ошибка загрузки.'); }
  assetFileInput.value='';
});

bgFileInput.addEventListener('change', async e=>{
  if (READ_ONLY) return;
  const f=e.target.files?.[0]; if(!f) return;
  const url=await readFileAsDataURL(f);
  bgLayer.style.backgroundImage=`url("${url}")`;
  clearLottie();
  updateEditingUIAvailability();
  bgFileInput.value='';
});

window.addEventListener('paste', async e=>{
  if (READ_ONLY) return;
  const items=e.clipboardData?.items||[];
  for(const it of items){
    if(it.type==='image/svg+xml'){
      const f=it.getAsFile();
      if(f){ clearLottie(); mountSVG(await readFileAsText(f)); e.preventDefault(); return; }
    }
  }
  const text=e.clipboardData?.getData('text/plain');
  if(text && /<svg[\s>]/i.test(text)){ clearLottie(); mountSVG(text); e.preventDefault(); return; }
  if(text && (text.startsWith('data:image/') || /^(https?:\/\/).+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(text))){
    clearLottie(); await mountForegroundImage(text); e.preventDefault(); return;
  }
  for(const it of items){
    if(it.kind==='file' && it.type.startsWith('image/')){
      const f=it.getAsFile();
      const webpBlob = await compressToWebP(f, { maxW: MAX_W, maxH: MAX_H, quality: WEBP_QUALITY });
      const dataURL  = await blobToDataURL(webpBlob);
      clearLottie(); await mountForegroundImage(dataURL);
      console.log(`Сжато (paste): ${(f.size/1024).toFixed(1)}KB → ${(webpBlob.size/1024).toFixed(1)}KB`);
      e.preventDefault(); return;
    }
  }
});

/* ===== Lottie load / drag / resize / delete ===== */
lottieFileInput.addEventListener('change', e=>{
  if (READ_ONLY) return;
  const f=e.target.files?.[0]; if(!f) return;
  const r=new FileReader();
  r.onload=ev=>{
    currentLottieJsonText = ev.target.result;
    const json=JSON.parse(currentLottieJsonText);
    if(animation) animation.destroy();
    lottieContainer.innerHTML='';
    resetLottieRectToDefaults();
    lottieWrap.classList.remove('hidden');
    if(!framedMode) layoutToBaseFrame();
    animation=lottie.loadAnimation({container:lottieContainer,renderer:'svg',loop:true,autoplay:true,animationData:json});
    rectNormLive = computeRectNormFromCurrent();
    openedFromShare = false;
  };
  r.readAsText(f);
  lottieFileInput.value='';
});

let dragging=false, dx=0, dy=0;
lottieWrap.addEventListener('mousedown', e=>{
  if (READ_ONLY) return;
  if (e.target.classList.contains('handle') || e.target.id==='lottieClose') return;
  dragging=true; lottieWrap.classList.add('active');
  const rect=lottieWrap.getBoundingClientRect(); dx=e.clientX-rect.left; dy=e.clientY-rect.top;
  lottieWrap.style.cursor='grabbing'; e.preventDefault();
});
window.addEventListener('mousemove', e=>{
  if(!dragging) return;
  const r=stage.getBoundingClientRect();
  let x=e.clientX-r.left-dx, y=e.clientY-r.top-dy;
  x=Math.max(0, Math.min(x, r.width - lottieWrap.offsetWidth));
  y=Math.max(0, Math.min(y, r.height- lottieWrap.offsetHeight));
  lottieWrap.style.left=x+'px'; lottieWrap.style.top=y+'px';
});

const MIN_W=60, MIN_H=60; let resizing=null;
function getCursorForDir(dir){return ({nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize',n:'ns-resize',s:'ns-resize',w:'ew-resize',e:'ew-resize'})[dir]||'default';}
function startResize(dir,e){
  e.stopPropagation();
  const rect=lottieWrap.getBoundingClientRect(), parent=stage.getBoundingClientRect();
  resizing={dir,startX:e.clientX,startY:e.clientY,startL:rect.left-parent.left,startT:rect.top-parent.top,startW:rect.width,startH:rect.height};
  lottieWrap.classList.add('active'); document.body.style.cursor=getCursorForDir(dir);
}
function applyResize(e){
  if(!resizing) return;
  const r=stage.getBoundingClientRect(), dx=e.clientX-resizing.startX, dy=e.clientY-resizing.startY;
  let newL=resizing.startL, newT=resizing.startT, newW=resizing.startW, newH=resizing.startH, dir=resizing.dir;
  if(dir.includes('e')) newW=Math.max(MIN_W, resizing.startW+dx);
  if(dir.includes('s')) newH=Math.max(MIN_H, resizing.startH+dy);
  if(dir.includes('w')){ newW=Math.max(MIN_W, resizing.startW-dx); newL=resizing.startL+(resizing.startW-newW); }
  if(dir.includes('n')){ newH=Math.max(MIN_H, resizing.startH-dy); newT=resizing.startT+(resizing.startH-newH); }
  if(newL<0){ newW+=newL; newL=0; } if(newT<0){ newH+=newT; newT=0; }
  if(newL+newW>r.width) newW=r.width-newL; if(newT+newH>r.height) newH=r.height-newT;
  lottieWrap.style.left=newL+'px'; lottieWrap.style.top=newT+'px'; lottieWrap.style.width=newW+'px'; lottieWrap.style.height=newH+'px';
}
Array.from(lottieWrap.querySelectorAll('.handle')).forEach(h=>{
  h.addEventListener('mousedown', e=>{
    if (READ_ONLY) return;
    const dir = Array.from(h.classList).find(c=>['nw','ne','sw','se','n','s','w','e'].includes(c));
    startResize(dir, e);
  });
});
window.addEventListener('mousemove', applyResize);
window.addEventListener('mouseup', ()=>{
  if(dragging || resizing){
    dragging=false; resizing=null; document.body.style.cursor='';
    lottieWrap.classList.remove('active'); lottieWrap.style.cursor='grab';
    if (!lottieWrap.classList.contains('hidden')) {
      rectNormLive = computeRectNormFromCurrent();
    }
  }
});
window.addEventListener('keydown', e=>{ if(e.key==='Escape'){ resetLottieUI(); } });

lottieClose.addEventListener('click', ()=>{ clearLottie(); });

// ---- FIX: кнопка Очистить ----
document.getElementById('btnClear').addEventListener('click', () => {
  if (READ_ONLY) return;

  // очистка контента
  clearMount();
  clearLottie();
  bgLayer.style.backgroundImage = '';

  // вернуть базовые размеры/режим и пустой экран
  setDesktopBase();
  layoutToEmpty();

  // ОБЯЗАТЕЛЬНО: прячем панель, т.к. фона больше нет
  updateEditingUIAvailability();

  // сброс инпутов
  lottieFileInput.value = '';
  assetFileInput.value  = '';
  bgFileInput.value     = '';
});

// ЕДИНСТВЕННЫЙ обработчик ресайза
window.addEventListener('resize', ()=>{
  if (framedMode) layoutToBaseFrame();
  const rectToUse = rectNormLive || (openedFromShare ? sharedRectNorm : null);
  if (!lottieWrap.classList.contains('hidden') && rectToUse) applyLottieRectFromNorm(rectToUse);
});

/* стартуем пустыми */
setDesktopBase();
layoutToEmpty();

/* ===== СЖАТИЕ В WEBP ===== */
const WEBP_QUALITY = 0.82;
const MAX_W = 1920, MAX_H = 1080;

async function compressToWebP(file,{maxW,maxH,quality}){
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation:'from-image' }); }
  catch { const img = await loadHTMLImage(file); bitmap = await createImageBitmap(img); }
  const { targetW, targetH } = fitContain(bitmap.width, bitmap.height, maxW, maxH);
  const canvas = document.createElement('canvas'); canvas.width=targetW; canvas.height=targetH;
  const ctx = canvas.getContext('2d',{alpha:true}); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.drawImage(bitmap,0,0,targetW,targetH);
  const blob = await canvasToBlob(canvas,'image/webp',quality); if(!blob) throw new Error('Canvas toBlob null'); return blob;
}
function fitContain(w,h,maxW,maxH){ let r=Math.min(maxW/w,maxH/h); if(!isFinite(r)||r>1) r=1; return {targetW:Math.round(w*r), targetH:Math.round(h*r)}; }
function loadHTMLImage(file){ return new Promise((res,rej)=>{ const url=URL.createObjectURL(file); const img=new Image(); img.onload=()=>{URL.revokeObjectURL(url); res(img);}; img.onerror=e=>{URL.revokeObjectURL(url); rej(e);}; img.src=url; }); }
function canvasToBlob(canvas,type,quality){ return new Promise(res=>canvas.toBlob(res,type,quality)); }
function blobToDataURL(blob){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(blob); }); }

/* ===== share helpers ===== */
function dataUrlToBlob(dataUrl){
  const [hdr,b64] = dataUrl.split(',');
  const mime = (hdr.match(/data:(.*?);base64/)||[])[1] || 'application/octet-stream';
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:mime});
}
async function uploadToBucket(file){
  const up = await awStorage.createFile(BUCKET_ID, Appwrite.ID.unique(), file);
  return `${APPWRITE_ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${up.$id}/view?project=${APPWRITE_PROJECT}`;
}
function extractCssUrl(v){ if(!v) return null; const m=v.match(/url\(["']?(.*?)["']?\)/i); return m?m[1]:null; }
function nanoid(n=22){ const ABC='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'; let s=''; crypto.getRandomValues(new Uint32Array(n)).forEach(v=>s+=ABC[v%ABC.length]); return s; }
async function copyToClipboard(text){ try{ await navigator.clipboard.writeText(text); } catch{} }

// создаёт постоянный документ, если его ещё нет
async function ensureShareDoc(){
  if (SHARE_TOKEN) return SHARE_TOKEN;
  const token = nanoid(22);
  const now   = Math.floor(Date.now()/1000);
  const projectJson = { mode:MODE, baseW:BASE_W, baseH:BASE_H, backgroundUrl:null, foreground:null, lottie:null, schemaVersion:2 };
  await awDB.createDocument(DB_ID, SHARES_TABLE, token, {
    projectJson: JSON.stringify(projectJson),
    createdAt: now,
    revoked: false
  });
  SHARE_TOKEN = token;
  localStorage.setItem(STORAGE_TOKEN_KEY, token);
  return token;
}

/* ===== Поделиться (обновляем документ) ===== */
document.getElementById('btnShare').addEventListener('click', async ()=>{
  if (READ_ONLY) return;
  await createShare();
});

async function createShare(){
  const token = await ensureShareDoc();
  try{
    // фон
    const bgRaw = extractCssUrl(bgLayer.style.backgroundImage);
    let backgroundUrl = null;
    if (bgRaw){
      backgroundUrl = bgRaw.startsWith('data:')
        ? await uploadToBucket(new File([dataUrlToBlob(bgRaw)], 'bg.webp', { type:'image/webp' }))
        : bgRaw;
    }

    // foreground
    const fgImg = mount.querySelector('img');
    const fgSvg = mount.querySelector('svg');
    let foreground = null;
    if (fgImg){
      const src = fgImg.src;
      const url = src.startsWith('data:')
        ? await uploadToBucket(new File([dataUrlToBlob(src)], 'foreground.webp', { type:'image/webp' }))
        : src;
      foreground = { type:'image', url };
    } else if (fgSvg){
      const svgText = new XMLSerializer().serializeToString(fgSvg);
      foreground = { type:'svg', svgText };
    } else { alert('Добавь картинку или SVG перед шарингом.'); return; }

    if (!currentLottieJsonText){ alert('Добавь Lottie JSON перед шарингом.'); return; }

    const lottieRect = rectNormLive || computeRectNormFromCurrent();
    const lottieUrl  = await uploadToBucket(new File([currentLottieJsonText], 'anim.json', { type:'application/json' }));

    const projectJson = {
      mode: MODE, baseW: BASE_W, baseH: BASE_H,
      backgroundUrl,
      foreground,
      lottie: { url:lottieUrl, rect:lottieRect, renderer:'svg', loop:true, autoplay:true },
      schemaVersion: 2
    };

    await awDB.updateDocument(DB_ID, SHARES_TABLE, token, { projectJson: JSON.stringify(projectJson) });

    const link = `${location.origin}${location.pathname}?share=${token}`;
    await copyToClipboard(link);
    alert('Ссылка скопирована:\n' + link);
  }catch(err){
    console.error(err);
    alert('Не получилось создать/обновить ссылку. Открой консоль для деталей.');
  }
}

/* ===== Открытие по ссылке ===== */
(async function openShareIfAny(){
  const token = URL_TOKEN;
  if (!token) return;

  try{
    const doc = await awDB.getDocument(DB_ID, SHARES_TABLE, token);
    const pj  = JSON.parse(doc.projectJson);

    MODE   = pj.mode  || 'desktop';
    BASE_W = pj.baseW || 1440;
    BASE_H = pj.baseH || 800;

    setReadOnly(isViewer());
    openedFromShare = true;

    bgLayer.style.backgroundImage = pj.backgroundUrl ? `url("${pj.backgroundUrl}")` : '';
    updateEditingUIAvailability();

    layoutToBaseFrame();
    clearMount(); clearLottie();

    if (pj.foreground?.type==='image' && pj.foreground.url){
      await mountForegroundImage(pj.foreground.url);
    } else if (pj.foreground?.type==='svg' && pj.foreground.svgText){
      mountSVG(pj.foreground.svgText);
    }

    if (pj.lottie?.url && pj.lottie?.rect){
      const resp = await fetch(pj.lottie.url, { cache:'no-store' });
      if (!resp.ok) throw new Error('Failed to fetch lottie json: '+resp.status);
      const animJson = await resp.json();

      sharedRectNorm = pj.lottie.rect;
      rectNormLive   = sharedRectNorm;

      lottieWrap.classList.remove('hidden');
      applyLottieRectFromNorm(rectNormLive);

      animation = lottie.loadAnimation({
        container: lottieContainer,
        renderer:  pj.lottie.renderer || 'svg',
        loop:      pj.lottie.loop !== false,
        autoplay:  pj.lottie.autoplay !== false,
        animationData: animJson
      });

      currentLottieJsonText = JSON.stringify(animJson);
    }
  }catch(e){
    console.error(e);
    alert('Ссылка недоступна или повреждена.');
  }
})();

