// === Appwrite init ===
const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT  = '690ca6e20020dbc4f584'; // без <>
const DB_ID = '690ca7cd0022f8fe8ff8';
const SHARES_TABLE = 'shares';
const BUCKET_ID = 'project-assets';

const awClient  = new Appwrite.Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT);
const awAccount = new Appwrite.Account(awClient);
const awDB      = new Appwrite.Databases(awClient);
const awStorage = new Appwrite.Storage(awClient);

// анонимная сессия (нужна для Create)
(async () => { try { await awAccount.get(); } catch { await awAccount.createAnonymousSession(); } })();

const lottie = window.lottie;
const dropzone = document.getElementById('dropzone');
const controls = document.getElementById('controls');
const bgFileInput = document.getElementById('bgFile');
const assetFileInput = document.getElementById('assetFile');
const lottieFileInput = document.getElementById('lottieFile');

const bgLayer = document.getElementById('bgLayer');
const mount = document.getElementById('svgMount');
const stage = document.getElementById('stage');
const browserEl = document.getElementById('browser');
const tabTitle = document.getElementById('tabTitle');

const lottieWrap = document.getElementById('lottieWrap');
const lottieClose = document.getElementById('lottieClose');
const lottieContainer = document.getElementById('lottie');

let animation = null;
let currentLottieJsonText = null; // исходный Lottie JSON (string)
let framedMode = false;
let READ_ONLY = false; // режим только просмотра
let MODE = 'desktop'; // 'desktop' | 'mobile'
let BASE_W = 1440, BASE_H = 800;

// нормализованные координаты (0..1) для ресайза
let openedFromShare = false;    // режим открыт по ссылке
let sharedRectNorm = null;      // {x,y,w,h} из шары
let rectNormLive = null;        // текущие доли в редакторе

/* ===== helpers ===== */
function resetLottieUI(){
  dragging=false; resizing=null;
  lottieWrap.classList.remove('active');
  lottieWrap.style.cursor='grab';
  document.body.style.cursor='';
  window.getSelection?.().removeAllRanges?.();
}
function setReadOnly(on){
  READ_ONLY = !!on;
  
  // скрываем панели редактирования
  if (controls) controls.style.display = on ? 'none' : 'flex';
  if (dropzone) dropzone.style.display = on ? 'none' : 'grid';

  // отключаем загрузку
  bgFileInput.disabled = on;
  assetFileInput.disabled = on;
  lottieFileInput.disabled = on;
  
  // скрываем кнопки Очистить / Поделиться
  const btnShare = document.getElementById('btnShare');
  const btnClear = document.getElementById('btnClear');
  if (btnShare) btnShare.style.display = on ? 'none' : 'inline-block';
  if (btnClear) btnClear.style.display = on ? 'none' : 'inline-block';
  
  // отключаем взаимодействие с лотти
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
    w:  r.width / s.width,
    h:  r.height/ s.height
  };
}

// сброс размеров/позиции лотти-контейнера к дефолту
function resetLottieRectToDefaults(){
  lottieWrap.style.left = '40px';
  lottieWrap.style.top = '40px';
  lottieWrap.style.width = '200px';
  lottieWrap.style.height = '200px';
}

// очистка Lottie
function clearLottie(){
  if (animation) { animation.destroy(); animation = null; }
  lottieContainer.innerHTML = '';
  resetLottieUI();
  resetLottieRectToDefaults();
  lottieWrap.classList.add('hidden');
  lottieFileInput.value = '';
  currentLottieJsonText = null;
  // сбрасывать norm не будем — редактор может перезаписать сам
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
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
function setDesktopBase(){
  MODE='desktop';
  BASE_W=1440; BASE_H=800;
  tabTitle.textContent='Design Preview';
  browserEl.classList.remove('mobile');
}
function setMobileBaseFromIntrinsic(w, h){
  MODE='mobile';
  const targetW = clamp(Math.round(w), 360, 475);
  const scale = targetW / w;
  BASE_W = targetW;
  BASE_H = clamp(Math.round(h * scale), 600, 900);
  tabTitle.textContent = 'Mobile Preview';
  browserEl.classList.add('mobile');
}
function detectAndSetModeByWidth(w, h){
  if (w >= 360 && w <= 475) { setMobileBaseFromIntrinsic(w, h); return; }
  const portrait = h >= w * 1.2;
  if (portrait) {
    if (w >= 700 && w <= 950) { setMobileBaseFromIntrinsic(w / 2, h / 2); return; }
    if (w >= 1050 && w <= 1500) { setMobileBaseFromIntrinsic(w / 3, h / 3); return; }
  }
  setDesktopBase();
}

/* ===== layout ===== */
function layoutToBaseFrame() {
  const g  = 32;
  const ch = (MODE === 'mobile' ? 0 : 64);

  // реальная (эффективная) ширина левой панели:
  const sidebarCss = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')
  ) || 220;

  // если мы в режиме просмотра (viewer) – считаем, что панели нет
  const sidebar = READ_ONLY ? 0 : sidebarCss;

  const availW = window.innerWidth  - g * 2 - sidebar - (sidebar ? 16 : 0);
  const availH = window.innerHeight - g * 2;

  const s  = Math.min(availW / BASE_W, (availH - ch) / BASE_H);
  const sw = Math.round(BASE_W * s);
  const sh = Math.round(BASE_H * s);
  const bw = sw;
  const bh = Math.round(ch + sh);

  // центрирование: если панели нет — строго по центру, если есть — центр с учётом панели
  let left = READ_ONLY
    ? Math.round((window.innerWidth  - bw) / 2)
    : Math.max(g + sidebar + 16, Math.round((window.innerWidth - bw) / 2));

  let top  = Math.round((window.innerHeight - bh) / 2);

  Object.assign(browserEl.style, {
    width:  bw + 'px',
    height: bh + 'px',
    left:   left + 'px',
    top:    top  + 'px',
    right:  'auto',
    bottom: 'auto'
  });

  Object.assign(stage.style, { flex: '0 0 auto', height: sh + 'px', width: '100%' });

  framedMode = true;
  browserEl.style.display = 'flex';
  controls.style.display  = READ_ONLY ? 'none' : 'flex';
  dropzone.style.display  = READ_ONLY ? 'none' : 'grid';
}
function layoutToEmpty() {
  Object.assign(browserEl.style, {
    left: 'calc(var(--gutter) + var(--sidebar-w) + 16px)',
    top: 'var(--gutter)', right: 'var(--gutter)', bottom: 'var(--gutter)',
    width: '', height: ''
  });
  Object.assign(stage.style, { flex:'1 1 auto', height: 'auto', width: '100%' });

  framedMode = false;
  browserEl.style.display = 'none';
  controls.style.display = READ_ONLY ? 'none' : 'flex';
  dropzone.style.display = READ_ONLY ? 'none' : 'grid';

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
dropzone.addEventListener('click', () => { if (READ_ONLY) return; assetFileInput.click(); });
assetFileInput.addEventListener('change', async e=>{
if (READ_ONLY) return;
  const f=e.target.files?.[0]; if(!f) return;
  clearLottie();
  try{
    if(isSVGFile(f)){
      mountSVG(await readFileAsText(f));
    } else if(isRasterImageFile(f)){
      const webpBlob = await compressToWebP(f, { maxW: MAX_W, maxH: MAX_H, quality: WEBP_QUALITY });
      const dataURL = await blobToDataURL(webpBlob);
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
  bgFileInput.value='';
});

window.addEventListener('paste', async e=>{
if (READ_ONLY) return;
  const items=e.clipboardData?.items||[];
  for(const it of items){
    if(it.type==='image/svg+xml'){
      const f=it.getAsFile();
      if(f){
        clearLottie();
        mountSVG(await readFileAsText(f));
        e.preventDefault();
        return;
      }
    }
  }
  const text=e.clipboardData?.getData('text/plain');
  if(text && /<svg[\s>]/i.test(text)){
    clearLottie();
    mountSVG(text);
    e.preventDefault();
    return;
  }
  if(text && (text.startsWith('data:image/') || /^(https?:\/\/).+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(text)) ){
    clearLottie();
    await mountForegroundImage(text);
    e.preventDefault();
    return;
  }
  for(const it of items){
    if(it.kind==='file' && it.type.startsWith('image/')){
      const f=it.getAsFile();
      const webpBlob = await compressToWebP(f, { maxW: MAX_W, maxH: MAX_H, quality: WEBP_QUALITY });
      const dataURL = await blobToDataURL(webpBlob);
      clearLottie();
      await mountForegroundImage(dataURL);
      console.log(`Сжато (paste): ${(f.size/1024).toFixed(1)}KB → ${(webpBlob.size/1024).toFixed(1)}KB`);
      e.preventDefault();
      return;
    }
  }
});

/* ===== Lottie load / drag / resize / delete ===== */
lottieFileInput.addEventListener('change', e=>{
  if (READ_ONLY) return;
  const f=e.target.files?.[0]; if(!f) return;
  const r=new FileReader();
  r.onload=ev=>{
    currentLottieJsonText = ev.target.result; // сохраняем текст
    const json=JSON.parse(currentLottieJsonText);
    if(animation) animation.destroy();
    lottieContainer.innerHTML='';
    resetLottieRectToDefaults();
    lottieWrap.classList.remove('hidden');
    if(!framedMode) layoutToBaseFrame();
    animation=lottie.loadAnimation({container:lottieContainer,renderer:'svg',loop:true,autoplay:true,animationData:json});
    // зафиксируем стартовые доли для ресайза
    rectNormLive = computeRectNormFromCurrent();
    openedFromShare = false; // это локальная работа, не режим шары
  };
  r.readAsText(f);
  lottieFileInput.value='';
});

let dragging=false, dx=0, dy=0;
lottieWrap.addEventListener('mousedown', e=>{
if (READ_ONLY) return;
  if(e.target.classList.contains('handle') || e.target.id==='lottieClose') return;
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
  if(dir.includes('w')) { newW=Math.max(MIN_W, resizing.startW-dx); newL=resizing.startL+(resizing.startW-newW); }
  if(dir.includes('n')) { newH=Math.max(MIN_H, resizing.startH-dy); newT=resizing.startT+(resizing.startH-newH); }
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
    // после любого перемещения/ресайза — обновим нормализованные доли
    if (!lottieWrap.classList.contains('hidden')) {
      rectNormLive = computeRectNormFromCurrent();
    }
  }
});
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ resetLottieUI(); } });

lottieClose.addEventListener('click', ()=>{ clearLottie(); });
/* overlay */
document.getElementById('btnClear').addEventListener('click', ()=>{
  if (READ_ONLY) return;
  clearMount();
  clearLottie();
  bgLayer.style.backgroundImage='';
  setDesktopBase();
  layoutToEmpty(); lottieFileInput.value=''; assetFileInput.value=''; bgFileInput.value='';
});

// ЕДИНСТВЕННЫЙ обработчик ресайза окна
window.addEventListener('resize', () => {
  if (framedMode) layoutToBaseFrame();
  // если есть актуальные доли — применим
  const rectToUse = rectNormLive || (openedFromShare ? sharedRectNorm : null);
  if (!lottieWrap.classList.contains('hidden') && rectToUse) {
    applyLottieRectFromNorm(rectToUse);
  }
});

/* стартуем пустыми */
setDesktopBase();
layoutToEmpty();

/* ===== СЖАТИЕ В WEBP ===== */
const WEBP_QUALITY = 0.82;     // 0..1
const MAX_W = 1920;
const MAX_H = 1080;

async function compressToWebP(file, { maxW, maxH, quality }) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const img = await loadHTMLImage(file);
    bitmap = await createImageBitmap(img);
  }
  const { targetW, targetH } = fitContain(bitmap.width, bitmap.height, maxW, maxH);
  const canvas = document.createElement('canvas');
  canvas.width  = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  const blob = await canvasToBlob(canvas, 'image/webp', quality);
  if (!blob) throw new Error('Canvas toBlob вернул null');
  return blob;
}

function fitContain(w, h, maxW, maxH) {
  let ratio = Math.min(maxW / w, maxH / h);
  if (!isFinite(ratio) || ratio > 1) ratio = 1;
  return { targetW: Math.round(w * ratio), targetH: Math.round(h * ratio) };
}

function loadHTMLImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function blobToDataURL(blob){
  return new Promise((res, rej)=>{
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/* ===== helpers для шаринга ===== */
function dataUrlToBlob(dataUrl) {
  const [hdr, b64] = dataUrl.split(',');
  const mime = (hdr.match(/data:(.*?);base64/)||[])[1] || 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i=0; i<bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function uploadToBucket(file) {
  const up = await awStorage.createFile(BUCKET_ID, Appwrite.ID.unique(), file);
  return `${APPWRITE_ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${up.$id}/view?project=${APPWRITE_PROJECT}`;
}

function extractCssUrl(v) {
  if (!v) return null;
  const m = v.match(/url\(["']?(.*?)["']?\)/i);
  return m ? m[1] : null;
}

function nanoid(n=22){
  const ABC='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s=''; crypto.getRandomValues(new Uint32Array(n)).forEach(v=> s+=ABC[v%ABC.length]);
  return s;
}

async function copyToClipboard(text){
  try { await navigator.clipboard.writeText(text); } catch {}
}

/* ===== Поделиться ===== */
document.getElementById('btnShare').addEventListener('click', ()=>{ if (READ_ONLY) return; createShare(); });

async function createShare(){
  try{
    // фон
    const bgRaw = extractCssUrl(bgLayer.style.backgroundImage);
    let backgroundUrl = null;
    if (bgRaw) {
      backgroundUrl = bgRaw.startsWith('data:')
        ? await uploadToBucket(new File([dataUrlToBlob(bgRaw)], 'bg.webp', { type: 'image/webp' }))
        : bgRaw;
    }

    // передний слой
    const fgImg = mount.querySelector('img');
    const fgSvg = mount.querySelector('svg');
    let foreground = null;

    if (fgImg) {
      const src = fgImg.src;
      const url = src.startsWith('data:')
        ? await uploadToBucket(new File([dataUrlToBlob(src)], 'foreground.webp', { type: 'image/webp' }))
        : src;
      foreground = { type: 'image', url };
    } else if (fgSvg) {
      const svgText = new XMLSerializer().serializeToString(fgSvg);
      foreground = { type: 'svg', svgText };
    } else {
      alert('Добавь картинку или SVG перед шарингом.');
      return;
    }

    // Lottie обязателен
    if (!currentLottieJsonText) {
      alert('Добавь Lottie JSON перед шарингом.');
      return;
    }

    // нормализуем позицию/размер относительно текущего stage
    const lottieRect = rectNormLive || computeRectNormFromCurrent();

    const lottieUrl = await uploadToBucket(new File([currentLottieJsonText], 'anim.json', { type: 'application/json' }));

    const projectJson = {
      mode: MODE, baseW: BASE_W, baseH: BASE_H,
      backgroundUrl,
      foreground,
      lottie: { url: lottieUrl, rect: lottieRect, renderer: 'svg', loop: true, autoplay: true },
      schemaVersion: 2
    };

    const token = nanoid(22);
    const now = Math.floor(Date.now()/1000);

    await awDB.createDocument(DB_ID, SHARES_TABLE, token, {
      projectJson: JSON.stringify(projectJson), // колонка string
      createdAt: now,
      revoked: false
    });

    const link = `${location.origin}${location.pathname}?share=${token}`;
    await copyToClipboard(link);
    alert('Ссылка скопирована:\n' + link);
  }catch(err){
    console.error(err);
    alert('Не получилось создать ссылку. Открой консоль для деталей.');
  }
}

/* ===== Открытие по ссылке ===== */
(async function openShareIfAny(){
  const params = new URLSearchParams(location.search);
  const token = params.get('share');
  if (!token) return;

  try{
    // 1) Получаем документ
    const doc = await awDB.getDocument(DB_ID, SHARES_TABLE, token);
    const pj = JSON.parse(doc.projectJson);

    // 2) Фон
    bgLayer.style.backgroundImage = pj.backgroundUrl ? `url("${pj.backgroundUrl}")` : '';

    // 3) Режим и базовые размеры — сразу строим фрейм,
    //    чтобы знать актуальные размеры stage
    MODE   = pj.mode  || 'desktop';
    BASE_W = pj.baseW || 1440;
    BASE_H = pj.baseH || 800;
    setReadOnly(true);       // <— зритель не редактирует
    openedFromShare = true;  // было уже у тебя, пусть остаётся
    layoutToBaseFrame();
    MODE = pj.mode || 'desktop';
    BASE_W = pj.baseW || 1440;
    BASE_H = pj.baseH || 800;
    layoutToBaseFrame();
    setReadOnly(true); // <- зритель

    // 4) Сбрасываем текущее содержимое
    clearMount();
    clearLottie();

    // 5) Передний слой (картинка/ SVG)
    if (pj.foreground?.type === 'image' && pj.foreground.url) {
      await mountForegroundImage(pj.foreground.url);
    } else if (pj.foreground?.type === 'svg' && pj.foreground.svgText) {
      mountSVG(pj.foreground.svgText);
    }

    // 6) Lottie
    if (pj.lottie?.url && pj.lottie?.rect) {
      const resp = await fetch(pj.lottie.url, { cache: 'no-store' });
      if (!resp.ok) throw new Error('Failed to fetch lottie json: ' + resp.status);
      const animJson = await resp.json();

      openedFromShare = true;
      sharedRectNorm = pj.lottie.rect;
      rectNormLive = sharedRectNorm; // единый источник для ресайза

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






