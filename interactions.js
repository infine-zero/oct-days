(() => {
  "use strict";
  const endpoint = document.currentScript.dataset.api;
  if (!endpoint) return;

  const reactions = [["👋", "拍一拍"], ["☺️", "微笑"], ["😅", "尷尬"], ["🤩", "崇拜"]];
  const preferenceKey = "oct-days-interactions-enabled";
  const clientKey = "oct-days-interactions-client";
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  let enabled = read(preferenceKey) !== "false";
  let clientId;
  let mounted;

  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text) result.textContent = text;
    return result;
  }

  function button(text, className, action) {
    const result = node("button", className, text);
    result.type = "button";
    result.addEventListener("click", action);
    return result;
  }

  function unmount() {
    mounted?.dispose();
    mounted = null;
  }

  function create(id) {
    let state = { counts: {}, selected: [], comments: [], before: null };
    let pending;
    let timer;
    let loaded = false;
    let older = [];
    let draftRequest;
    let refreshTask;
    const section = node("section", "entry-interactions");
    const bar = node("div", "interaction-bar");
    const pills = node("div", "interaction-pills");
    const comments = node("ul", "interaction-comments");
    const panel = node("div", "interaction-panel");
    const picker = node("div", "interaction-picker");
    const choices = node("div", "interaction-choices");
    const status = node("p", "interaction-status");
    status.setAttribute("role", "status");
    section.setAttribute("aria-label", "手記互動");
    panel.hidden = true;
    const trigger = button("＋ 互動", "interaction-trigger", () => {
      if (!panel.hidden) return close();
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      if (!loaded) refresh();
    });
    trigger.setAttribute("aria-expanded", "false");

    const form = node("form", "interaction-form");
    form.hidden = true;
    const input = node("textarea");
    input.rows = 2;
    input.maxLength = 140;
    input.required = true;
    input.placeholder = "寫一句留言…";
    input.setAttribute("aria-label", "留言");
    const name = node("input");
    name.maxLength = 20;
    name.placeholder = "署名（選填）";
    name.setAttribute("aria-label", "署名（選填）");
    const send = node("button", "", "送出");
    send.type = "submit";
    form.append(name, input, send);

    function close() {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }

    async function request({ method = "GET", body, before } = {}) {
      if (!enabled || pending || !section.isConnected) return;
      const controller = new AbortController();
      pending = controller;
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        if (!clientId) {
          clientId = read(clientKey) || crypto.randomUUID();
          write(clientKey, clientId);
        }
        const url = new URL(endpoint, location.href);
        url.searchParams.set("entryId", id);
        url.searchParams.set("clientId", clientId);
        if (before) url.searchParams.set("before", before);
        const response = await fetch(url, {
          method, signal: controller.signal, credentials: "omit",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (response.status === 429) throw new Error("請稍等片刻再試。");
        if (!response.ok) throw new Error("暫時無法同步，請再試一次。");
        const snapshot = await response.json();
        if (pending !== controller || !enabled || !section.isConnected) return;
        status.textContent = "";
        return snapshot;
      } catch (error) {
        if (pending === controller) {
          status.textContent = error.name === "AbortError" ? "同步逾時，請再試一次。"
            : error instanceof TypeError ? "暫時無法同步，請再試一次。" : error.message;
        }
      } finally {
        clearTimeout(timeout);
        if (pending === controller) pending = null;
      }
    }

    function refresh() {
      if (document.hidden || older.length) return;
      if (refreshTask) return refreshTask;
      refreshTask = request().then(result => {
        if (!result) return;
        loaded = true;
        if (JSON.stringify(state) === JSON.stringify(result)) return;
        state = result;
        render();
      }).finally(() => { refreshTask = null; });
      return refreshTask;
    }

    async function toggleReaction(emoji, fromPicker) {
      if (refreshTask) await refreshTask;
      if (!loaded) {
        await refresh();
        if (!loaded) return;
      }
      const result = await request({
        method: "PUT", body: { emoji, active: !state.selected.includes(emoji) },
      });
      if (!result) return;
      state.counts = result.counts;
      state.selected = result.selected;
      render();
      if (fromPicker) close();
      (fromPicker ? trigger : pills.querySelector('[data-emoji="'+emoji+'"]') || trigger).focus();
    }

    const reactionButtons = reactions.map(([emoji, label]) => {
      const choice = button(emoji, "", () => toggleReaction(emoji, true));
      choice.setAttribute("aria-label", label);
      choices.append(choice);
      return [emoji, choice];
    });
    picker.append(choices, button("留言", "interaction-comment-action", () => {
      form.hidden = false;
      input.focus();
    }));
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (send.disabled) return;
      const text = input.value.trim();
      const author = name.value.trim();
      if (!text) return;
      if (draftRequest?.text !== text || draftRequest?.author !== author) {
        draftRequest = { author, text, requestId: crypto.randomUUID() };
      }
      send.disabled = true;
      if (refreshTask) await refreshTask;
      const result = await request({ method: "POST", body: draftRequest });
      send.disabled = false;
      if (!result) return;
      draftRequest = null;
      loaded = true;
      older = [];
      state = result;
      form.reset();
      form.hidden = true;
      render();
      close();
      trigger.focus();
    });
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") { close(); trigger.focus(); }
    });
    const more = button("更早的留言", "interaction-more", async () => {
      const result = await request({ before: state.before });
      if (!result) return;
      older.unshift(...result.comments);
      state.before = result.before;
      render();
    });

    function render() {
      const previousEmoji = document.activeElement?.parentNode === pills
        ? document.activeElement.dataset.emoji : null;
      const visible = [];
      for (const [emoji, label] of reactions) {
        const count = state.counts[emoji];
        if (!count) continue;
        const pill = button(emoji + " " + count, "reaction-pill", () => toggleReaction(emoji, false));
        pill.dataset.emoji = emoji;
        pill.setAttribute("aria-label", label+"，"+count+" 次");
        pill.setAttribute("aria-pressed", String(state.selected.includes(emoji)));
        visible.push(pill);
      }
      pills.replaceChildren(...visible);
      if (previousEmoji) (pills.querySelector('[data-emoji="'+previousEmoji+'"]') || trigger).focus();
      const allComments = new Map([...older, ...state.comments].map(comment => [comment.id, comment]));
      comments.replaceChildren(...Array.from(allComments.values(), comment =>
        node("li", "", (comment.author?.trim() || "某人") + " · " + comment.text)));
      more.hidden = !state.before;
      for (const [emoji, choice] of reactionButtons) {
        const selected = state.selected.includes(emoji);
        choice.setAttribute("aria-pressed", String(selected));
        choice.textContent = emoji;
        if (selected) {
          const tick = node("span", "reaction-check", "✓");
          tick.setAttribute("aria-hidden", "true");
          choice.append(tick);
        }
      }
    }

    function dispose() {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      const controller = pending;
      pending = null;
      controller?.abort();
    }

    function update() {
      section.hidden = !enabled;
      if (enabled) {
        refresh();
        timer = setInterval(refresh, 10_000);
        document.addEventListener("visibilitychange", refresh);
      } else {
        dispose();
        close();
        status.textContent = "";
      }
    }

    panel.append(picker, form);
    bar.append(pills, trigger);
    section.append(more, comments, status, bar, panel);
    section.hidden = !enabled;
    render();
    mounted = { update, dispose };
    queueMicrotask(() => { if (section.isConnected) update(); });
    return section;
  }

  function bindToggle(toggle) {
    if (!toggle) return;
    const dialog = toggle.closest("dialog");
    const settings = document.getElementById("reader-settings-open");
    if (dialog && settings) {
      settings.hidden = false;
      settings.addEventListener("click", () => dialog.showModal());
    }
    toggle.hidden = false;
    toggle.setAttribute("aria-label", "显示留言和表情");
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.addEventListener("click", () => {
      enabled = !enabled;
      write(preferenceKey, enabled);
      toggle.setAttribute("aria-pressed", String(enabled));
      mounted?.update();
    });
  }

  window.NoteInteractions = { create, bindToggle, unmount };
})();
