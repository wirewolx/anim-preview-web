const lottie = window.lottie;

// === SHARE helpers ===
function getBgUrl() {
  const v = bgLayer.style.backgroundImage || "";
  const m = v.match(/^url\(["']?(.*)["']?\)$/);
  return m ? m[1] : "";
}
function getMountState() {
  const node = mount.firstElementChild;
  if (!node) return null;
  if (node.tagName === 'IMG') return { type: 'img', data: node.src };
  if (node.tagName === 'SVG') return { type: 'svg', data: node.outerHTML };
  return null;
}
function getLottieRect() {
  const s = getComputedStyle(lottieWrap);
  return {
    left: parseFloat(s.left) || 0,
    top: parseFloat(s.top) || 0,
    width: parseFloat(s.width) || 200,
    height: parseFloat(s.height) || 200
  };
}
// === image compress helper (WebP) ===
async function compressDataUrlToWebP(dataURL, maxW = 1280, maxH = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const k = Math.min(1, maxW / width, maxH / height);
      if (k < 1) { width = Math.round(width * k); height = Math.round(height * k); }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const out = canvas.toDataURL('image/webp', quality);
      resolve(out);
    };
    img.onerror = reject;
    img.src = dataURL;
  });
}
async function shareCreateLink() {
  // 1) собираем состояние
  let bg = getBgUrl() || null;
  let mountState = getMountState();

  // 2) сжимаем фон, если это dataURL
  if (bg && bg.startsWith('data:image/')) {
    try { bg = await compressDataUrlToWebP(bg, 1280, 1280, 0.75); } catch {}
  }

  // 3) сжимаем foreground IMG, если это dataURL
  if (mountState && mountState.type === 'img' && mountState.data && mountState.data.startsWith('data:image/')) {
    try { mountState = { ...mountState, data: await compressDataUrlToWebP(mountState.data, 1280, 1280, 0.75) }; } catch {}
  }

  const stateObj = {
    mode: MODE,
    base: { w: BASE_W, h: BASE_H },
    bg,
    mount: mountState,
    lottie: animation ? { data: animation.animationData || null, rect: getLottieRect() } : null
  };

  // 4) проверяем лимит jsonbin free (100 KB)
  const raw = JSON.stringify(stateObj);
  const bytes = new Blob([raw]).size;
  if (bytes > 100 * 1024) {
    alert(`Сцена ${Math.round(bytes/1024)} KB — больше лимита 100 KB (jsonbin Free).
Сделай фон/картинку меньше, снизь качество, или облегчи Lottie.`);
    return;
  }

  // 5) отправляем в jsonbin (публичный bin)
  try {
    const res = await fetch("https://api.jsonbin.io/v3/b", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": "$2a$10$FvoTg452fwA4QAw4/b1IBO8zW9uW6GkTeKn6oK3L3vdaxVysBmWv6",   // <-- вставь свой ключ
        "X-Bin-Private": "false"          // публичный: чтение без ключа
      },
      body: raw
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('JSONBin error:', res.status, txt);
      alert(`Ошибка при создании ссылки (код ${res.status}).`);
      return;
    }

    const data = await res.json();
    const id = data?.metadata?.id;
    if (!id) {
      console.error('No id in response:', data);
      alert('Ошибка: сервер не вернул id.');
      return;
    }

    const link = `${location.origin}${location.pathname}#id=${id}`;
    try { await navigator.clipboard.writeText(link); alert('Ссылка скопирована в буфер обмена!'); }
    catch { prompt('Скопируйте ссылку:', link); }
  } catch (err) {
    console.error('Network error:', err);
    alert('Ошибка сети при создании ссылки.');
  }
}
// === DOM refs ===
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
let framedMode = false;
let MODE = 'desktop'; // 'desktop' | 'mobile'
let BASE_W = 1440, BASE_H = 800;

/* ===== helpers ===== */
function resetLottieUI(){
  dragging=false; resizing=null;
  lottieWrap.classList.remove('active');
  lottieWrap.style.cursor='grab';
  document.body.style.cursor='';
  window.getSelection?.().removeAllRanges?.();
}
function resetLottieRectToDefaults(){
  lottieWrap.style.left = '40px';
  lottieWrap.style.top = '40px';
  lottieWrap.style.width = '200px';
  lottieWrap.style.height = '200px';
}
function clearLottie(){
  if (animation) { animation.destroy(); animation = null; }
  lottieContainer.innerHTML = '';
  resetLottieUI();
  resetLottieRectToDefaults();
  lottieWrap.classList.add('hidden');
  lottieFileInput.value = '';
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
  const g = 32;
  const ch = (MODE==='mobile' ? 0 : 64);
  const sidebar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')) || 220;

  const availW = window.innerWidth - g*2 - sidebar - 16;
  const availH = window.innerHeight - g*2;
  const s = Math.min(availW/BASE_W, (availH - ch)/BASE_H);
  const sw = Math.round(BASE_W*s);
  const sh = Math.round(BASE_H*s);
  const bw = sw, bh = Math.round(ch + sh);

  const left = Math.max(g + sidebar + 16, Math.round((window.innerWidth - bw)/2));
  const top  = Math.max(g, Math.round((window.innerHeight - bh)/2));

  Object.assign(browserEl.style, {
    width: bw + 'px', height: bh + 'px',
    left: left + 'px', top: top + 'px',
    right: 'auto', bottom: 'auto'
  });
  Object.assign(stage.style, { flex:'0 0 auto', height: sh + 'px', width: '100%' });

  framedMode = true;
  browserEl.style.display = 'flex';
  controls.style.display = 'flex';
  dropzone.style.display = 'none';
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
  controls.style.display = 'none';
  dropzone.style.display = 'grid';
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
dropzone.addEventListener('click', () => assetFileInput.click());

assetFileInput.addEventListener('change', async e=>{
  const f=e.target.files?.[0]; if(!f) return;
  clearLottie();
  try{
    if(isSVGFile(f)){ mountSVG(await readFileAsText(f)); }
    else if(isRasterImageFile(f)){ await mountForegroundImage(await readFileAsDataURL(f)); }
  }catch{ alert('Ошибка загрузки.'); }
  assetFileInput.value='';
});

// фон
bgFileInput.addEventListener('change', async e=>{
  const f=e.target.files?.[0]; if(!f) return;
  const url=await readFileAsDataURL(f);
  bgLayer.style.backgroundImage=`url("${url}")`;
  clearLottie();
  bgFileInput.value='';
  if(!framedMode) layoutToBaseFrame();
});

window.addEventListener('paste', async e=>{
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
      const dataURL=await readFileAsDataURL(f);
      clearLottie();
      await mountForegroundImage(dataURL);
      e.preventDefault();
      return;
    }
  }
});

/* ===== Lottie load / drag / resize / delete ===== */
lottieFileInput.addEventListener('change', e=>{
  const f=e.target.files?.[0]; if(!f) return;
  const r=new FileReader();
  r.onload=ev=>{
    const json=JSON.parse(ev.target.result);
    if(animation) animation.destroy();
    lottieContainer.innerHTML='';
    resetLottieRectToDefaults();
    lottieWrap.classList.remove('hidden');
    if(!framedMode) layoutToBaseFrame();
    animation=lottie.loadAnimation({container:lottieContainer,renderer:'svg',loop:true,autoplay:true,animationData:json});
  };
  r.readAsText(f);
  lottieFileInput.value='';
});

let dragging=false, dx=0, dy=0;
lottieWrap.addEventListener('mousedown', e=>{
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
    const dir = Array.from(h.classList).find(c=>['nw','ne','sw','se','n','s','w','e'].includes(c));
    startResize(dir, e);
  });
});
window.addEventListener('mousemove', applyResize);
window.addEventListener('mouseup', ()=>{
  if(dragging || resizing){
    dragging=false; resizing=null; document.body.style.cursor='';
    lottieWrap.classList.remove('active'); lottieWrap.style.cursor='grab';
  }
});
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ resetLottieUI(); } });

lottieClose.addEventListener('click', ()=>{ clearLottie(); });

// overlay
document.getElementById('btnShare').addEventListener('click', shareCreateLink);
document.getElementById('btnClear').addEventListener('click', ()=>{
  clearMount();
  clearLottie();
  bgLayer.style.backgroundImage='';
  setDesktopBase();
  layoutToEmpty();
  lottieFileInput.value=''; assetFileInput.value=''; bgFileInput.value='';
});

window.addEventListener('resize', ()=>{ if(framedMode) layoutToBaseFrame(); });

// старт
setDesktopBase();
layoutToEmpty();

(function () {
  // самовызывающаяся функция без async — внутри используем промисы
  const h = location.hash || "";
  if (!h.startsWith("#id=")) return;
  const id = h.slice(4);

  fetch(`https://api.jsonbin.io/v3/b/${id}/latest`)
    .then(async (res) => {
      if (!res.ok) {
        const txt = await res.text();
        console.warn("Load error:", res.status, txt);
        return null;
      }
      return res.json();
    })
    .then(async (payload) => {
      if (!payload) return;
      const stateObj = payload.record;

      // фон
      if (stateObj.bg) {
        bgLayer.style.backgroundImage = `url("${stateObj.bg}")`;
      }

      // foreground
      if (stateObj.mount) {
        if (stateObj.mount.type === "img") {
          await mountForegroundImage(stateObj.mount.data);
        } else if (stateObj.mount.type === "svg") {
          mountSVG(stateObj.mount.data);
        }
      } else if (!framedMode) {
        layoutToBaseFrame();
      }

      // lottie
      if (stateObj.lottie && stateObj.lottie.data) {
        lottieWrap.classList.remove("hidden");
        if (!framedMode) layoutToBaseFrame();
        if (animation) { animation.destroy(); animation = null; }
        lottieContainer.innerHTML = "";
        animation = lottie.loadAnimation({
          container: lottieContainer,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData: stateObj.lottie.data
        });
        const r = stateObj.lottie.rect || {};
        if (r.left != null)   lottieWrap.style.left = `${r.left}px`;
        if (r.top  != null)   lottieWrap.style.top  = `${r.top}px`;
        if (r.width!= null)   lottieWrap.style.width = `${r.width}px`;
        if (r.height!= null)  lottieWrap.style.height= `${r.height}px`;
      }

      if (!framedMode) layoutToBaseFrame();
    })
    .catch((e) => {
      console.warn("Share state load error:", e);
    });
})();




