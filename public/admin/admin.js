/* =========================================================================
   MICE Namibia admin: shared browser code.
   Same interaction model as the Zusammen admin (slide-in panel, toasts,
   image picker, gallery), with the lessons learned built in:
   - Forms are rendered on the server and their field names ARE the API
     field names, so nothing is mapped by hand in JavaScript.
   - Every request sends the CSRF token; a 401 sends you back to the login.
   - Nothing user-supplied is ever written with innerHTML; server-rendered
     fragments are already escaped by EJS.
   ========================================================================= */
(function () {
  "use strict";

  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
  const ICON = (name, cls = "icon-sm") =>
    `<svg class="${cls}" aria-hidden="true"><use href="/admin/icons.svg#i-${name}"/></svg>`;

  /* Requests ------------------------------------------------------------- */

  async function request(url, { method = "GET", body, headers = {}, accept = "application/json" } = {}) {
    const opts = {
      method,
      credentials: "same-origin",
      headers: { Accept: accept, "X-Requested-With": "fetch", "X-CSRF-Token": csrfToken, ...headers },
    };
    if (body !== undefined) {
      if (body instanceof FormData) opts.body = body;
      else {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(url, opts);
    if (res.status === 401) {
      window.location.href = `/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      throw new Error("Your session has ended.");
    }
    if (accept === "text/html") {
      if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `Request failed (${res.status})`);
      return res.text();
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.fieldErrors = data.fieldErrors;
      throw err;
    }
    return data;
  }

  /* Toasts ----------------------------------------------------------------- */

  const toastBox = document.querySelector("[data-toasts]");
  function toast(message, type = "info") {
    if (!toastBox) return;
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    t.setAttribute("role", type === "error" ? "alert" : "status");
    t.innerHTML = ICON(type === "error" ? "alert" : "check");
    const span = document.createElement("span");
    span.textContent = message;
    t.appendChild(span);
    const remove = () => {
      t.classList.add("is-leaving");
      setTimeout(() => t.remove(), 300);
    };
    t.addEventListener("click", remove);
    setTimeout(remove, type === "error" ? 7000 : 4000);
    toastBox.appendChild(t);
  }
  // Survives a reload, so "Saved" still shows after the list refreshes.
  function toastAfterReload(message, type = "success") {
    try {
      sessionStorage.setItem("admin-toast", JSON.stringify({ message, type }));
    } catch {
      /* private mode: skip */
    }
  }
  try {
    const pending = JSON.parse(sessionStorage.getItem("admin-toast") || "null");
    if (pending) {
      sessionStorage.removeItem("admin-toast");
      toast(pending.message, pending.type);
    }
  } catch {
    /* ignore */
  }

  /* Confirm dialog (instead of window.confirm) ----------------------------- */

  const dialog = document.querySelector("[data-confirm-dialog]");
  function confirmAction({ title = "Are you sure?", text = "", ok = "Delete" } = {}) {
    if (!dialog || typeof dialog.showModal !== "function") return Promise.resolve(window.confirm(`${title}\n\n${text}`));
    dialog.querySelector("[data-confirm-title]").textContent = title;
    dialog.querySelector("[data-confirm-text]").textContent = text;
    dialog.querySelector("[data-confirm-ok]").textContent = ok;
    dialog.returnValue = "";
    dialog.showModal();
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    });
  }

  /* Sidebar (mobile) ------------------------------------------------------ */

  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.querySelector("[data-sidebar-toggle]");
  if (sidebar && sidebarToggle) {
    const setOpen = (open) => {
      sidebar.classList.toggle("open", open);
      sidebarToggle.setAttribute("aria-expanded", String(open));
    };
    sidebarToggle.addEventListener("click", () => setOpen(!sidebar.classList.contains("open")));
    document.addEventListener("click", (e) => {
      if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  /* Slide-in panel ------------------------------------------------------------ */

  const panel = document.querySelector("[data-panel]");
  const overlay = document.querySelector("[data-panel-overlay]");
  let panelDirty = false;
  let panelOpener = null;

  async function openPanel(url, { wide = false } = {}) {
    if (!panel) return;
    panelOpener = document.activeElement;
    panel.classList.toggle("panel--wide", wide);
    panel.innerHTML = '<div class="panel-loading">Loading…</div>';
    panel.classList.add("open");
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    try {
      panel.innerHTML = await request(url, { accept: "text/html" });
    } catch (err) {
      panel.innerHTML = "";
      const box = document.createElement("div");
      box.className = "panel-body";
      box.innerHTML = `<div class="alert alert-error">${ICON("alert", "icon")}<span></span></div>`;
      box.querySelector("span").textContent = err.message;
      panel.appendChild(box);
      return;
    }
    panelDirty = false;
    initComponents(panel);
    markRowRead(panel.querySelector("[data-marked-read]"));
    const form = panel.querySelector("form");
    if (form) {
      form.addEventListener("input", () => (panelDirty = true));
      form.addEventListener("change", () => (panelDirty = true));
    }
    (panel.querySelector("[autofocus]") || panel.querySelector("input:not([type=hidden]), select, textarea, [contenteditable]"))?.focus();
  }

  // Opening a new enquiry marks it as read on the server; reflect that here.
  function markRowRead(flag) {
    if (!flag) return;
    const row = document.querySelector(`tr[data-row="${CSS.escape(flag.dataset.markedRead)}"]`);
    row?.classList.remove("row-unread");
    const badge = row?.querySelector("[data-status-badge]");
    if (badge) {
      badge.className = "badge badge-read";
      badge.textContent = "Read";
    }
    const count = document.querySelector('.sidebar a[href="/admin/submissions"] .nav-count');
    if (count) {
      const n = Number(count.textContent) - 1;
      if (n > 0) {
        count.textContent = String(n);
        count.setAttribute("aria-label", `${n} new`);
      } else count.remove();
    }
  }

  async function closePanel({ force = false } = {}) {
    if (!panel?.classList.contains("open")) return;
    if (panelDirty && !force) {
      const discard = await confirmAction({ title: "Discard your changes?", text: "You have unsaved changes in this form.", ok: "Discard" });
      if (!discard) return;
    }
    panel.classList.remove("open");
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    panelDirty = false;
    const url = new URL(location.href);
    if (url.searchParams.has("edit") || url.searchParams.has("new") || url.searchParams.has("open")) {
      ["edit", "new", "open"].forEach((p) => url.searchParams.delete(p));
      history.replaceState(null, "", url);
    }
    setTimeout(() => {
      if (!panel.classList.contains("open")) panel.innerHTML = "";
    }, 320);
    panelOpener?.focus?.();
  }

  overlay?.addEventListener("click", () => closePanel());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel?.classList.contains("open") && !dialog?.open) {
      // Defer: opening the "discard changes?" dialog during this same Escape
      // keypress would let the browser close it again immediately.
      e.preventDefault();
      setTimeout(() => closePanel(), 0);
    }
  });
  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-open-panel]");
    if (opener) {
      e.preventDefault();
      openPanel(opener.dataset.openPanel, { wide: opener.hasAttribute("data-wide") });
      if (opener.dataset.deepLink) history.replaceState(null, "", opener.dataset.deepLink);
      return;
    }
    if (e.target.closest("[data-close-panel]")) {
      e.preventDefault();
      closePanel();
    }
  });

  // ?new=1 / ?edit=12 / ?open=12 open the panel straight away (dashboard links).
  const auto = document.querySelector("[data-autopanel]");
  if (auto?.dataset.autopanel) openPanel(auto.dataset.autopanel, { wide: auto.hasAttribute("data-wide") });

  /* Forms -------------------------------------------------------------------- */

  function serialize(form) {
    const data = {};
    form.querySelectorAll("[data-rte]").forEach((ed) => ed.__sync?.());
    for (const el of form.elements) {
      if (!el.name || el.disabled || el.name === "_csrf") continue;
      if (el.name.endsWith("[]")) {
        const key = el.name.slice(0, -2);
        data[key] = data[key] || [];
        if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
        if (el.tagName === "SELECT") data[key].push(...[...el.selectedOptions].map((o) => o.value));
        else data[key].push(el.value);
      } else if (el.type === "checkbox") {
        data[el.name] = el.checked;
      } else if (el.type === "radio") {
        if (el.checked) data[el.name] = el.value;
      } else if (el.dataset.json !== undefined) {
        try {
          data[el.name] = JSON.parse(el.value || "null");
        } catch {
          data[el.name] = null;
        }
      } else {
        data[el.name] = el.value;
      }
    }
    return data;
  }

  function clearErrors(form) {
    form.querySelectorAll(".field-error").forEach((n) => n.remove());
    form.querySelectorAll('[aria-invalid="true"]').forEach((n) => n.removeAttribute("aria-invalid"));
    form.querySelector("[data-form-error]")?.setAttribute("hidden", "");
  }

  function showErrors(form, fieldErrors = {}, message) {
    let first = null;
    for (const [name, msg] of Object.entries(fieldErrors)) {
      const field = form.querySelector(`[name="${CSS.escape(name)}"], [name="${CSS.escape(name)}[]"], [data-field="${CSS.escape(name)}"]`);
      const group = field?.closest(".form-group") || field?.parentElement;
      if (!group) continue;
      (field.matches("input, select, textarea") ? field : group).setAttribute("aria-invalid", "true");
      const p = document.createElement("p");
      p.className = "field-error";
      p.textContent = msg;
      group.appendChild(p);
      first = first || field;
    }
    const box = form.querySelector("[data-form-error]");
    if (box && message) {
      box.querySelector("span").textContent = message;
      box.removeAttribute("hidden");
    }
    (first || box)?.scrollIntoView({ block: "center", behavior: "smooth" });
    first?.focus?.({ preventScroll: true });
  }

  document.addEventListener("submit", async (e) => {
    const form = e.target.closest("form[data-admin-form]");
    if (!form) return;
    e.preventDefault();
    clearErrors(form);
    const submitter = e.submitter;
    const buttons = form.querySelectorAll("button[type=submit]");
    buttons.forEach((b) => b.setAttribute("aria-busy", "true"));
    try {
      const body = serialize(form);
      if (submitter?.name) body[submitter.name] = submitter.value;
      const data = await request(form.getAttribute("action"), { method: form.dataset.method || "POST", body });
      panelDirty = false;
      toastAfterReload(data.message || "Saved");
      window.location.href = data.redirect || location.pathname + location.search.replace(/[?&](new|edit|open)=[^&]*/g, "");
    } catch (err) {
      showErrors(form, err.fieldErrors, err.message);
      toast(err.message, "error");
    } finally {
      buttons.forEach((b) => b.removeAttribute("aria-busy"));
    }
  });

  /* Row actions: delete, quick status changes -------------------------------- */

  document.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-delete]");
    if (del) {
      e.preventDefault();
      const ok = await confirmAction({
        title: `Delete ${del.dataset.label || "this item"}?`,
        text: del.dataset.warning || "This cannot be undone.",
      });
      if (!ok) return;
      try {
        const data = await request(del.dataset.delete, { method: "DELETE" });
        panelDirty = false;
        toastAfterReload(data.message || "Deleted");
        location.href = location.pathname;
      } catch (err) {
        toast(err.message, "error");
      }
      return;
    }
    const act = e.target.closest("[data-action]");
    if (act) {
      e.preventDefault();
      try {
        const data = await request(act.dataset.action, { method: act.dataset.method || "POST", body: JSON.parse(act.dataset.body || "{}") });
        toastAfterReload(data.message || "Updated");
        location.reload();
      } catch (err) {
        toast(err.message, "error");
      }
    }
  });

  /* Copy to clipboard (temporary passwords) ----------------------------------- */

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const field = document.querySelector(btn.dataset.copy);
    if (!field) return;
    const label = btn.querySelector("[data-copy-label]");
    try {
      await navigator.clipboard.writeText(field.value);
    } catch {
      // Clipboard API blocked (plain http on some browsers): fall back to selecting it.
      field.select();
      if (!document.execCommand("copy")) return toast("Select the password and copy it by hand.", "error");
    }
    if (label) {
      label.textContent = "Copied";
      setTimeout(() => (label.textContent = "Copy"), 2000);
    }
    toast("Copied to the clipboard", "success");
  });

  /* Table filter (client side, instant) -------------------------------------- */

  document.querySelectorAll("[data-table-search]").forEach((input) => {
    const table = document.querySelector(input.dataset.tableSearch);
    if (!table) return;
    const empty = document.querySelector(`${input.dataset.tableSearch}-empty`);
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      let shown = 0;
      table.querySelectorAll("tbody tr").forEach((tr) => {
        const hit = !q || (tr.dataset.search || tr.textContent).toLowerCase().includes(q);
        tr.hidden = !hit;
        if (hit) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    });
  });

  /* Components inside forms --------------------------------------------------- */

  function initComponents(root) {
    root.querySelectorAll("[data-image-picker]").forEach(initImagePicker);
    root.querySelectorAll("[data-gallery]").forEach(initGallery);
    root.querySelectorAll("[data-tag-picker]").forEach(initTagPicker);
    root.querySelectorAll("[data-rte]").forEach(initEditor);
    root.querySelectorAll("[data-count]").forEach(initCharCount);
    root.querySelectorAll("[data-slug-from]").forEach(initSlug);
    root.querySelectorAll("[data-tabs]").forEach(initTabs);
    root.querySelectorAll("[data-sortable]").forEach(initSortable);
    root.querySelectorAll("[data-bulk-upload]").forEach(initBulkUpload);
  }

  /* Bulk upload (gallery): many files, uploaded one after another, each with
     its own progress bar. Every file becomes a draft on the server; the page
     reloads at the end to show them. */

  function initBulkUpload(root) {
    const url = root.dataset.bulkUpload;
    const input = root.querySelector("input[type=file]");
    const drop = root.querySelector(".img-drop");
    const list = root.querySelector(".bulk-list");
    const status = root.querySelector("[data-bulk-status]");
    let busy = false;

    function row(file) {
      const li = document.createElement("li");
      li.className = "bulk-item";
      li.innerHTML = '<span class="bulk-name"></span><div class="progress"><span></span></div><span class="bulk-state">Waiting</span>';
      li.querySelector(".bulk-name").textContent = file.name;
      list.appendChild(li);
      return {
        progress: (p) => (li.querySelector(".progress span").style.width = `${Math.round(p * 100)}%`),
        done: (text, ok) => {
          li.classList.add(ok ? "is-done" : "is-failed");
          li.querySelector(".bulk-state").textContent = text;
        },
        start: () => (li.querySelector(".bulk-state").textContent = "Uploading"),
      };
    }

    async function run(files) {
      if (busy || !files.length) return;
      busy = true;
      list.hidden = false;
      list.textContent = "";
      const rows = files.map((f) => ({ file: f, ui: row(f) }));
      let added = 0;
      for (const [i, { file, ui }] of rows.entries()) {
        ui.start();
        if (status) status.textContent = `Uploading ${i + 1} of ${rows.length}: ${file.name}`;
        try {
          await uploadFile(file, ui.progress, { url });
          ui.progress(1);
          ui.done("Added as a draft", true);
          added++;
        } catch (err) {
          ui.done(err.message, false);
        }
      }
      const failed = rows.length - added;
      const summary = `${added} photo${added === 1 ? "" : "s"} added as drafts${failed ? `, ${failed} failed` : ""}.`;
      if (status) status.textContent = summary;
      busy = false;
      if (added) {
        toastAfterReload(`${summary} Add a description to each, then publish.`, failed ? "error" : "success");
        setTimeout(() => location.reload(), failed ? 4000 : 1200);
      } else toast(summary, "error");
    }

    input?.addEventListener("change", () => {
      run([...input.files]);
      input.value = "";
    });
    drop?.addEventListener("dragover", (e) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      drop.classList.add("is-dragover");
    });
    drop?.addEventListener("dragleave", () => drop.classList.remove("is-dragover"));
    drop?.addEventListener("drop", (e) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      drop.classList.remove("is-dragover");
      run([...e.dataTransfer.files]);
    });
  }

  // mode "logo" keeps the file as it is (PNG transparency, SVG); fields go
  // before the file so the server has them when the file arrives.
  function uploadFile(file, onProgress, { mode, url = "/admin/media", fields = {} } = {}) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      if (mode) fd.append("mode", mode);
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      fd.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("X-CSRF-Token", csrfToken);
      xhr.setRequestHeader("X-Requested-With", "fetch");
      xhr.setRequestHeader("Accept", "application/json");
      xhr.upload.addEventListener("progress", (e) => e.lengthComputable && onProgress?.(e.loaded / e.total));
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status === 401) window.location.href = "/admin/login";
        if (xhr.status >= 200 && xhr.status < 300) resolve(data.media || data);
        else reject(new Error(data.error || `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
      xhr.send(fd);
    });
  }

  function initTabs(root) {
    const tabs = root.querySelectorAll("[role=tab]");
    tabs.forEach((tab) =>
      tab.addEventListener("click", () => {
        tabs.forEach((t) => {
          const on = t === tab;
          t.setAttribute("aria-selected", String(on));
          root.querySelector(`[data-tab-panel="${t.dataset.tab}"]`).hidden = !on;
        });
      })
    );
  }

  function initImagePicker(root) {
    const input = root.querySelector("input[type=hidden]");
    const file = root.querySelector("input[type=file]");
    const drop = root.querySelector(".img-drop");
    const progress = root.querySelector(".progress");
    const bar = progress?.querySelector("span");
    const preview = root.querySelector(".img-preview");
    const previewImg = preview?.querySelector("img");
    const previewMeta = preview?.querySelector(".img-preview-meta");
    const urlInput = root.querySelector("input[type=url]");
    const importBtn = root.querySelector("[data-import]");

    const set = (media) => {
      input.value = media ? media.id : "";
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (!preview) return;
      preview.hidden = !media;
      if (media) {
        previewImg.src = media.thumb;
        previewMeta.textContent = media.original_name || media.base_url;
      }
    };

    const handle = async (f) => {
      if (!f) return;
      progress.hidden = false;
      bar.style.width = "0%";
      try {
        const media = await uploadFile(f, (p) => (bar.style.width = `${Math.round(p * 90)}%`), { mode: root.dataset.mode });
        bar.style.width = "100%";
        set(media);
        toast("Image uploaded", "success");
      } catch (err) {
        toast(err.message, "error");
      } finally {
        setTimeout(() => (progress.hidden = true), 400);
        file.value = "";
      }
    };

    file?.addEventListener("change", () => handle(file.files[0]));
    drop?.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("is-dragover");
    });
    drop?.addEventListener("dragleave", () => drop.classList.remove("is-dragover"));
    drop?.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("is-dragover");
      handle(e.dataTransfer.files[0]);
    });
    importBtn?.addEventListener("click", async () => {
      const url = urlInput.value.trim();
      if (!url) return toast("Paste an image link first.", "error");
      importBtn.setAttribute("aria-busy", "true");
      try {
        const data = await request("/admin/media/import", { method: "POST", body: { url, mode: root.dataset.mode } });
        set(data.media);
        urlInput.value = "";
        toast("Image copied to the website", "success");
      } catch (err) {
        toast(err.message, "error");
      } finally {
        importBtn.removeAttribute("aria-busy");
      }
    });
    root.querySelector("[data-clear]")?.addEventListener("click", () => set(null));
  }

  /* Reordering ---------------------------------------------------------------
     One implementation for the gallery field and the sortable list tables:
     drag a row by its grip, or focus the grip and press the arrow keys. A row
     is only draggable while its grip is held, so text in it stays selectable,
     and a row can only be dropped inside its own list. */

  let activeDrag = null;

  function bindReorder(row, handle, getIndex, move, list) {
    handle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const i = getIndex();
      move(i, e.key === "ArrowUp" ? i - 1 : i + 1, { keyboard: true });
    });
    handle.addEventListener("pointerdown", () => (row.draggable = true));
    handle.addEventListener("pointerup", () => (row.draggable = false));
    row.addEventListener("dragstart", (e) => {
      activeDrag = { list, from: getIndex() };
      row.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "");
    });
    row.addEventListener("dragend", () => {
      activeDrag = null;
      row.draggable = false;
      row.classList.remove("is-dragging");
    });
    row.addEventListener("dragover", (e) => {
      if (activeDrag?.list !== list) return;
      e.preventDefault();
      row.classList.add("is-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("is-over"));
    row.addEventListener("drop", (e) => {
      row.classList.remove("is-over");
      if (activeDrag?.list !== list) return;
      e.preventDefault();
      move(activeDrag.from, getIndex(), { keyboard: false });
    });
  }

  // Screen-reader announcements for reordering (one shared live region).
  let sortStatus = null;
  function announce(text) {
    if (!sortStatus) {
      sortStatus = document.createElement("p");
      sortStatus.className = "visually-hidden";
      sortStatus.setAttribute("aria-live", "polite");
      document.body.appendChild(sortStatus);
    }
    sortStatus.textContent = "";
    setTimeout(() => (sortStatus.textContent = text), 50);
  }

  /* Sortable list tables: <tbody data-sortable="/admin/x/reorder"> with
     <tr data-id data-label> rows and a [data-sort-handle] grip in each. Every
     move is saved with one PATCH of the whole order; if saving fails, the
     rows go back to the last saved order. Keyboard moves are batched so a
     run of arrow presses is one request. */

  function initSortable(tbody) {
    const url = tbody.dataset.sortable;
    const rows = () => [...tbody.querySelectorAll(":scope > tr[data-id]")];
    let saved = rows().map((tr) => tr.dataset.id);
    let timer = null;

    const restore = (ids) => ids.forEach((id) => tbody.appendChild(tbody.querySelector(`:scope > tr[data-id="${CSS.escape(id)}"]`)));

    async function save() {
      const ids = rows().map((tr) => tr.dataset.id);
      if (ids.join() === saved.join()) return;
      tbody.setAttribute("aria-busy", "true");
      try {
        await request(url, { method: "PATCH", body: { ids: ids.map((id) => (/^\d+$/.test(id) ? Number(id) : id)) } });
        saved = ids;
        announce("Order saved.");
        toast("Order saved", "success");
      } catch (err) {
        restore(saved);
        announce(`The order could not be saved. ${err.message}`);
        toast(err.message, "error");
      } finally {
        tbody.removeAttribute("aria-busy");
      }
    }

    function move(from, to, { keyboard }) {
      const list = rows();
      if (to < 0 || to >= list.length || from === to) return;
      const row = list[from];
      if (to > from) list[to].after(row);
      else list[to].before(row);
      if (keyboard) row.querySelector("[data-sort-handle]")?.focus();
      announce(`${row.dataset.label || "Row"} moved to position ${to + 1} of ${list.length}.`);
      clearTimeout(timer);
      timer = setTimeout(save, keyboard ? 700 : 0);
    }

    rows().forEach((tr) => {
      const handle = tr.querySelector("[data-sort-handle]");
      if (handle) bindReorder(tr, handle, () => rows().indexOf(tr), move, tbody);
    });
  }

  function initGallery(root) {
    const store = root.querySelector("input[data-json]");
    const list = root.querySelector(".gallery-list");
    const empty = root.querySelector(".gallery-empty");
    const count = root.querySelector(".gallery-count");
    const file = root.querySelector("input[type=file]");
    const drop = root.querySelector(".img-drop");
    const max = Number(root.dataset.max || 20);
    let items = [];
    try {
      items = JSON.parse(store.value || "[]");
    } catch {
      items = [];
    }

    const save = () => {
      store.value = JSON.stringify(items.map(({ media_id, alt }) => ({ media_id, alt })));
      store.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const move = (from, to) => {
      if (to < 0 || to >= items.length) return;
      const [it] = items.splice(from, 1);
      items.splice(to, 0, it);
      save();
      render();
      list.children[to]?.querySelector(".gallery-handle")?.focus();
    };

    function render() {
      list.textContent = "";
      items.forEach((it, i) => {
        const row = document.createElement("div");
        row.className = "gallery-item";
        row.dataset.index = i;
        row.innerHTML = `<button type="button" class="gallery-handle btn btn-ghost btn-icon btn-sm" aria-label="Move photo ${i + 1}. Use arrow up and down keys.">${ICON("grip")}</button>
          <img alt="">
          <div><label class="visually-hidden">Description for photo ${i + 1}</label><input type="text" maxlength="255" placeholder="Describe the photo (for screen readers and Google)"></div>
          <button type="button" class="btn btn-ghost btn-icon btn-sm btn-icon-danger" aria-label="Remove photo ${i + 1}">${ICON("trash")}</button>`;
        row.querySelector("img").src = it.thumb;
        const alt = row.querySelector("input");
        alt.value = it.alt || "";
        alt.addEventListener("input", () => {
          it.alt = alt.value;
          save();
        });
        row.querySelector(".btn-icon-danger").addEventListener("click", () => {
          items.splice(i, 1);
          save();
          render();
        });
        bindReorder(row, row.querySelector(".gallery-handle"), () => i, move, root);
        list.appendChild(row);
      });
      if (empty) empty.hidden = items.length > 0;
      if (count) count.textContent = `${items.length} of ${max}`;
    }

    const add = async (files) => {
      const room = max - items.length;
      const batch = [...files].slice(0, room);
      if (files.length > room) toast(`Only ${max} photos fit; ${files.length - room} skipped.`, "error");
      for (const f of batch) {
        try {
          const media = await uploadFile(f);
          items.push({ media_id: media.id, alt: "", thumb: media.thumb });
          save();
          render();
        } catch (err) {
          toast(`${f.name}: ${err.message}`, "error");
        }
      }
      if (batch.length) toast(`${batch.length} photo${batch.length === 1 ? "" : "s"} added`, "success");
    };

    file?.addEventListener("change", () => {
      add(file.files);
      file.value = "";
    });
    drop?.addEventListener("dragover", (e) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      drop.classList.add("is-dragover");
    });
    drop?.addEventListener("dragleave", () => drop.classList.remove("is-dragover"));
    drop?.addEventListener("drop", (e) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      drop.classList.remove("is-dragover");
      add(e.dataTransfer.files);
    });
    render();
  }

  function initTagPicker(root) {
    const search = root.querySelector("input[type=search]");
    const options = root.querySelectorAll(".tag-option");
    const counter = root.querySelector("[data-selected-count]");
    const update = () => {
      if (counter) counter.textContent = String(root.querySelectorAll("input[type=checkbox]:checked").length);
    };
    search?.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      options.forEach((o) => (o.hidden = q && !o.textContent.toLowerCase().includes(q)));
    });
    root.addEventListener("change", update);
    update();
  }

  function initCharCount(input) {
    const out = input.closest(".form-group")?.querySelector(".char-count");
    if (!out) return;
    const max = Number(input.dataset.count);
    // data-warn: the length search engines show (60 for titles, 160 for
    // descriptions). Longer is allowed, the counter just says it will be cut.
    const warn = Number(input.dataset.warn) || 0;
    const update = () => {
      const n = input.value.length;
      const over = warn && n > warn;
      out.textContent = over ? `${n} / ${max}, over ${warn}: may be cut off in search results` : `${n} / ${max}`;
      out.classList.toggle("char-count--warn", Boolean(over));
    };
    input.addEventListener("input", update);
    update();
  }

  // Suggests a URL slug from the title until the slug is edited by hand.
  function initSlug(input) {
    const source = input.form?.querySelector(`[name="${input.dataset.slugFrom}"]`);
    if (!source) return;
    let touched = Boolean(input.value);
    const slug = (s) =>
      s
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[‘’']/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    input.addEventListener("input", () => (touched = input.value.length > 0));
    source.addEventListener("input", () => {
      if (!touched) input.value = slug(source.value);
    });
  }

  /* Rich text editor ---------------------------------------------------------
     Small on purpose: headings, bold/italic, lists, quotes and links, which
     is all the article template is designed for. Pasted text is cleaned here
     and the server sanitises everything again before saving. */

  function initEditor(root) {
    const area = root.querySelector(".rte-content");
    const store = root.querySelector("input[type=hidden], textarea");
    const toolbar = root.querySelector(".rte-toolbar");
    area.innerHTML = store.value;
    document.execCommand("defaultParagraphSeparator", false, "p");

    const sync = () => {
      store.value = area.innerHTML;
    };
    root.__sync = sync;
    root.dataset.rte = "ready";
    area.addEventListener("input", () => {
      sync();
      store.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const commands = {
      p: () => document.execCommand("formatBlock", false, "p"),
      h2: () => document.execCommand("formatBlock", false, "h2"),
      h3: () => document.execCommand("formatBlock", false, "h3"),
      h4: () => document.execCommand("formatBlock", false, "h4"),
      bold: () => document.execCommand("bold"),
      italic: () => document.execCommand("italic"),
      ul: () => document.execCommand("insertUnorderedList"),
      ol: () => document.execCommand("insertOrderedList"),
      quote: () => document.execCommand("formatBlock", false, "blockquote"),
      link: () => {
        const url = window.prompt("Link address (https://… or /page):", "https://");
        if (url && url !== "https://") document.execCommand("createLink", false, url.trim());
      },
      unlink: () => document.execCommand("unlink"),
      undo: () => document.execCommand("undo"),
      redo: () => document.execCommand("redo"),
    };
    toolbar.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) e.preventDefault(); // keep the selection
    });
    toolbar.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-cmd]");
      if (!btn) return;
      area.focus();
      commands[btn.dataset.cmd]?.();
      sync();
      store.dispatchEvent(new Event("input", { bubbles: true }));
    });

    area.addEventListener("paste", (e) => {
      const html = e.clipboardData.getData("text/html");
      const text = e.clipboardData.getData("text/plain");
      e.preventDefault();
      if (html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        doc.querySelectorAll("script, style, meta, link, img, iframe, object").forEach((n) => n.remove());
        doc.body.querySelectorAll("*").forEach((n) => {
          [...n.attributes].forEach((a) => {
            if (!(n.tagName === "A" && a.name === "href")) n.removeAttribute(a.name);
          });
          if (["SPAN", "FONT", "DIV", "SECTION"].includes(n.tagName)) n.replaceWith(...n.childNodes);
        });
        document.execCommand("insertHTML", false, doc.body.innerHTML);
      } else {
        const paras = text
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => {
            const el = document.createElement("p");
            el.textContent = p.replace(/\n/g, " ");
            return el.outerHTML;
          })
          .join("");
        document.execCommand("insertHTML", false, paras);
      }
      sync();
    });
  }

  /* Legal pages: upload a .md file into the textarea, then preview the new
     version and compare it word by word with the current one. The preview
     HTML comes from the server's legal renderer, which escapes all text. */

  function initLegalForm(form) {
    const textarea = form.querySelector('textarea[name="markdown"]');
    const fileInput = form.querySelector("[data-md-file]");
    const fileName = form.querySelector("[data-md-file-name]");
    const result = form.querySelector("[data-legal-result]");
    const dateInput = form.querySelector('input[name="effective_date"]');

    fileInput?.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 400 * 1024) {
        toast("That file is larger than 400 KB. Check that the right file was chosen.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        textarea.value = String(reader.result);
        fileName.textContent = `Loaded ${file.name}. Check the preview before publishing.`;
        result.hidden = true;
      };
      reader.onerror = () => toast("The file could not be read.", "error");
      reader.readAsText(file);
    });

    form.querySelector("[data-legal-preview]")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      clearErrors(form);
      btn.setAttribute("aria-busy", "true");
      try {
        const data = await request(form.dataset.previewUrl, { method: "POST", body: { markdown: textarea.value } });
        form.querySelector("[data-legal-preview-out]").innerHTML = data.html;
        form.querySelector("[data-legal-diff]").innerHTML = data.diff.changed ? data.diff.html : '<p class="form-hint">No changes from the current version.</p>';
        form.querySelector("[data-diff-summary]").textContent = data.diff.changed ? `${data.diff.added} words added, ${data.diff.removed} removed, ${data.sections.length} sections` : "No changes";
        if (data.effectiveInText && !dateInput.value) dateInput.value = data.effectiveInText;
        result.hidden = false;
        result.scrollIntoView({ block: "start", behavior: "smooth" });
      } catch (err) {
        showErrors(form, err.fieldErrors, err.message);
        toast(err.message, "error");
      } finally {
        btn.removeAttribute("aria-busy");
      }
    });
  }
  document.querySelectorAll("[data-legal-form]").forEach(initLegalForm);

  initComponents(document);
  window.MiceAdmin = { request, toast, openPanel, closePanel, confirmAction };
})();
