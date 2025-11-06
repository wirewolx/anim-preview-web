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

    // ★ Новый: полный сброс размеров/позиции лотти-контейнера к дефолту
    function resetLottieRectToDefaults(){
      lottieWrap.style.left = '40px';
      lottieWrap.style.top = '40px';
      lottieWrap.style.width = '200px';
      lottieWrap.style.height = '200px';
    }

    // Новая универсальная очистка Lottie (усиленная)
    function clearLottie(){
      if (animation) { animation.destroy(); animation = null; }
      lottieContainer.innerHTML = '';
      resetLottieUI();
      resetLottieRectToDefaults(); // ★ гарантируем, что следующий лотти появится в видимой области
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
      browserEl.classList.remove('mobile');        // ★ mobile frame toggle
    }
    function setMobileBaseFromIntrinsic(w, h){
      MODE='mobile';
      const targetW = clamp(Math.round(w), 360, 475); // уважаем диапазон 360–475
      const scale = targetW / w;
      BASE_W = targetW;
      // ★ ограничение высоты для мобилки: минимум 600, максимум 900
      BASE_H = clamp(Math.round(h * scale), 600, 900);
      tabTitle.textContent = 'Mobile Preview';
      browserEl.classList.add('mobile');            // ★ mobile frame toggle
    }
    function detectAndSetModeByWidth(w, h){
      // 1) точный мобильный диапазон
      if (w >= 360 && w <= 475) { setMobileBaseFromIntrinsic(w, h); return; }

      // 2) fallback для портретных @2x/@3x скринов при Ctrl+V (без «умного» общего детектора)
      const portrait = h >= w * 1.2; // мягкий порог портретности
      if (portrait) {
        // частый случай: 360–475 @2x => 720–950
        if (w >= 700 && w <= 950) { setMobileBaseFromIntrinsic(w / 2, h / 2); return; }
        // ещё случай: 360–475 @3x => 1080–1425
        if (w >= 1050 && w <= 1500) { setMobileBaseFromIntrinsic(w / 3, h / 3); return; }
      }

      // иначе — десктоп
      setDesktopBase();
    }

    /* ===== layout (учитываем левую панель) ===== */
    function layoutToBaseFrame() {
      const g = 32;
      const ch = (MODE==='mobile' ? 0 : 64); // ★ для телефона не учитываем верхнюю «хром»-высоту
      const sidebar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')) || 220;

      // доступная ширина уменьшается на панель + промежуток (16px)
      const availW = window.innerWidth - g*2 - sidebar - 16;
      const availH = window.innerHeight - g*2;
      const s = Math.min(availW/BASE_W, (availH - ch)/BASE_H);
      const sw = Math.round(BASE_W*s);
      const sh = Math.round(BASE_H*s);
      const bw = sw, bh = Math.round(ch + sh);

      // позиционируем «устройство» с учётом панели слева
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
      // в пустом режиме панель скрыта, браузер растянут (но мы всё равно оставим сдвиг по CSS)
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

      // Определяем режим по intrinsic ширине
      const size = getSvgIntrinsicSize(svg);
      if (size) detectAndSetModeByWidth(size.w, size.h); else setDesktopBase();

      clearLottie();                 // <— очищаем лотти при новой вставке
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
          clearLottie(); // <— очищаем лотти перед пересчётом фрейма

          // Режим: мобильный, если ширина 360–475 (или портретный @2x/@3x fallback), иначе — десктоп
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
      clearLottie(); // ★ гарантируем удаление лотти при КАЖДОЙ новой загрузке картинки/SVG
      try{
        if(isSVGFile(f)){ mountSVG(await readFileAsText(f)); }
        else if(isRasterImageFile(f)){ await mountForegroundImage(await readFileAsDataURL(f)); }
      }catch{ alert('Ошибка загрузки.'); }
      assetFileInput.value=''; // можно снова выбрать тот же файл
    });

    // фон: просто задаём bgLayer
    bgFileInput.addEventListener('change', async e=>{
      const f=e.target.files?.[0]; if(!f) return;
      const url=await readFileAsDataURL(f);
      bgLayer.style.backgroundImage=`url("${url}")`;
      clearLottie(); // <— очищаем лотти при смене фона (чтобы потом можно было загрузить заново)
      bgFileInput.value='';
      if(!framedMode) layoutToBaseFrame();
    });

    window.addEventListener('paste', async e=>{
      const items=e.clipboardData?.items||[];
      // 1) Прямой SVG как файл из буфера
      for(const it of items){
        if(it.type==='image/svg+xml'){
          const f=it.getAsFile();
          if(f){
            clearLottie(); // <— перед монтированием
            mountSVG(await readFileAsText(f));
            e.preventDefault();
            return;
          }
        }
      }
      // 2) Текстовый SVG
      const text=e.clipboardData?.getData('text/plain');
      if(text && /<svg[\s>]/i.test(text)){
        clearLottie(); // <— перед монтированием
        mountSVG(text);
        e.preventDefault();
        return;
      }
      // 3) dataURL или http(s)-ссылка на картинку
      if(text && (text.startsWith('data:image/') || /^(https?:\/\/).+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(text)) ){
        clearLottie(); // <— перед монтированием
        await mountForegroundImage(text);
        e.preventDefault();
        return;
      }
      // 4) Растровая картинка как файл
      for(const it of items){
        if(it.kind==='file' && it.type.startsWith('image/')){
          const f=it.getAsFile();
          const dataURL=await readFileAsDataURL(f);
          clearLottie(); // <— перед монтированием
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
        resetLottieRectToDefaults(); // ★ каждый новый лотти стартует в дефолтном размере/позиции
        lottieWrap.classList.remove('hidden');
        if(!framedMode) layoutToBaseFrame();
        animation=lottie.loadAnimation({container:lottieContainer,renderer:'svg',loop:true,autoplay:true,animationData:json});
      };
      r.readAsText(f);
      lottieFileInput.value=''; // выбрать тот же файл снова
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
    /* overlay */
    document.getElementById('btnClear').addEventListener('click', ()=>{
      clearMount();
      clearLottie();                 // вместо ручной чистки
      bgLayer.style.backgroundImage='';
      setDesktopBase();
      layoutToEmpty(); lottieFileInput.value=''; assetFileInput.value=''; bgFileInput.value='';
    });

    window.addEventListener('resize', ()=>{ if(framedMode) layoutToBaseFrame(); });

    /* стартуем пустыми */
    setDesktopBase();
    layoutToEmpty();
