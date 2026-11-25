/* Offline, illustrated itinerary. All coordinates below describe an imaginary landscape. */
(() => {
  "use strict";

  const mounts = new WeakMap();
  function el(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text != null) result.textContent = text;
    return result;
  }

  function pen(ctx, points, color, width = 1, close = false) {
    ctx.beginPath();
    for (let n = 0; n < points.length; n++) {
      const [x, y] = points[n];
      if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (close) ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function polygon(ctx, points, color, outline) {
    ctx.beginPath();
    points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function curve(ctx, start, controls, color, width) {
    ctx.beginPath();
    ctx.moveTo(...start);
    controls.forEach(values => ctx.bezierCurveTo(...values));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function ellipse(ctx, x, y, rx, ry, fill) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI);
    ctx.fillStyle = fill; ctx.fill();
  }

  function landscape(ctx, width, height, tones) {
    ctx.save();
    ctx.scale(width / 960, height / 330);
    ctx.fillStyle = tones["map-paper"] || tones.mist;
    ctx.fillRect(0, 0, 960, 330);

    // A distant island and flat bands of sea and sand leave room for the route.
    const sunRadius = Math.max(9, Math.min(20, width * 0.025));
    ellipse(ctx, 788, 68, sunRadius * 960 / width, sunRadius * 330 / height, tones.sun);
    polygon(ctx, [[555, 219], [627, 197], [663, 179], [698, 174],
      [724, 181], [747, 196], [791, 219]], tones.island);
    polygon(ctx, [[0, 217], [960, 217], [960, 330], [0, 330]], tones.sea);
    polygon(ctx, [[0, 311], [150, 282], [323, 268], [483, 267],
      [673, 281], [819, 281], [960, 260], [960, 330], [0, 330]], tones.shore);
    pen(ctx, [[548, 238], [661, 238]], tones.mist, 1.4);
    pen(ctx, [[731, 251], [866, 251]], tones.mist, 1.4);
    ctx.restore();
  }

  const AIRPORT = "oct01-airport", CITY_STOP = "oct01-yakitori";
  const cityAnchors = {
    [AIRPORT]: [.18, .72],
    [CITY_STOP]: [.78, .41],
  };
  function cityscape(ctx, width, height, tones) {
    const day = !!tones["map-paper"];
    const colors = day
      ? {water:"#e2eeea", land:"#f4f3eb", coast:"#a4b7ac", block:"#dde5d9", minor:"#fffdf7",
        street:"#fffef9", major:"#c9cec0", apron:"#d0d9cc", dock:"#ccdcd2", label:"#536a63"}
      : {water:"#192f37", land:"#293b3d", coast:"#4e6866", block:"#384d49", minor:"#506662",
        street:"#58706a", major:"#69807a", apron:"#445a56", dock:"#314948", label:"#a8c4bc"};
    ctx.save();
    ctx.scale(width / 960, height / 330);
    ctx.fillStyle = colors.water;
    ctx.fillRect(0, 0, 960, 330);

    const shore = [[462,-4],[454,48],[410,75],[432,100],[390,125],[411,154],
      [382,177],[404,203],[369,230],[388,254],[371,287],[390,334]];
    const mainland = [...shore,[964,334],[964,-4]];
    polygon(ctx, mainland, colors.land);
    ctx.save();
    ctx.clip(); // The street grid is confined to the mainland.
    for (let row=0; row<6; row++) {
      for (let col=0; col<9; col++) {
        const x=415+col*63+row*3, y=row*57-10+((col%3)-1)*4;
        polygon(ctx, [[x,y],[x+44,y-2],[x+47,y+35],[x+3,y+38]], colors.block);
      }
    }
    for (let x=442; x<1040; x+=63) {
      pen(ctx, [[x,-6],[x+11,83],[x+18,164],[x+30,338]], colors.street, 4);
    }
    for (let y=22; y<345; y+=44) {
      pen(ctx, [[370,y+9],[591,y+3],[790,y-9],[966,y-17]], colors.minor, 3);
    }
    const avenue = [[389,211],[532,190],[671,177],[811,136],[967,111]];
    pen(ctx, avenue, colors.major, 8);
    pen(ctx, avenue, colors.street, 3);
    const crossTown = [[715,-5],[711,79],[737,149],[769,231],[805,338]];
    pen(ctx, crossTown, colors.major, 7);
    pen(ctx, crossTown, colors.street, 2.5);
    ctx.restore();

    pen(ctx, shore, colors.coast, 2);
    for (const [x,y] of [[418,85],[388,133],[390,186],[367,237]]) {
      polygon(ctx, [[x,y],[x-27,y+4],[x-24,y+14],[x+5,y+11]], colors.dock, colors.coast);
    }
    const platform = [[73,234],[123,215],[194,202],[249,217],[278,242],[242,265],
      [171,286],[103,273]];
    polygon(ctx, platform, colors.land, colors.coast);
    polygon(ctx, [[100,242],[192,214],[244,227],[253,240],[170,266],[109,257]], colors.apron);
    pen(ctx, [[106,251],[218,220]], colors.coast, 2.5);
    pen(ctx, [[143,263],[250,234]], colors.street, 2);
    // Duplex bridge casing shares the illustrated transfer's crossing.
    const bridge = [[253,238],[304,225],[404,203],[465,176]];
    pen(ctx, bridge, colors.coast, 7);
    pen(ctx, bridge, colors.street, 4);

    for (const [x,y,w] of [[49,86,62],[202,139,59],[80,302,63],[294,282,42]]) {
      pen(ctx, [[x,y],[x+w,y]], colors.coast, .65);
      pen(ctx, [[x+10,y+7],[x+w+14,y+7]], colors.coast, .65);
    }
    ctx.restore();
    ctx.fillStyle = colors.label;
    ctx.font = "500 11px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("离岸接驳示意", width*.07, height*.91);
  }

  function transferRoute(a, b, width, height) {
    if (!((a.id===AIRPORT && b.id===CITY_STOP) || (a.id===CITY_STOP && b.id===AIRPORT))) return null;
    const forward = a.id===AIRPORT;
    const start = forward ? a : b, end = forward ? b : a;
    const points = [[start.x,start.y], ...[[253,238],[304,225],[404,203],[465,176],
      [571,164],[614,135],[681,135]].map(([x,y])=>[x*width/960,y*height/330]), [end.x,end.y]];
    return forward ? points : points.reverse();
  }
  function pointAlong(points, progress) {
    const lengths = points.slice(1).map(([x,y], i)=>Math.hypot(x-points[i][0],y-points[i][1]));
    let distance = Math.max(0, Math.min(1, progress))*lengths.reduce((a,b)=>a+b,0);
    for (let i=0; i<lengths.length; i++) {
      if (distance <= lengths[i] || i===lengths.length-1) {
        const fraction=lengths[i] ? distance/lengths[i] : 0;
        return {x:points[i][0]+fraction*(points[i+1][0]-points[i][0]),
          y:points[i][1]+fraction*(points[i+1][1]-points[i][1])};
      }
      distance-=lengths[i];
    }
    return {x:points[0][0],y:points[0][1]};
  }

  function mount(container, entries, options = {}) {
    mounts.get(container)?.destroy();
    const theme = getComputedStyle(container);
    const tones = {};
    for (const name of ["map-paper", "mist", "sun", "island", "sea", "shore", "route", "warm", "accent"]) {
      tones[name] = theme.getPropertyValue("--" + name).trim();
    }
    const records = Array.isArray(entries) ? entries : [];
    const hasNextDay = typeof options.onNextDay === "function";
    const lastStep = Math.max(0, records.length - 1);
    const nextDayStep = lastStep + 1;
    const mode = ["map","explore","film"].includes(options.mode) ? options.mode : "map";
    const city = mode==="map" && records.some(record=>record.id===AIRPORT && record.day==="10.01") &&
      records.some(record=>record.id===CITY_STOP && record.day==="10.01");
    const initial = records.findIndex(record => record.id === options.selectedId);
    let current = Math.max(0, initial);
    let playing = false, frame = 0, lastUpdate = 0, elapsed = 0, disposed = false;
    let wander = null, walkFrame = 0;
    let width = 1, height = 1, pageStart = -1, visiblePoints = [];
    const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = el("section", "jj-journey jj-" + mode);
    if (city) root.dataset.mapStyle = "city";
    root.setAttribute("aria-label", city ? "10月1日 大阪都市圈路线示意图" : {map:"旅程路线示意", explore:"沿地点探索", film:"记忆电影回放"}[mode]);
    const stage = el("div","jj-stage");
    const scenery = el("canvas","jj-scenery"), cast = el("canvas","jj-cast");
    if (city) scenery.style.opacity = ".91";
    scenery.setAttribute("aria-hidden","true"); cast.setAttribute("aria-hidden","true");
    const markers = el("div","jj-marker-layer");
    const meta = el("span","jj-map-meta",city ? "大阪都市圈 · 示意" : mode === "film" ? "风景插画" : "");
    meta.hidden = mode === "map" && !city;
    if (mode === "explore" && records.length) {
      stage.tabIndex=0;
      stage.setAttribute("aria-label","自由探索场景，点地面或用方向键移动，靠近地点即可读记忆");
      meta.textContent="点击地面或用方向键移动";
    }
    const empty = el("span","jj-empty-note","这一天的路线，等第一条记忆来点亮");
    empty.hidden = records.length > 0;
    const caption = el("div","jj-film-caption");
    caption.hidden = mode !== "film" || !records.length;
    const filmTime = el("small"), filmTitle = el("h3"), filmNote = el("p");
    const filmCompanions = el("small","entry-companions"), filmAuthor = el("small","entry-author");
    const filmPhoto = el("img","jj-film-photo");
    filmPhoto.alt="";filmPhoto.hidden=true;
    const viewPhotos = el("button","jj-film-open");
    viewPhotos.type="button";viewPhotos.hidden=true;
    filmPhoto.onload=()=>{filmPhoto.hidden=false;};
    filmPhoto.onerror=()=>{filmPhoto.hidden=true;meta.textContent="记忆放映 · 备用风景插画";};
    viewPhotos.addEventListener("click",()=>{
      pause();sync();window.JournalPhotos?.open(records[current],0);
    });
    caption.append(filmTime,filmTitle,filmCompanions,filmNote,filmAuthor);
    stage.append(scenery,filmPhoto,cast,markers,meta,empty,caption,viewPhotos);
    const footer = el("div","jj-footer");
    const play = el("button","jj-action","播放");
    play.type = "button";
    const timeText = el("span","jj-foot-time");
    timeText.setAttribute("aria-live","polite");
    const range = el("input","jj-step-range");
    range.type="range"; range.min="0"; range.max=String(hasNextDay ? nextDayStep : lastStep);range.step="1";
    range.value="0";
    range.setAttribute("aria-label","沿时间线跳转片段");
    range.hidden=records.length<2 && !hasNextDay;
    range.disabled=range.hidden;
    if (hasNextDay) range.title="拖到最右端进入下一天";
    play.hidden=!records.length;
    footer.append(play,range,timeText); footer.hidden = !records.length && !hasNextDay;
    root.append(stage,footer);container.replaceChildren(root);

    function setup(canvas) {
      const scale=Math.min(window.devicePixelRatio || 1,2);
      canvas.width=Math.max(1,Math.round(width*scale));
      canvas.height=Math.max(1,Math.round(height*scale));
      const ctx=canvas.getContext("2d");
      ctx.setTransform(scale,0,0,scale,0,0);
      ctx.lineJoin="round";ctx.lineCap="round";
      return ctx;
    }
    let actors;
    function capacity() { return width < 450 ? 3 : width < 760 ? 4 : 5; }
    function renderStops(force) {
      const capacityNow=capacity();
      const start=Math.floor(current/capacityNow)*capacityNow;
      if(!force && start===pageStart) return;
      pageStart=start;
      const batch=records.slice(start,start+capacityNow);
      const ys=[.59,.39,.61,.40,.54];
      visiblePoints=batch.map((record,i)=>{
        const anchor = city && cityAnchors[record.id];
        const x=batch.length===1?.45:.13+i*.74/(batch.length-1);
        return {id:record.id,x:(anchor?.[0] ?? x)*width,y:(anchor?.[1] ?? ys[i])*height};
      });
      markers.replaceChildren();
      if (mode==="film") return;
      batch.forEach((record,i)=>{
        const point=visiblePoints[i];
        const btn=el("button","jj-node");
        btn.type="button";
        btn.dataset.status=record.status;
        btn.style.left=point.x+"px";btn.style.top=(point.y-6)+"px";
        const label=record.place || "地点待补";
        btn.title=[record.time,label,record.event].filter(Boolean).join(" · ");
        btn.setAttribute("aria-label",btn.title);
        btn.append(el("span","jj-node-dot"),el("span","jj-node-title",label));
        btn.addEventListener("click",()=>jump(start+i));
        markers.append(btn);
      });
    }

    function placeBetween(a,b,p) {
      const ease=p*p*(3-2*p);
      return {x:a.x+(b.x-a.x)*p, y:a.y+(b.y-a.y)*ease};
    }
    function character(ctx,x,y,color,bob,personScale) {
      const size=personScale;
      ctx.save();ctx.translate(Math.round(x),Math.round(y));
      ellipse(ctx,1,1,6*size,1.8*size,"#52675066");
      ctx.translate(0,bob ? -size : 0);ctx.scale(size,size);
      // Square profile, canvas-pixel backpack, jacket and alternating boots.
      const pixel=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
      pixel(-3,-15,6,5,"#c79367");pixel(-3,-16,6,2,"#454d43");
      pixel(-4,-14,2,3,"#454d43");pixel(2,-13,2,2,"#e2b48b");
      pixel(-3,-10,6,6,color);pixel(-4,-9,2,5,"#94744e");pixel(3,-9,1,4,"#d4a77f");
      pixel(-2,-4,2,bob?3:4,"#43564e");pixel(1,-4,2,bob?4:3,"#43564e");
      pixel(-3,bob?-2:-1,3,1,"#394940");pixel(1,bob?-1:-2,3,1,"#394940");
      ctx.restore();
    }
    function paintCast(progress=0, step=0) {
      if(!actors)return;
      actors.clearRect(0,0,width,height);
      if(mode==="film" || !visiblePoints.length) return;
      for(let i=1;i<visiblePoints.length;i++){
        const a=visiblePoints[i-1],b=visiblePoints[i];
        const portion=[[a.x+(b.x-a.x)/3,a.y,b.x-(b.x-a.x)/3,b.y,b.x,b.y]];
        const transfer=city && transferRoute(a,b,width,height);
        if (transfer) {
          pen(actors,transfer,tones["map-paper"] || tones.mist,5);
          pen(actors,transfer,tones.route,2.7);
        } else {
          curve(actors,[a.x,a.y],portion,tones.route,2);
        }
      }
      const index=current-pageStart;
      const a=visiblePoints[index];if(!a) return;
      const next=visiblePoints[index+1];
      const transfer=next && city && transferRoute(a,next,width,height);
      const p=wander ? {x:wander.x*width,y:wander.y*height} :
        transfer ? pointAlong(transfer,progress) : next ? placeBetween(a,next,progress) : a;
      const count=mode==="explore"?1:Math.min(3,Math.max(1,records[current].people?.length || 0));
      const colors=[tones.warm, tones.accent, tones.island];
      for(let i=count-1;i>=0;i--){
        const pos=p.x+(i-(count-1)/2)*11;
        const bob=step ? step%2===1 : progress>0 && Math.floor(progress*12+i)%2===1;
        character(actors,pos,p.y-8-(i%2)*2,colors[i],bob,width<420?1.15:1.48);
      }
    }
    function sync(force=false) {
      renderStops(force);paintCast();
      const record=records[current];
      if(!record)return;
      Array.from(markers.children).forEach((b,i)=>{
        if(i+pageStart===current)b.setAttribute("aria-current","step");else b.removeAttribute("aria-current");
      });
      range.value=String(current);
      range.setAttribute("aria-valuetext",[record.time,record.place,record.event].filter(Boolean).join("，"));
      play.disabled=records.length<2;
      play.textContent=playing?"暂停":(mode==="explore"?"自动走":mode==="film"?"放映":"回放");
      play.setAttribute("aria-pressed",String(playing));
      timeText.textContent=[record.time||"时间待补",record.place||"地点待补"].join(" · ");
      filmTime.textContent=[record.day,record.time,record.place].filter(Boolean).join(" / ");
      filmTitle.textContent=record.event||"事件待补";
      filmCompanions.textContent=record.companions||"";
      filmCompanions.hidden=!filmCompanions.textContent;
      filmNote.textContent=record.reflection||"";
      filmNote.hidden=!filmNote.textContent;
      filmAuthor.textContent=record.author||"";
      filmAuthor.hidden=!filmAuthor.textContent;
      if(mode==="film") {
        const imageUrl=window.JournalPhotos?.url(record.photos?.[0]) || "";
        if(imageUrl!==(filmPhoto.getAttribute("src")||"")){
          filmPhoto.hidden=true;
          if(imageUrl)filmPhoto.src=imageUrl;else filmPhoto.removeAttribute("src");
        }
        meta.textContent=imageUrl?"记忆放映 · 事件照片":"记忆放映 · 风景插画";
        viewPhotos.hidden=!imageUrl;
        if(imageUrl)viewPhotos.textContent="查看照片 · "+record.photos.length;
      }
    }
    function resize(){
      if(disposed)return;
      width=Math.max(1,stage.clientWidth);height=Math.max(1,stage.clientHeight);
      const bg=setup(scenery);actors=setup(cast);
      (city ? cityscape : landscape)(bg,width,height,tones);sync(true);
    }
    function pause(){
      playing=false;elapsed=0;lastUpdate=0;cancelAnimationFrame(frame);frame=0;
    }
    function update(index,notify=true){
      if(index<0 || index>=records.length)return;
      current=index;sync();
      if(notify)options.onSelect?.(records[current].id);
    }
    function jump(index){pause();stopWalking();update(index);}
    function stopWalking() {
      cancelAnimationFrame(walkFrame);walkFrame=0;wander=null;
    }
    function walkTo(rawX,rawY) {
      if(mode!=="explore" || !records.length)return;
      pause();cancelAnimationFrame(walkFrame);sync();
      const start=wander ? {x:wander.x*width,y:wander.y*height} : visiblePoints[current-pageStart];
      if(!start)return;
      const target={x:Math.max(10,Math.min(width-10,rawX)),y:Math.max(28,Math.min(height-10,rawY))};
      const duration=reducedMotion?0:Math.min(850,Math.hypot(target.x-start.x,target.y-start.y)*3);
      const began=performance.now();
      function step(now) {
        if(disposed)return;
        const phase=duration?Math.min(1,(now-began)/duration):1;
        const x=start.x+(target.x-start.x)*phase,y=start.y+(target.y-start.y)*phase;
        wander={x:x/width,y:y/height};
        paintCast(0,Math.round(phase*8));
        if(phase<1){walkFrame=requestAnimationFrame(step);return;}
        walkFrame=0;
        const nearest=visiblePoints.map((point,i)=>({i,d:Math.hypot(point.x-x,point.y-y)})).sort((a,b)=>a.d-b.d)[0];
        if(nearest?.d<=42 && current!==pageStart+nearest.i)update(pageStart+nearest.i);
      }
      step(began);
    }
    if(mode==="explore"){
      stage.addEventListener("click",event=>{
        if(!records.length || event.target.closest("button"))return;
        const bounds=stage.getBoundingClientRect();walkTo(event.clientX-bounds.left,event.clientY-bounds.top);
      });
      stage.addEventListener("keydown",event=>{
        if(!records.length || event.target!==stage)return;
        const moves={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]};
        const move=moves[event.key];if(!move)return;
        event.preventDefault();
        const start=wander?{x:wander.x*width,y:wander.y*height}:visiblePoints[current-pageStart];
        walkTo(start.x+move[0],start.y+move[1]);
      });
    }
    function tick(now){
      if(!playing || disposed)return;
      if(lastUpdate)elapsed+=Math.min(now-lastUpdate,150);
      lastUpdate=now;
      const duration=mode==="film"?4100:2400;
      if(elapsed>=duration) {
        elapsed=0;
        if(current>=records.length-1){pause();sync();return;}
        update(current+1);
      } else if(!reducedMotion && mode!=="film"){
        paintCast(Math.min(1,Math.max(0,(elapsed/duration-.18)/.79)));
      }
      frame=requestAnimationFrame(tick);
    }
    play.addEventListener("click",()=>{
      if(playing){pause();sync();return;}
      stopWalking();
      if(current>=records.length-1)update(0);
      playing=true;sync();frame=requestAnimationFrame(tick);
    });
    range.addEventListener("input",()=>{
      if (hasNextDay && Number(range.value) === nextDayStep) {
        pause();
        range.setAttribute("aria-valuetext","下一天");
        return;
      }
      jump(Number(range.value));
    });
    range.addEventListener("change",()=>{
      if (hasNextDay && Number(range.value) === nextDayStep) options.onNextDay();
    });
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(resize):null;
    observer?.observe(stage);
    if(!observer)window.addEventListener("resize",resize);
    resize();
    const handle={
      select(id) { const i=records.findIndex(r=>r.id===id);if(i>=0){pause();stopWalking();update(i,false);} },
      destroy() {disposed=true;pause();stopWalking();observer?.disconnect();window.removeEventListener("resize",resize);mounts.delete(container);}
    };
    mounts.set(container,handle);return handle;
  }
  window.JournalJourney={mount};
})();
