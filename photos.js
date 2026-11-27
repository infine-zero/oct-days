(() => {
  "use strict";

  const maxPhotos = 80;
  const keyPattern = /^[0-9a-f]{64}\.jpg$/;
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const draftPhotos = new WeakMap();
  const uploads = new WeakMap();
  const thumbnails = new WeakMap();
  let previewQueue = Promise.resolve();

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function button(text, label, onClick) {
    const control = node("button", "jp-button", text);
    control.type = "button";
    control.setAttribute("aria-label", label);
    control.addEventListener("click", onClick);
    return control;
  }

  function url(key) {
    const live = typeof key === "string" && key.match(/^postbox:([0-9a-f]{32}):([0-9]|1[0-9])$/);
    if (live && window.TRAVEL_SHARE) return "https://submit.kiwi.jp.net/v1/public-media/"+live[1]+"/"+live[2];
    if (typeof key !== "string" || !keyPattern.test(key)) return "";
    if (window.TRAVEL_SHARE) return "./media/" + key;
    if (window.JOURNAL_DEMO_KEYS?.has(key)) return "./sample-media/" + key;
    return "/photos/" + key;
  }

  function keysOf(entry) {
    return Array.isArray(entry?.photos) ? entry.photos.filter(key => url(key)) : [];
  }

  function slotsOf(draft) {
    if (!draftPhotos.has(draft)) draftPhotos.set(draft, keysOf(draft));
    return draftPhotos.get(draft);
  }

  async function decode(file) {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        return { picture: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
      } catch { /* Some mobile browsers handle camera photos only through img. */ }
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("无法读取这张图片"));
        image.src = objectUrl;
      });
      return { picture: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(objectUrl) };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  async function raster(file, maxSide) {
    const source = await decode(file);
    try {
      const ratio = Math.min(1, maxSide / Math.max(source.width, source.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.width * ratio));
      canvas.height = Math.max(1, Math.round(source.height * ratio));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("浏览器无法处理图片");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingQuality = "high";
      context.drawImage(source.picture, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally { source.release(); }
  }

  function preview(file, image) {
    previewQueue = previewQueue.then(async () => {
      if (!image.isConnected) return;
      if (!thumbnails.has(file)) {
        const canvas = await raster(file, 220);
        try { thumbnails.set(file, canvas.toDataURL("image/jpeg", .76)); }
        finally { canvas.width = canvas.height = 1; }
      }
      image.src = thumbnails.get(file);
    }).catch(() => { image.alt = "预览失败，请移除后换一张照片"; });
  }

  async function encodePhoto(file) {
    const canvas = await raster(file, 2400);
    try {
      for (const quality of [.87,.76,.62,.48,.34]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/jpeg",quality));
        if (blob?.type === "image/jpeg" && blob.size <= 1_200_000) return blob;
      }
      canvas.width = canvas.height = 1;
      const small = await raster(file, 1024);
      try {
        const blob = await new Promise(resolve => small.toBlob(resolve,"image/jpeg",.72));
        if (blob?.type === "image/jpeg" && blob.size <= 1_200_000) return blob;
      } finally { small.width = small.height = 1; }
      throw new Error("无法将照片压到 1.2 MB 以内。");
    } finally { canvas.width = canvas.height = 1; }
  }

  async function upload(file) {
    if (uploads.has(file)) return uploads.get(file);
    const promise = (async () => {
      const blob = await encodePhoto(file);
      const response = await fetch("/api/photos", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !keyPattern.test(result.key || "")) {
        throw new Error(result.error || "照片未存好，请重试");
      }
      return result.key;
    })();
    uploads.set(file, promise);
    try { return await promise; }
    catch (error) { uploads.delete(file); throw error; }
  }

  async function prepare(drafts) {
    const snapshots = drafts.map(entry => ({ draft: JSON.parse(JSON.stringify(entry)), slots: [...slotsOf(entry)] }));
    for (const {draft, slots} of snapshots) {
      if (slots.length > maxPhotos) throw new Error("一件手记最多 80 张照片");
      const photos = [];
      for (const slot of slots) {
        try {
          const key = typeof slot === "string" ? slot : await upload(slot);
          if (!photos.includes(key)) photos.push(key);
        } catch (error) {
          throw new Error("“" + (slot.name || "照片") + "”保存失败。" + (error.message || "请重试"));
        }
      }
      draft.photos = photos;
    }
    return snapshots.map(item => item.draft);
  }

  function editor(entry) {
    const slots = slotsOf(entry);
    const block = node("section", "jp-editor");
    const header = node("div", "jp-editor-head");
    const title = node("strong", "", "这件事的照片");
    const total = node("small", "jp-count");
    const fileInput = node("input", "jp-file");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
    fileInput.multiple = true;
    const picker = node("label", "jp-picker", "添加照片");
    picker.append(fileInput);
    const hint = node("small", "jp-hint", "可多选 JPEG、PNG、WebP，最多 80 张。");
    const alert = node("span", "jp-alert");
    alert.setAttribute("role", "status");
    const grid = node("div", "jp-edit-grid");
    header.append(title, total, picker);
    block.append(header, hint, alert, grid);

    function refresh() {
      total.textContent = slots.length + " 张";
      fileInput.disabled = slots.length >= maxPhotos;
      picker.classList.toggle("jp-disabled", fileInput.disabled);
      grid.replaceChildren();
      slots.forEach((slot, index) => {
        const wrapper = node("div", "jp-edit-cell");
        const image = node("img");
        image.decoding = "async";
        image.alt = typeof slot === "string" ? "照片 " + (index + 1) : slot.name;
        if (typeof slot === "string") { image.loading = "lazy"; image.src = url(slot); }
        else preview(slot, image);
        const remove = button("×", "移除照片 " + (index + 1), () => {
          slots.splice(index, 1);
          alert.textContent = "";
          refresh();
          (grid.children[index]?.querySelector("button") || fileInput).focus();
        });
        remove.classList.add("jp-remove");
        wrapper.append(image, remove); grid.append(wrapper);
      });
    }

    fileInput.addEventListener("change", () => {
      const files = Array.from(fileInput.files || []);
      const valid = files.filter(file => allowedTypes.has(file.type) || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name)));
      const room = maxPhotos - slots.length;
      slots.push(...valid.slice(0, room));
      const messages = [];
      if (valid.length < files.length) messages.push("部分文件不是 JPEG、PNG 或 WebP。");
      if (valid.length > room) messages.push("已达到 80 张上限。");
      alert.textContent = messages.join(" ");
      fileInput.value = "";
      refresh();
    });
    refresh();
    return block;
  }

  function thumbnail(key, label, choose) {
    const tile = button("", label, () => {
      tile.focus({preventScroll:true});
      choose();
    });
    tile.className = "jp-tile";
    const image = node("img");
    image.alt = "";
    image.loading = "lazy"; image.decoding = "async"; image.src = url(key);
    tile.append(image);
    return tile;
  }
  const rgbLight = Array.from({length:256},(_,i)=>{
    const v=i/255;
    return v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
  });
  const brightnessOf = (r,g,b)=>.2126*rgbLight[r]+.7152*rgbLight[g]+.0722*rgbLight[b];
  const contrastOf = (a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  function chooseAlbumColor(crop, local, minCoverage) {
    const bins=new Map();
    let visible=0;
    for (let i=0;i<crop.length;i+=4) {
      if (crop[i+3]<245) continue;
      visible++;
      const [r,g,b]=[crop[i],crop[i+1],crop[i+2]];
      const high=Math.max(r,g,b), low=Math.min(r,g,b), chroma=high-low;
      const l=brightnessOf(r,g,b);
      if (chroma<64 || high<112 || l<.065 || l>.87) continue;
      const key=(r>>4)*256+(g>>4)*16+(b>>4);
      let group=bins.get(key);
      if (!group) bins.set(key,group={count:0});
      group.count++;
      const saturation=chroma*(.7+.3*chroma/high);
      if (saturation>(group.color?.saturation ?? -1)) group.color={r,g,b,l,saturation};
    }
    let picked=null;
    for (const {count,color} of bins.values()) {
      if (count<Math.max(8, visible*.018)) continue;
      const {r,g,b,l,saturation}=color;
      let good=0;
      for (const pixel of local) {
        const contrast=contrastOf(l,pixel.l);
        const delta=(r-pixel.r)**2+(g-pixel.g)**2+(b-pixel.b)**2;
        if (contrast>=4.5 && delta>=68**2) good++;
      }
      if (good/local.length<minCoverage) continue;
      if (!picked || saturation>picked.saturation || (saturation===picked.saturation && good>picked.good)) {
        picked={r,g,b,saturation,good};
      }
    }
    return picked && `rgb(${picked.r}, ${picked.g}, ${picked.b})`;
  }
  const inkCanvas = document.createElement("canvas");
  inkCanvas.width=44; inkCanvas.height=14;
  let nextAlbumSample=0;
  function setAlbumInk(tile) {
    const image=tile.querySelector("img"), label=tile.querySelector(".jp-album-place");
    if (!label || !image.naturalWidth || !image.naturalHeight) return;
    const frame=image.getBoundingClientRect(), text=label.getBoundingClientRect();
    if (!frame.width || !frame.height || !text.width || !text.height) return;
    // Map the exact visible label area through the centered object-fit: cover crop.
    const scale=Math.max(frame.width/image.naturalWidth,frame.height/image.naturalHeight);
    const cropX=(image.naturalWidth-frame.width/scale)/2;
    const cropY=(image.naturalHeight-frame.height/scale)/2;
    const left=Math.max(0,text.left-frame.left), top=Math.max(0,text.top-frame.top+1);
    const right=Math.min(frame.width,text.right-frame.left), bottom=Math.min(frame.height,text.bottom-frame.top-1);
    if (right<=left || bottom<=top) return;
    try {
      const ctx=inkCanvas.getContext("2d",{willReadFrequently:true});
      if (!ctx) return;
      ctx.clearRect(0,0,44,14);
      ctx.drawImage(image,cropX+left/scale,cropY+top/scale,(right-left)/scale,(bottom-top)/scale,0,0,44,14);
      const {data}=ctx.getImageData(0,0,44,14);
      let dark=0,light=0,brightness=0;
      const local=[];
      for (let i=0;i<data.length;i+=4) {
        if (data[i+3]<245) continue;
        const [r,g,b]=[data[i],data[i+1],data[i+2]];
        const l=brightnessOf(r,g,b);
        if (contrastOf(l,0)>=4.5) dark++;
        if (contrastOf(l,1)>=4.5) light++;
        brightness+=l;
        local.push({r,g,b,l});
      }
      if (!local.length) return;
      const coverage=Math.max(dark,light)/local.length;
      const darkInk=dark===light ? brightness/local.length>.179 : dark>light;
      let chosen=null;
      if (coverage<.9) {
        ctx.clearRect(0,0,44,14);
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(image,cropX,cropY,frame.width/scale,frame.height/scale,0,0,44,14);
        chosen=chooseAlbumColor(ctx.getImageData(0,0,44,14).data,local,Math.max(.48,coverage-.10));
      }
      label.dataset.ink=chosen ? "color" : darkInk ? "dark" : "light";
      if (chosen) label.style.setProperty("--album-photo-ink",chosen);
      else label.style.removeProperty("--album-photo-ink");
    } catch {
      label.removeAttribute("data-ink");
      label.style.removeProperty("--album-photo-ink");
    } finally {
      // Reset the canvas origin-clean flag before evaluating the next thumbnail.
      inkCanvas.width=44;
    }
  }
  function refreshAlbumInk() {
    cancelAnimationFrame(nextAlbumSample);
    nextAlbumSample=requestAnimationFrame(()=>{
      document.querySelectorAll(".jp-album .jp-tile").forEach(setAlbumInk);
    });
  }
  window.addEventListener("resize",refreshAlbumInk,{passive:true});
  function album(frames,start,end) {
    const list = node("div","jp-album");
    for (let index=start;index<end;index++) {
      const {key,entry}=frames[index];
      const tile=thumbnail(key,[entry.day,entry.place,entry.event,"照片 "+(index-start+1)].filter(Boolean).join(" · "),
        ()=>openFrames(frames,index));
      if (entry.place) {
        tile.append(node("span","jp-album-place",entry.place));
        const img=tile.querySelector("img");
        img.addEventListener("load",()=>setAlbumInk(tile),{once:true});
        if (img.complete) requestAnimationFrame(()=>setAlbumInk(tile));
      }
      list.append(tile);
    }
    return list;
  }

  function gallery(entry, { preview = false } = {}) {
    const keys = keysOf(entry);
    const group = node("div", preview ? "jp-gallery entry-photos" : "jp-gallery");
    group.hidden = !keys.length;
    let sequence = group;
    if (preview && keys.length > 1) {
      group.classList.add("entry-photos-multi");
      const rail = node("div", "entry-photos-rail");
      const viewport = node("div", "entry-photos-window");
      sequence = node("div", "entry-photos-sequence");
      viewport.append(sequence);
      rail.append(viewport);
      group.append(rail);
    }
    keys.forEach((key, index) => {
      sequence.append(thumbnail(key, "放大照片 " + (index + 1) + "，共 " + keys.length + " 张", () => open(entry, index)));
    });
    return group;
  }

  function fitNotePreview(group) {
    if (!group.classList.contains("entry-photos-multi")) return () => {};
    const narrow = matchMedia("(max-width: 520px)");
    const rail = group.querySelector(".entry-photos-rail");
    const sequence = group.querySelector(".entry-photos-sequence");
    const tiles = [...sequence.children];
    function update() {
      if (!group.clientWidth) return;
      if (narrow.matches) {
        group.removeAttribute("data-folded");
        tiles.forEach(tile => {tile.inert = false;});
        return;
      }
      const limit = rail.clientHeight;
      if (!limit) return;
      const clipped = sequence.scrollHeight > limit + 1;
      group.toggleAttribute("data-folded", clipped);
      tiles.forEach(tile => {tile.inert = clipped && tile.offsetTop >= limit;});
    }
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(group);
    if (!observer) window.addEventListener("resize", update);
    narrow.addEventListener?.("change", update);
    update();
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", update);
      narrow.removeEventListener?.("change", update);
    };
  }

  function open(entry, initialIndex = 0) {
    return openFrames(keysOf(entry).map(key=>({key,entry})),initialIndex);
  }

  function openFrames(frames, initialIndex = 0) {
    if (!frames.length) return;
    const previousFocus = document.activeElement;
    const dialog = node("dialog", "jp-viewer");
    dialog.setAttribute("aria-label", "查看照片");
    const header = node("header", "jp-view-head");
    let index = 0, zoomed = false, jumpToNote = null;
    const caption = node("div","jp-view-caption");
    const openNote = button("", "跳转到这张照片的手记", () => {
      jumpToNote = frames[index].entry.openNote;
      dialog.close();
    });
    openNote.className = "jp-view-caption jp-view-note";
    const plainTitle = node("strong"), plainPlace = node("small");
    const linkedTitle = node("strong"), linkedPlace = node("small");
    caption.append(plainTitle, plainPlace);
    openNote.append(linkedTitle, linkedPlace);
    const close = button("关闭", "关闭照片", () => dialog.close());
    header.append(caption, openNote, close);
    const stage = node("div", "jp-view-stage");
    const photo = node("img", "jp-view-image");
    const error = node("span", "jp-view-error", "这张照片未能载入");
    error.hidden = true;
    stage.append(photo, error);
    const footer = node("footer", "jp-view-footer");
    const previous = button("‹", "上一张照片", () => show(index - 1));
    const next = button("›", "下一张照片", () => show(index + 1));
    const position = node("span", "jp-position");
    position.setAttribute("aria-live", "polite");
    const zoom = button("实际大小", "切换适应窗口和实际大小", () => setZoom(!zoomed));
    previous.classList.add("jp-step"); next.classList.add("jp-step");
    footer.append(previous, position, next, zoom);
    dialog.append(header, stage, footer);

    function setZoom(value) {
      zoomed = value;
      stage.classList.toggle("jp-actual", value);
      zoom.setAttribute("aria-pressed", String(value));
      zoom.textContent = value ? "适应窗口" : "实际大小";
      stage.scrollTop = 0; stage.scrollLeft = 0;
    }
    function show(wanted) {
      index = Math.max(0, Math.min(frames.length - 1, Number(wanted) || 0));
      const {key,entry}=frames[index];
      previous.disabled = index === 0; next.disabled = index === frames.length - 1;
      position.textContent = (index + 1) + " / " + frames.length;
      const label = entry.event || "照片";
      const description = [entry.day,entry.time,entry.place].filter(Boolean).join(" · ");
      const linked=typeof entry.openNote==="function";
      plainTitle.textContent=linkedTitle.textContent=label;
      plainPlace.textContent=linkedPlace.textContent=description;
      plainPlace.hidden=linkedPlace.hidden=!description;
      caption.hidden=linked;
      openNote.hidden=!linked;
      openNote.setAttribute("aria-label","查看手记："+label);
      error.hidden = true; photo.hidden = false;
      photo.alt = label + " · 第 " + (index + 1) + " 张";
      photo.src = url(key);
      setZoom(false);
    }
    photo.onerror = () => { photo.hidden = true; error.hidden = false; };
    photo.addEventListener("dblclick", () => setZoom(!zoomed));
    dialog.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
    });
    let touchStart;
    stage.addEventListener("touchstart", e => {
      if (e.touches.length !== 1 || zoomed) { touchStart = null; return; }
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    stage.addEventListener("touchend", e => {
      if (!touchStart || e.touches.length || zoomed) return;
      const dx = e.changedTouches[0].clientX - touchStart.x;
      const dy = e.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) show(index + (dx < 0 ? 1 : -1));
    }, { passive: true });
    stage.addEventListener("touchcancel", () => { touchStart = null; }, { passive: true });
    dialog.addEventListener("close", () => {
      dialog.remove();
      if (jumpToNote) jumpToNote();
      else if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    show(initialIndex);
    close.focus();
  }

  window.JournalPhotos = { editor, gallery, album, fitNotePreview, prepare, url, open, encodePhoto };
})();
