"use strict";

const byId = id => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function button(label, className, onClick) {
  const element = make("button", className, label);
  element.type = "button";
  element.addEventListener("click", onClick);
  return element;
}

const shared = window.TRAVEL_SHARE;
let sampleEvents = [];
const statusNames = {confirmed:"确认经历", planned:"计划", pending:"待确认"};
const state = {events:[], tripStart:"", demo:false, page:"trip", mode:"map", day:"", selected:"", drafts:[], original:null, loaded:false};
let journeyControl = null;
let materialDraft = null;
let openingEdit = false;
let activeEdit = null;
const collection = () => !shared && state.demo ? sampleEvents : state.events;
const initialNote = "日期待补";
function dayKey(value) {
  if (!value) return initialNote;
  if (!state.demo && state.tripStart && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const delta = (Date.parse(value+"T00:00:00Z") - Date.parse(state.tripStart+"T00:00:00Z")) / 86400000;
    if (Number.isInteger(delta) && delta >= 0) return "第"+(delta+1)+"天";
  }
  return value;
}
function dayLabel(day) {
  if (day !== "第1天") return day;
  return !state.demo && state.tripStart ? state.tripStart.slice(5).replace("-", ".") : "10.01";
}
function partyNames(entry) {
  if (!entry.people.some(name => name !== entry.author)) return "";
  return [...new Set([entry.author, ...entry.people].filter(Boolean))].join("、");
}
function appendCompanions(container, entry) {
  const names = partyNames(entry);
  if (names) container.append(make("span","metadata entry-companions",names));
}
function timeOrder(value) {
  const exact = value.match(/^(?:约|大约)?(\d{1,2}):(\d{2})/);
  if (exact) return Number(exact[1])*60+Number(exact[2]);
  const blocks = [[/凌晨/,180],[/清晨|天亮|日出/,360],[/早饭后|早餐后/,510],[/早上|早晨/,480],[/上午/,600],[/中午|正午/,720],[/午饭后|午餐后/,780],[/下午|午后/,900],[/傍晚|黄昏|日落|天黑/,1080],[/晚饭后|晚餐后/,1200],[/晚上|夜里|夜间/,1260],[/深夜|睡前/,1380]];
  return blocks.find(([test])=>test.test(value))?.[1] ?? 9999;
}
function groupDays() {
  const groups = new Map();
  for (const event of collection()) {
    const key = dayKey(event.day);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  if (!groups.size) groups.set("第1天", []);
  for (const events of groups.values()) events.sort((a,b)=>timeOrder(a.time)-timeOrder(b.time));
  const order = (a,b) => a === initialNote ? 1 : b === initialNote ? -1 : a.localeCompare(b,"zh",{numeric:true});
  return new Map([...groups].sort(([a],[b])=>order(a,b)));
}
function notice(message) {
  byId("notice").textContent = message;
  byId("notice").hidden = !message;
}
function activate(selector, key, value) {
  document.querySelectorAll(selector).forEach(item=>{
    const active = item.dataset[key] === value;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
}
function selectRecord(id) {
  state.selected = id;
  const event = collection().find(item=>item.id===id);
  if (event && state.page==="trip") paintList(groupDays().get(dayKey(event.day)) || []);
}
function selectDay(day) {
  state.day = day;
  state.selected = "";
  render();
}
function render() {
  const events = collection();
  const groups = groupDays();
  if (!groups.has(state.day)) state.day = groups.keys().next().value;
  const records = groups.get(state.day);
  if (!records.some(item=>item.id===state.selected)) state.selected = records.find(item=>item.status==="confirmed")?.id || records[0]?.id || "";
  activate("[data-page]", "page", state.page);
  activate("[data-mode]", "mode", state.mode);
  const headline = byId("headline");
  const heading = ({people:"同行的人",places:"记忆里的地点",album:"旅途相册"})[state.page] || "Oct.Days";
  const isWordmark = state.page === "trip";
  if (headline.textContent !== heading || headline.classList.contains("wordmark") !== isWordmark) {
    headline.classList.toggle("wordmark", isWordmark);
    if (isWordmark) {
      headline.setAttribute("aria-label", heading);
      headline.replaceChildren(...Array.from(heading, character => make("span", character === "." ? "wordmark-dot" : "", character)));
    } else {
      headline.removeAttribute("aria-label");
      headline.textContent = heading;
    }
  }
  byId("subtitle").textContent = state.demo ? "湘南旅行示例 · 虚构片段与 AI 配图" : "日本旅行手账";
  if (!shared) {
    byId("sample").textContent = state.demo ? "回到我的手账" : "看看示例";
    byId("sample").setAttribute("aria-pressed", String(state.demo));
    byId("share").disabled = events.length===0;
  }
  byId("trip-view").hidden = state.page!=="trip";
  byId("index-view").hidden = state.page==="trip";
  journeyControl?.destroy();
  journeyControl = null;
  if (state.page==="album") {paintAlbum(groups);return;}
  if (state.page!=="trip") {paintIndex();return;}
  const days = byId("days");
  const chapterLabel = dayLabel(state.day);
  byId("chapter").textContent = chapterLabel;
  byId("chapter").hidden = groups.size > 1;
  days.hidden = groups.size < 2;
  days.replaceChildren(...[...groups.keys()].map(key=>new Option(dayLabel(key),key)));
  days.value = state.day;
  const samples = records
    .filter(item=>item.status==="confirmed" && (state.mode==="film" || item.place))
    .map(item=>({...item,day:dayLabel(dayKey(item.day)),companions:partyNames(item)}));
  const nextDay = days.options[days.selectedIndex + 1]?.value;
  journeyControl = window.JournalJourney.mount(byId("journey"), samples, {
    mode:state.mode, selectedId:state.selected, onSelect:selectRecord,
    onNextDay:state.mode==="map" && nextDay && nextDay!==initialNote ? () => selectDay(nextDay) : null,
  });
  paintList(records);
}
function paintList(records) {
  const list = byId("event-list");
  list.replaceChildren();
  if (!records.length) {
    list.append(make("p","section-placeholder","还没有手记。记下第一件事，这一天就有了起点。"));
    return;
  }
  for (const entry of records) {
    const active = entry.id===state.selected;
    const row = make("article","event"+(active?" is-selected":""));
    if (entry === records[0] && state.day !== initialNote) {
      const date = make("span", "chapter-background", dayLabel(state.day));
      date.setAttribute("aria-hidden", "true");
      row.append(date);
    }
    const open = button("","record-main",()=>{
      state.selected=entry.id;
      if (entry.status==="confirmed" && (entry.place || state.mode==="film")) journeyControl?.select(entry.id);
      paintList(records);
      list.querySelector(".is-selected .record-main")?.focus({preventScroll:true});
    });
    if (active) open.setAttribute("aria-current","step");
    open.append(make("strong","",entry.event));
    appendCompanions(open, entry);
    open.append(make("span","metadata",[entry.time||"时间待补", entry.place, entry.photos?.length ? entry.photos.length+" 张照片" : "", entry.status==="confirmed"?"":statusNames[entry.status]].filter(Boolean).join(" · ")));
    row.append(open);
    if (active && !state.demo && !shared) row.append(button("编辑","quiet",()=>editEntry(entry)));
    if (active) {
      const detail = make("div","details");
      if (entry.reflection) detail.append(make("p","meta-break",entry.reflection));
      if (entry.author) detail.append(make("p","metadata entry-author",entry.author));
      if (entry.status!=="confirmed") detail.append(make("p","state","这条"+statusNames[entry.status]+"手记暂未加入经历回放。"));
      if (entry.source && !state.demo && !shared) {
        const source=make("details","source");
        source.append(make("summary","","查看录入原文"),make("p","",entry.source));
        detail.append(source);
      }
      if (detail.childElementCount) row.append(detail);
      if (entry.photos?.length) {
        row.append(window.JournalPhotos.gallery({...entry,day:dayLabel(dayKey(entry.day))}, {preview:true}));
      }
    }
    list.append(row);
  }
}
function paintAlbum(groups) {
  const target=byId("index-list");target.replaceChildren();
  for (const [day,entries] of groups) for (const entry of entries) {
    if (!entry.photos?.length) continue;
    const card=make("article","group album-group");
    card.append(make("p","metadata",[dayLabel(day),entry.time,entry.place].filter(Boolean).join(" · ")),make("h2","",entry.event));
    appendCompanions(card, entry);
    card.append(window.JournalPhotos.gallery({...entry,day:dayLabel(day)}));
    card.append(button("回到这条手记","quiet",()=>{state.page="trip";state.day=day;state.selected=entry.id;render();}));
    target.append(card);
  }
  if (!target.childElementCount) target.append(make("p","section-placeholder",shared?"这份分享手账没有附带照片。":"在“记一件事”或已有手记的“编辑”里添加照片，就能在这里翻看。"));
}
function paintIndex() {
  const target = byId("index-list");
  const isPeople = state.page==="people";
  const groups = new Map();
  for (const records of groupDays().values()) for (const entry of records) {
    for (const name of (isPeople ? entry.people : [entry.place]).filter(Boolean)) {
      if (!groups.has(name)) groups.set(name,[]);
      groups.get(name).push(entry);
    }
  }
  target.replaceChildren();
  if (!groups.size) target.append(make("p","section-placeholder",isPeople?"手记里填写同行人的名字，就能在这里看到每个人参与的片段。":"手记里填写地点，就能在这里找到每次到访的经过。"));
  for (const [name,records] of groups) {
    const group=make("article","group");
    group.append(make("h2","",name));
    for (const entry of records) {
      const open=button("","group-link",()=>{state.page="trip";state.day=dayKey(entry.day);state.selected=entry.id;render();});
      open.append(make("strong","",entry.event));
      appendCompanions(open, entry);
      open.append(make("span","metadata",dayLabel(dayKey(entry.day))+" · "+(entry.time||"时间待补")+" · "+statusNames[entry.status]));
      group.append(open);
    }
    target.append(group);
  }
}

function blankDraft() {
  return {day:"",time:"",author:"",people:[],place:"",event:"",status:"confirmed",source:"",reflection:""};
}
function openCompose() {
  state.original = null;
  state.drafts = [blankDraft()];
  materialDraft = {id:crypto.randomUUID().replaceAll("-",""), photos:[]};
  byId("material-text").value = "";
  byId("material-author").value = "";
  byId("material-photos").replaceChildren(window.JournalPhotos.editor(materialDraft));
  byId("raw").value = "";
  byId("entry-modes").hidden = false;
  chooseEntryMode("direct");
  byId("entry-dialog").showModal();
}
function chooseEntryMode(mode) {
  activate("[data-entry-mode]", "entryMode", mode);
  if (mode==="direct") {
    showReview();
    return;
  }
  byId("compose").hidden=true;
  byId("review").hidden=true;
  byId("material").hidden=false;
  byId("entry-heading").textContent="提交素材";
  byId("edit-error").textContent="";
}
function field(parent, title, key, entry, options={}) {
  const label = make("label",options.wide?"wide":"",title);
  const input = make(options.select?"select":options.multiline?"textarea":"input");
  input.dataset.field = key;
  if (options.select) for (const [value,name] of Object.entries(statusNames)) input.add(new Option(name,value));
  if (options.multiline) input.rows = 2;
  input.value = key==="people" ? entry.people.join("、") : entry[key]||"";
  if (options.placeholder) input.placeholder=options.placeholder;
  input.addEventListener("input",()=>{
    entry[key]=key==="people"?[...new Set(input.value.split(/[、,，;；/\n]/).map(name=>name.trim()).filter(Boolean))]:input.value;
  });
  label.append(input);
  parent.append(label);
}
function showReview() {
  byId("edit-error").textContent="";
  byId("compose").hidden=true;
  byId("material").hidden=true;
  byId("review").hidden=false;
  byId("back").hidden=!!state.original;
  byId("entry-heading").textContent=state.original?"编辑手记":"记一件事";
  byId("review-note").textContent=state.original
    ? "你正在编辑这条手记，其他人仍能查看。"
    : "保存后，时间线、人物、地点和相册会一起更新。";
  const container=byId("drafts");
  container.replaceChildren();
  state.drafts.forEach((entry,index)=>{
    const box=make("fieldset","draft");
    box.append(make("legend","","手记 "+(index+1)));
    const fields=make("div","fields");
    field(fields,"日期或第几天","day",entry,{placeholder:"第2天 / 2026-05-03"});
    field(fields,"日本当地时间","time",entry,{placeholder:"16:30 / 傍晚"});
    field(fields,"作者","author",entry);
    field(fields,"同行人（用顿号隔开）","people",entry,{placeholder:"阿岚"});
    field(fields,"地点","place",entry,{placeholder:"海边"});
    field(fields,"发生了什么（必填）","event",entry,{wide:true,multiline:true});
    field(fields,"感悟或想补的一句","reflection",entry,{wide:true,multiline:true});
    field(fields,"记录状态","status",entry,{select:true});
    box.append(fields);
    box.append(window.JournalPhotos.editor(entry));
    if (entry.source) {
      const source=make("details","source");
      source.append(make("summary","","查看原文"),make("p","",entry.source));
      box.append(source);
    }
    if (state.drafts.length>1) box.append(button("忽略这条","skip",()=>{state.drafts.splice(index,1);showReview();}));
    container.append(box);
  });
  byId("entry-dialog").scrollTop=0;
}
async function editEntry(entry) {
  if (openingEdit || document.querySelector("dialog[open]")) return;
  openingEdit=true;
  notice("");
  const session={id:entry.id,token:crypto.randomUUID().replaceAll("-","")};
  try {
    const {entry:current}=await updateEditLock(session,"acquire");
    if (document.querySelector("dialog[open]")) {
      releaseEdit(session);
      return;
    }
    activeEdit=session;
    state.original=current;
    state.drafts=[{...current,people:[...current.people],photos:[...(current.photos||[])]}];
    byId("entry-modes").hidden=true;
    showReview();
    byId("entry-dialog").showModal();
    session.timer=setInterval(async()=>{
      try {
        await updateEditLock(session,"renew");
      } catch(error) {
        if (activeEdit===session && byId("entry-dialog").open) {
          byId("edit-error").textContent=error.message;
        }
      }
    }, 40000);
  } catch(error) {
    notice(error.message);
  } finally {
    openingEdit=false;
  }
}
function updateEditLock(session,action) {
  return api("/api/edit-lock",{id:session.id,token:session.token,action});
}
function releaseEdit(session) {
  return fetch("/api/edit-lock",{
    method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,
    body:JSON.stringify({id:session.id,token:session.token,action:"release"})
  }).catch(()=>{});
}
function finishEdit() {
  if (!activeEdit) return;
  const session=activeEdit;
  activeEdit=null;
  clearInterval(session.timer);
  return releaseEdit(session);
}
async function api(path, payload) {
  const response=await fetch(path,payload===undefined?{cache:"no-store"}:{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
  });
  const data=await response.json();
  if (!response.ok) throw new Error(data.error||"读取手账失败。");
  return data;
}
function applyData(data) {
  state.events=data.events;state.tripStart=data.tripStart||"";state.loaded=true;
  state.submissions=data.submissions||[];
  if (!shared) {
    const pending=state.submissions.filter(item=>!item.eventId).length;
    byId("inbox-open").textContent=pending ? "素材收件箱 ("+pending+")" : "素材收件箱";
  }
}
function lockEntryDialog() {
  const dialog=byId("entry-dialog");
  const controls=[...dialog.querySelectorAll("button,input,select,textarea")].filter(control=>!control.disabled);
  const blockCancel=event=>event.preventDefault();
  controls.forEach(control=>{control.disabled=true;});
  dialog.addEventListener("cancel",blockCancel);
  return ()=>{
    controls.forEach(control=>{control.disabled=false;});
    dialog.removeEventListener("cancel",blockCancel);
  };
}
async function saveMaterial() {
  const text=byId("material-text").value.trim();
  const author=byId("material-author").value.trim();
  const submit=byId("submit-material");
  const unlock=lockEntryDialog();
  byId("edit-error").textContent="";
  submit.textContent="正在提交…";
  try {
    const [{id,photos}]=await window.JournalPhotos.prepare([materialDraft]);
    if (!text && !photos.length) throw new Error("请写一段文字或添加一张照片。");
    syncJournal(await api("/api/submissions",{id,text,author,photos}));
    byId("entry-dialog").close();
    notice("素材已进入收件箱，等待 Codex 整理。");
  } catch(error) {
    byId("edit-error").textContent=error.message;
  } finally {
    unlock();
    submit.textContent="提交素材";
  }
}
function paintInbox() {
  const list=byId("inbox-items");
  list.replaceChildren();
  if (!state.submissions.length) {
    list.append(make("p","section-placeholder","还没有投稿。"));
    return;
  }
  for (const item of [...state.submissions].reverse()) {
    const card=make("article","inbox-item");
    const entry=state.events.find(event=>event.id===item.eventId);
    card.append(make("strong","",entry ? "已整理 · "+entry.event : "待整理"));
    if (item.author) card.append(make("p","metadata",item.author));
    if (item.text) card.append(make("p","",item.text));
    if (item.photos.length) card.append(window.JournalPhotos.gallery({...item,event:item.text||"素材照片"}));
    if (entry) card.append(button("查看手记","quiet",()=>{
      byId("inbox-dialog").close();
      state.demo=false;state.page="trip";state.day=dayKey(entry.day);state.selected=entry.id;render();
    }));
    list.append(card);
  }
}
async function importMaterialPacket(event) {
  const input=event.currentTarget, file=input.files[0];
  const progress=byId("material-import-status");
  if (!file) return;
  input.disabled=true;
  progress.textContent="正在导入素材…";
  try {
    if (file.size>34*1024*1024) throw new Error("素材包超过 34 MiB。");
    const response=await fetch("/api/material-packet",{method:"POST",headers:{"Content-Type":"application/json"},body:file});
    const data=await response.json();
    if (!response.ok) throw new Error(data.error||"无法导入素材。");
    syncJournal(data);
    paintInbox();
    progress.textContent="导入完成。已存在的素材包只保留一份。";
  } catch(error) {progress.textContent=error.message;}
  finally {input.disabled=false;input.value="";}
}
async function saveDrafts() {
  const missing=state.drafts.findIndex(record=>!record.event.trim());
  if (missing!==-1) {
    byId("edit-error").textContent="请给第 "+(missing+1)+" 条写下发生的事。";
    byId("drafts").querySelectorAll('[data-field="event"]')[missing].focus();
    return;
  }
  const save=byId("save");
  const unlock=lockEntryDialog();
  byId("edit-error").textContent="";
  save.textContent="正在保存…";
  try {
    if (state.original) {
      if (!activeEdit || activeEdit.id!==state.original.id) throw new Error("请重新打开手记后再保存。");
      await updateEditLock(activeEdit,"acquire");
    }
    const payload={events:await window.JournalPhotos.prepare(state.drafts)};
    if (state.original) {
      await updateEditLock(activeEdit,"acquire");
      payload.expected={[state.original.id]:state.original};
      payload.editTokens={[state.original.id]:activeEdit.token};
    }
    const data=await api("/api/events",payload);
    const first=state.drafts[0];
    applyData(data);
    state.demo=false;state.page="trip";state.day=dayKey(first.day.trim());
    state.selected=first.id||data.events.find(row=>row.event===first.event.trim() && row.place===first.place.trim() && row.day===first.day.trim() && row.time===first.time.trim())?.id||"";
    await finishEdit();
    byId("entry-dialog").close();
    render();
    notice(["已保存到我的手账",data.added?"新增 "+data.added+" 条":"",data.updated?"更新 "+data.updated+" 条":"",data.skipped?"已有 "+data.skipped+" 条相同记录":""].filter(Boolean).join(" · "));
  } catch(error) {
    byId("edit-error").textContent=error.message;
  } finally {
    unlock();
    save.textContent="存入我的手账";
  }
}
function startUI() {
  byId("brand").addEventListener("click",e=>{e.preventDefault();state.page="trip";render()});
  document.querySelectorAll("[data-page]").forEach(node=>node.addEventListener("click",()=>{state.page=node.dataset.page;render()}));
  document.querySelectorAll("[data-mode]").forEach(node=>node.addEventListener("click",()=>{state.mode=node.dataset.mode;render()}));
  byId("days").addEventListener("change",event=>selectDay(event.target.value));
  if (shared) return;
  byId("entry-dialog").addEventListener("close",finishEdit);
  window.addEventListener("pagehide",()=>{if(activeEdit) releaseEdit(activeEdit)});
  const more = byId("more");
  more.addEventListener("click",event=>{if(event.target.closest("button")) more.open=false});
  document.addEventListener("click",event=>{if(!more.contains(event.target)) more.open=false});
  more.addEventListener("keydown",event=>{
    if(event.key==="Escape" && more.open) {
      more.open=false;
      more.querySelector("summary").focus();
    }
  });
  byId("add").addEventListener("click",openCompose);
  document.querySelectorAll("[data-entry-mode]").forEach(node=>node.addEventListener("click",()=>chooseEntryMode(node.dataset.entryMode)));
  byId("submit-material").addEventListener("click",saveMaterial);
  byId("material-import").addEventListener("change",importMaterialPacket);
  byId("inbox-open").addEventListener("click",async()=>{
    const opener=byId("inbox-open");
    opener.disabled=true;
    try {
      syncJournal(await api("/api/journal"));
      paintInbox();
      byId("inbox-dialog").showModal();
    } catch(error) {notice(error.message);}
    finally {opener.disabled=false;}
  });
  byId("share").addEventListener("click",()=>window.JournalShare.open([...groupDays().values()].flat(),state.demo));
  byId("sample").addEventListener("click",()=>{state.demo=!state.demo;state.day="";state.selected="";notice("");render()});
  document.querySelectorAll("[data-close]").forEach(node=>node.addEventListener("click",()=>node.closest("dialog").close()));
  byId("parse").addEventListener("click",()=>{
    const people=[...new Set(state.events.flatMap(record=>record.people))];
    const places=[...new Set(state.events.map(record=>record.place).filter(Boolean))];
    state.drafts=window.JournalIntake.parse(byId("raw").value,people,places);
    if (!state.drafts.length) {byId("edit-error").textContent="写下一件事再整理，或者点“按字段填写”。";return;}
    showReview();
  });
  byId("manual").addEventListener("click",showReview);
  byId("back").addEventListener("click",()=>{byId("compose").hidden=false;byId("review").hidden=true;byId("entry-heading").textContent="记一件事";byId("edit-error").textContent="";byId("raw").focus()});
  byId("save").addEventListener("click",saveDrafts);
  byId("settings").addEventListener("click",()=>{byId("trip-start").value=state.tripStart;byId("settings-error").textContent="";byId("settings-dialog").showModal()});
  byId("save-settings").addEventListener("click",async()=>{
    try {
      applyData(await api("/api/settings",{tripStart:byId("trip-start").value}));
      byId("settings-dialog").close();render();notice("已保存我的手账设置。");
    } catch(error) {byId("settings-error").textContent=error.message;}
  });
}
async function refresh() {
  if (!state.loaded || document.hidden || document.querySelector("dialog[open]")) return;
  try {
    const data=await api("/api/journal");
    if (!document.querySelector("dialog[open]")) syncJournal(data);
  } catch {notice("暂时无法连接本机手账。可重新打开启动入口后刷新。");}
}
function syncJournal(data) {
  const eventsChanged=JSON.stringify(data.events)!==JSON.stringify(state.events);
  const startChanged=(data.tripStart||"")!==state.tripStart;
  if (!state.events.length && data.events.length) state.demo=false;
  applyData(data);
  if (eventsChanged || startChanged) render();
}
async function init() {
  try {
    if (shared) {
      applyData(shared);
      state.demo=!!shared.demo;
      startUI();render();return;
    }
    const [journal,sample]=await Promise.all([api("/api/journal"),api("./sample.json")]);
    sampleEvents=sample.events;
    window.JOURNAL_DEMO_KEYS=new Set(sampleEvents.flatMap(record=>record.photos||[]));
    applyData(journal);
    state.demo=state.events.length===0;
    startUI();render();
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",()=>{if (!document.hidden) refresh()});
    setInterval(refresh,15000);
  } catch(error) {notice("无法打开手账："+error.message+"。请从“启动旅行手账.cmd”进入。");}
}
init();
