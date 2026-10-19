"use strict";

const STORAGE_KEY = "eclabsNewTabData";
const VIEW_KEY = "eclabsNewTabView";
const THEME_KEY = "eclabsNewTabTheme";
const SETTINGS_KEY = "eclabsNewTabSettings";
const BACKGROUND_KEY = "eclabsBackground";
const PEXELS_PROXY_URL = "https://launch-api.eclabs.tr";
const SOLID_BACKGROUNDS = [
  { name: "Gece", color: "#080a09" },
  { name: "Orman", color: "#17382b" },
  { name: "Lacivert", color: "#17253d" },
  { name: "Mürdüm", color: "#3a2038" },
  { name: "Toprak", color: "#5a3428" },
  { name: "Taş", color: "#6f716b" },
  { name: "Gün ışığı", color: "#f2f0e7" }
];

const DEFAULT_DATA = {
  version: 1,
  categories: [
    {
      id: "cat-baslangic",
      name: "Başlangıç",
      sites: [
        { id: "site-gmail", name: "Gmail", url: "https://mail.google.com" },
        { id: "site-drive", name: "Google Drive", url: "https://drive.google.com" },
        { id: "site-calendar", name: "Takvim", url: "https://calendar.google.com" }
      ]
    },
    {
      id: "cat-uretim",
      name: "Üretim",
      sites: [
        { id: "site-github", name: "GitHub", url: "https://github.com" },
        { id: "site-figma", name: "Figma", url: "https://figma.com" },
        { id: "site-notion", name: "Notion", url: "https://notion.so" }
      ]
    },
    {
      id: "cat-okuma",
      name: "Okuma",
      sites: [
        { id: "site-medium", name: "Medium", url: "https://medium.com" },
        { id: "site-hn", name: "Hacker News", url: "https://news.ycombinator.com" }
      ]
    }
  ]
};

const state = {
  data: structuredClone(DEFAULT_DATA),
  view: "list",
  theme: "light",
  settings: { searchVisible: true, cardSize: "medium", solidBackground: "" },
  background: null,
  backgroundResults: [],
  query: "",
  editor: null,
  pendingDelete: null,
  drag: null,
  toastTimer: null
};

const els = {
  categories: document.querySelector("#categories"),
  emptyState: document.querySelector("#empty-state"),
  noResults: document.querySelector("#no-results"),
  search: document.querySelector("#search-input"),
  searchBox: document.querySelector("#search-box"),
  viewButton: document.querySelector("#view-button"),
  viewLabel: document.querySelector("#view-label"),
  settingsButton: document.querySelector("#settings-button"),
  backgroundButton: document.querySelector("#background-button"),
  addCategory: document.querySelector("#add-category-button"),
  emptyAdd: document.querySelector("#empty-add-button"),
  importInput: document.querySelector("#import-input"),
  editorDialog: document.querySelector("#editor-dialog"),
  editorForm: document.querySelector("#editor-form"),
  dialogEyebrow: document.querySelector("#dialog-eyebrow"),
  dialogTitle: document.querySelector("#dialog-title"),
  formFields: document.querySelector("#form-fields"),
  formError: document.querySelector("#form-error"),
  dialogSubmit: document.querySelector("#dialog-submit"),
  dialogClose: document.querySelector("#dialog-close"),
  dialogCancel: document.querySelector("#dialog-cancel"),
  confirmDialog: document.querySelector("#confirm-dialog"),
  confirmTitle: document.querySelector("#confirm-title"),
  confirmCopy: document.querySelector("#confirm-copy"),
  confirmCancel: document.querySelector("#confirm-cancel"),
  confirmDelete: document.querySelector("#confirm-delete"),
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  backgroundDialog: document.querySelector("#background-dialog"),
  searchVisible: document.querySelector("#search-visible"),
  settingsBrowserImport: document.querySelector("#settings-browser-import-button"),
  settingsImport: document.querySelector("#settings-import-button"),
  settingsExport: document.querySelector("#settings-export-button"),
  backgroundLayer: document.querySelector("#background-layer"),
  backgroundAttribution: document.querySelector("#background-attribution"),
  photographerLink: document.querySelector("#photographer-link"),
  pexelsLink: document.querySelector("#pexels-link"),
  backgroundQuery: document.querySelector("#background-query"),
  backgroundSearch: document.querySelector("#background-search-button"),
  backgroundSearchStatus: document.querySelector("#background-search-status"),
  backgroundResults: document.querySelector("#background-results"),
  solidBackgrounds: document.querySelector("#solid-backgrounds"),
  customBackgroundColor: document.querySelector("#custom-background-color"),
  removeBackground: document.querySelector("#remove-background-button"),
  browserImportDialog: document.querySelector("#browser-import-dialog"),
  browserImportError: document.querySelector("#browser-import-error"),
  importTopSites: document.querySelector("#import-top-sites"),
  importBookmarks: document.querySelector("#import-bookmarks"),
  toast: document.querySelector("#toast")
};

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeUrl(rawValue) {
  const value = rawValue.trim();
  if (!value) throw new Error("Site adresi gerekli.");
  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) ? value : `https://${value}`;
  const parsed = new URL(candidate);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Yalnızca http veya https adresleri kullanılabilir.");
  return parsed.href;
}

function getFaviconUrl(url) {
  const extensionOrigin = new URL(chrome.runtime.getURL("/")).origin;
  return `${extensionOrigin}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=64`;
}

function sanitizeData(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.categories)) {
    throw new Error("Geçerli bir New Tab JSON dosyası değil.");
  }
  if (input.categories.length > 500) throw new Error("En fazla 500 kategori içe aktarılabilir.");

  const categories = input.categories.map((category) => {
    if (!category || typeof category.name !== "string" || !Array.isArray(category.sites)) {
      throw new Error("Kategori verilerinden biri geçersiz.");
    }
    if (category.sites.length > 5000) throw new Error("Bir kategoride en fazla 5000 site olabilir.");
    const name = category.name.trim().slice(0, 80);
    if (!name) throw new Error("Kategori adı boş olamaz.");
    const sites = category.sites.map((site) => {
      if (!site || typeof site.name !== "string" || typeof site.url !== "string") {
        throw new Error("Site verilerinden biri geçersiz.");
      }
      const siteName = site.name.trim().slice(0, 120);
      if (!siteName) throw new Error("Site adı boş olamaz.");
      return { id: uid("site"), name: siteName, url: normalizeUrl(site.url) };
    });
    return { id: uid("cat"), name, sites };
  });
  return { version: 1, categories };
}

async function loadState() {
  const stored = await chrome.storage.local.get([STORAGE_KEY, VIEW_KEY, THEME_KEY, SETTINGS_KEY, BACKGROUND_KEY]);
  if (stored[STORAGE_KEY]) {
    try {
      state.data = sanitizeStoredData(stored[STORAGE_KEY]);
    } catch {
      state.data = structuredClone(DEFAULT_DATA);
      showToast("Kayıtlı veri okunamadı; örnek düzen açıldı.");
    }
  }
  state.view = stored[VIEW_KEY] === "icon" ? "icon" : "list";
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  state.theme = ["light", "dark"].includes(stored[THEME_KEY]) ? stored[THEME_KEY] : (systemDark ? "dark" : "light");
  const savedSettings = stored[SETTINGS_KEY] || {};
  state.settings.searchVisible = savedSettings.searchVisible !== false;
  state.settings.cardSize = ["small", "medium", "large"].includes(savedSettings.cardSize) ? savedSettings.cardSize : "medium";
  state.settings.solidBackground = normalizeHexColor(savedSettings.solidBackground);
  state.background = sanitizeBackground(stored[BACKGROUND_KEY]);
  applyPreferences();
  applyBackground();
  render();
}

function httpsUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function sanitizeBackground(value) {
  if (!value || typeof value !== "object") return null;
  const background = {
    imageUrl: httpsUrl(value.imageUrl),
    photographerName: String(value.photographerName || "").trim().slice(0, 120),
    photographerUrl: httpsUrl(value.photographerUrl),
    pexelsPhotoUrl: httpsUrl(value.pexelsPhotoUrl)
  };
  return Object.values(background).every(Boolean) ? background : null;
}

function normalizeHexColor(value) {
  const color = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : "";
}

function backgroundTone(color) {
  const value = Number.parseInt(color.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.62 ? "light" : "dark";
}

function clearBackgroundDisplay() {
  els.backgroundLayer.style.backgroundImage = "";
  els.backgroundLayer.style.backgroundColor = "";
  els.backgroundAttribution.hidden = true;
  document.documentElement.dataset.hasBackground = "false";
  delete document.documentElement.dataset.backgroundKind;
  delete document.documentElement.dataset.backgroundTone;
}

function applyBackground() {
  clearBackgroundDisplay();
  if (state.settings.solidBackground) {
    els.backgroundLayer.style.backgroundColor = state.settings.solidBackground;
    els.backgroundLayer.style.backgroundImage = "none";
    document.documentElement.dataset.hasBackground = "true";
    document.documentElement.dataset.backgroundKind = "solid";
    document.documentElement.dataset.backgroundTone = backgroundTone(state.settings.solidBackground);
    return;
  }
  if (!state.background) return;
  const selected = state.background;
  const image = new Image();
  image.onload = () => {
    if (state.background?.imageUrl !== selected.imageUrl) return;
    els.backgroundLayer.style.backgroundImage = `url("${selected.imageUrl.replaceAll('"', "%22")}")`;
    els.photographerLink.textContent = selected.photographerName;
    els.photographerLink.href = selected.photographerUrl;
    els.pexelsLink.href = selected.pexelsPhotoUrl;
    els.backgroundAttribution.hidden = false;
    document.documentElement.dataset.hasBackground = "true";
    document.documentElement.dataset.backgroundKind = "image";
    document.documentElement.dataset.backgroundTone = "dark";
  };
  image.onerror = clearBackgroundDisplay;
  image.src = selected.imageUrl;
}

function sanitizeStoredData(input) {
  if (!input || !Array.isArray(input.categories)) throw new Error("invalid data");
  return {
    version: 1,
    categories: input.categories.map((category) => ({
      id: String(category.id || uid("cat")),
      name: String(category.name || "İsimsiz kategori").slice(0, 80),
      sites: Array.isArray(category.sites) ? category.sites.map((site) => ({
        id: String(site.id || uid("site")),
        name: String(site.name || "İsimsiz site").slice(0, 120),
        url: normalizeUrl(String(site.url || ""))
      })) : []
    }))
  };
}

function persistData() {
  return chrome.storage.local.set({ [STORAGE_KEY]: state.data });
}

function applyPreferences() {
  document.documentElement.dataset.view = state.view;
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.cardSize = state.settings.cardSize;
  document.documentElement.dataset.searchVisible = String(state.settings.searchVisible);
  els.searchBox.setAttribute("aria-hidden", String(!state.settings.searchVisible));
  els.viewLabel.textContent = state.view === "list" ? "Liste" : "İkon";
  const target = state.view === "list" ? "İkon" : "Liste";
  els.viewButton.setAttribute("aria-label", `${target} görünümüne geç`);
}

function filteredCategories() {
  const query = state.query.trim().toLocaleLowerCase("tr-TR");
  if (!query) return state.data.categories;
  return state.data.categories
    .map((category) => ({
      ...category,
      sites: category.sites.filter((site) => `${site.name} ${site.url}`.toLocaleLowerCase("tr-TR").includes(query))
    }))
    .filter((category) => category.name.toLocaleLowerCase("tr-TR").includes(query) || category.sites.length > 0);
}

function render() {
  const categories = filteredCategories();
  const hasData = state.data.categories.length > 0;
  const isSearching = Boolean(state.query.trim());
  els.emptyState.hidden = hasData || isSearching;
  els.noResults.hidden = !isSearching || categories.length > 0;
  els.categories.hidden = categories.length === 0;
  els.categories.innerHTML = categories.map(categoryTemplate).join("");
  bindRenderedEvents();
}

function categoryTemplate(category) {
  const visibleCount = category.sites.length;
  return `
    <section class="category" data-category-id="${escapeHtml(category.id)}" draggable="${state.query ? "false" : "true"}">
      <header class="category-header">
        <button class="mini-button drag-handle category-drag" type="button" aria-label="${escapeHtml(category.name)} kategorisini sürükle" title="Kategoriyi sürükle">
          ${icon("grip")}
        </button>
        <h2 class="category-title">${escapeHtml(category.name)}</h2>
        <span class="category-count">${visibleCount}</span>
        <div class="category-actions">
          <button class="mini-button add-site" type="button" aria-label="${escapeHtml(category.name)} kategorisine site ekle" title="Site ekle">${icon("plus")}</button>
          <button class="mini-button edit-category" type="button" aria-label="${escapeHtml(category.name)} kategorisini yeniden adlandır" title="Yeniden adlandır">${icon("edit")}</button>
          <button class="mini-button delete-category" type="button" aria-label="${escapeHtml(category.name)} kategorisini sil" title="Kategoriyi sil">${icon("trash")}</button>
        </div>
      </header>
      <ul class="site-list" data-category-id="${escapeHtml(category.id)}">
        ${category.sites.map((site) => siteTemplate(site, category.id)).join("")}
        <li class="icon-add-site">
          <button class="icon-add-site-button add-site" type="button" aria-label="${escapeHtml(category.name)} kategorisine site ekle">
            <span class="add-tile-mark" aria-hidden="true">${icon("plus")}</span>
            <span>Site ekle</span>
          </button>
        </li>
      </ul>
      <div class="add-site-row">
        <button class="add-site-button add-site" type="button">${icon("plus")} Site ekle</button>
      </div>
    </section>`;
}

function siteTemplate(site, categoryId) {
  const first = [...site.name.trim()][0]?.toLocaleUpperCase("tr-TR") || "•";
  return `
    <li class="site-item" data-site-id="${escapeHtml(site.id)}" data-category-id="${escapeHtml(categoryId)}" draggable="${state.query ? "false" : "true"}">
      <a class="site-link" href="${escapeHtml(site.url)}" draggable="false">
        <span class="favicon-tile" aria-hidden="true">
          <img class="favicon" src="${escapeHtml(getFaviconUrl(site.url))}" alt="" draggable="false">
          <span class="favicon-fallback">${escapeHtml(first)}</span>
        </span>
        <span class="site-name">${escapeHtml(site.name)}</span>
      </a>
      <button class="mini-button icon-site-menu" type="button" aria-label="${escapeHtml(site.name)} seçeneklerini aç" aria-expanded="false" title="Site seçenekleri">${icon("more")}</button>
      <div class="site-actions">
        <button class="mini-button drag-handle site-drag" type="button" aria-label="${escapeHtml(site.name)} sitesini sürükle" title="Siteyi sürükle">${icon("grip")}</button>
        <button class="mini-button edit-site" type="button" aria-label="${escapeHtml(site.name)} sitesini düzenle" title="Düzenle">${icon("edit")}</button>
        <button class="mini-button delete-site" type="button" aria-label="${escapeHtml(site.name)} sitesini sil" title="Sil">${icon("trash")}</button>
      </div>
    </li>`;
}

function icon(name) {
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20ZM14.5 7.1l2.8 2.8"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>',
    grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
    more: '<path d="M6 12h.01M12 12h.01M18 12h.01"/>'
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[name]}</svg>`;
}

function bindRenderedEvents() {
  document.querySelectorAll(".icon-site-menu").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const item = button.closest(".site-item");
    const willOpen = !item.classList.contains("actions-open");
    document.querySelectorAll(".site-item.actions-open").forEach((openItem) => {
      openItem.classList.remove("actions-open");
      openItem.querySelector(".icon-site-menu")?.setAttribute("aria-expanded", "false");
    });
    item.classList.toggle("actions-open", willOpen);
    button.setAttribute("aria-expanded", String(willOpen));
  }));
  document.querySelectorAll(".add-site").forEach((button) => button.addEventListener("click", () => {
    const categoryId = button.closest(".category").dataset.categoryId;
    openSiteEditor(categoryId);
  }));
  document.querySelectorAll(".edit-category").forEach((button) => button.addEventListener("click", () => {
    openCategoryEditor(button.closest(".category").dataset.categoryId);
  }));
  document.querySelectorAll(".delete-category").forEach((button) => button.addEventListener("click", () => {
    requestCategoryDelete(button.closest(".category").dataset.categoryId);
  }));
  document.querySelectorAll(".edit-site").forEach((button) => button.addEventListener("click", () => {
    const item = button.closest(".site-item");
    item.classList.remove("actions-open");
    openSiteEditor(item.dataset.categoryId, item.dataset.siteId);
  }));
  document.querySelectorAll(".delete-site").forEach((button) => button.addEventListener("click", () => {
    const item = button.closest(".site-item");
    item.classList.remove("actions-open");
    requestSiteDelete(item.dataset.categoryId, item.dataset.siteId);
  }));
  document.querySelectorAll(".favicon").forEach((image) => {
    const tile = image.closest(".favicon-tile");
    const updateIconState = () => tile.classList.toggle("has-favicon", image.naturalWidth > 0);
    image.addEventListener("error", updateIconState);
    image.addEventListener("load", updateIconState);
    if (image.complete) updateIconState();
  });
  bindDragAndDrop();
}

function openCategoryEditor(categoryId = null) {
  const category = categoryId ? state.data.categories.find((item) => item.id === categoryId) : null;
  state.editor = { type: "category", categoryId };
  els.dialogEyebrow.textContent = category ? "Kategori" : "Yeni düzen";
  els.dialogTitle.textContent = category ? "Kategoriyi yeniden adlandır" : "Yeni kategori";
  els.formFields.innerHTML = fieldTemplate("name", "Kategori adı", category?.name || "", "Örn. Tasarım", 80);
  openEditor();
}

function openSiteEditor(categoryId, siteId = null) {
  const category = state.data.categories.find((item) => item.id === categoryId);
  const site = siteId ? category?.sites.find((item) => item.id === siteId) : null;
  state.editor = { type: "site", categoryId, siteId };
  els.dialogEyebrow.textContent = category?.name || "Site";
  els.dialogTitle.textContent = site ? "Siteyi düzenle" : "Yeni site";
  els.formFields.innerHTML = [
    fieldTemplate("name", "Site adı", site?.name || "", "Örn. Figma", 120),
    fieldTemplate("url", "Site adresi", site?.url || "", "https://example.com", 2048, "url")
  ].join("");
  openEditor();
}

function fieldTemplate(name, label, value, placeholder, maxlength, inputMode = "text") {
  return `<label class="field"><span>${escapeHtml(label)}</span><input name="${name}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" maxlength="${maxlength}" inputmode="${inputMode}" required></label>`;
}

function openEditor() {
  els.formError.textContent = "";
  els.editorDialog.showModal();
  requestAnimationFrame(() => els.formFields.querySelector("input")?.focus());
}

function closeEditor() {
  els.editorDialog.close();
  state.editor = null;
}

async function submitEditor(event) {
  event.preventDefault();
  if (!state.editor) return;
  const form = new FormData(els.editorForm);
  const name = String(form.get("name") || "").trim();
  if (!name) {
    els.formError.textContent = "Ad alanı boş olamaz.";
    return;
  }
  try {
    if (state.editor.type === "category") {
      if (state.editor.categoryId) {
        state.data.categories.find((item) => item.id === state.editor.categoryId).name = name.slice(0, 80);
      } else {
        state.data.categories.push({ id: uid("cat"), name: name.slice(0, 80), sites: [] });
      }
    } else {
      const category = state.data.categories.find((item) => item.id === state.editor.categoryId);
      const url = normalizeUrl(String(form.get("url") || ""));
      if (state.editor.siteId) {
        const site = category.sites.find((item) => item.id === state.editor.siteId);
        Object.assign(site, { name: name.slice(0, 120), url });
      } else {
        category.sites.push({ id: uid("site"), name: name.slice(0, 120), url });
      }
    }
    await persistData();
    closeEditor();
    render();
    showToast("Değişiklik kaydedildi.");
  } catch (error) {
    els.formError.textContent = error.message;
  }
}

function requestCategoryDelete(categoryId) {
  const category = state.data.categories.find((item) => item.id === categoryId);
  state.pendingDelete = { type: "category", categoryId };
  els.confirmTitle.textContent = `“${category.name}” silinsin mi?`;
  els.confirmCopy.textContent = category.sites.length ? `Bu kategorideki ${category.sites.length} site de silinecek. Bu işlem geri alınamaz.` : "Bu işlem geri alınamaz.";
  els.confirmDialog.showModal();
}

function requestSiteDelete(categoryId, siteId) {
  const category = state.data.categories.find((item) => item.id === categoryId);
  const site = category.sites.find((item) => item.id === siteId);
  state.pendingDelete = { type: "site", categoryId, siteId };
  els.confirmTitle.textContent = `“${site.name}” silinsin mi?`;
  els.confirmCopy.textContent = "Bağlantı bu kategoriden kaldırılacak.";
  els.confirmDialog.showModal();
}

async function confirmDelete() {
  if (!state.pendingDelete) return;
  const pending = state.pendingDelete;
  if (pending.type === "category") {
    state.data.categories = state.data.categories.filter((item) => item.id !== pending.categoryId);
  } else {
    const category = state.data.categories.find((item) => item.id === pending.categoryId);
    category.sites = category.sites.filter((item) => item.id !== pending.siteId);
  }
  state.pendingDelete = null;
  await persistData();
  render();
  showToast("Silindi.");
}

function bindDragAndDrop() {
  document.querySelectorAll(".category").forEach((category) => {
    category.addEventListener("dragstart", (event) => {
      if (state.query || event.target.closest(".site-item")) return;
      if (!event.target.closest(".category")) return;
      state.drag = { type: "category", id: category.dataset.categoryId };
      category.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
    });
    category.addEventListener("dragover", (event) => {
      if (state.drag?.type !== "category" || state.drag.id === category.dataset.categoryId) return;
      event.preventDefault();
      category.classList.add("drop-before");
    });
    category.addEventListener("dragleave", () => category.classList.remove("drop-before"));
    category.addEventListener("drop", async (event) => {
      if (state.drag?.type !== "category") return;
      event.preventDefault();
      moveCategory(state.drag.id, category.dataset.categoryId);
      await persistData();
      resetDrag();
      render();
    });
    category.addEventListener("dragend", resetDrag);
  });

  document.querySelectorAll(".site-item").forEach((item) => {
    item.addEventListener("dragstart", (event) => {
      if (state.query) return;
      event.stopPropagation();
      state.drag = { type: "site", id: item.dataset.siteId, categoryId: item.dataset.categoryId };
      item.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.dataset.siteId);
    });
    item.addEventListener("dragover", (event) => {
      if (state.drag?.type !== "site" || state.drag.id === item.dataset.siteId) return;
      event.preventDefault();
      event.stopPropagation();
      item.classList.add("drop-target");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drop-target"));
    item.addEventListener("drop", async (event) => {
      if (state.drag?.type !== "site") return;
      event.preventDefault();
      event.stopPropagation();
      swapSites(state.drag.categoryId, state.drag.id, item.dataset.categoryId, item.dataset.siteId);
      await persistData();
      resetDrag();
      render();
    });
    item.addEventListener("dragend", resetDrag);
  });

  document.querySelectorAll(".site-list").forEach((list) => {
    list.addEventListener("dragover", (event) => {
      if (state.drag?.type === "site" && !event.target.closest(".site-item")) event.preventDefault();
    });
    list.addEventListener("drop", async (event) => {
      if (state.drag?.type !== "site" || event.target.closest(".site-item")) return;
      event.preventDefault();
      moveSite(state.drag.categoryId, state.drag.id, list.dataset.categoryId, null);
      await persistData();
      resetDrag();
      render();
    });
  });
}

function moveCategory(sourceId, targetId) {
  const sourceIndex = state.data.categories.findIndex((item) => item.id === sourceId);
  const targetIndex = state.data.categories.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [category] = state.data.categories.splice(sourceIndex, 1);
  const adjustedTarget = state.data.categories.findIndex((item) => item.id === targetId);
  state.data.categories.splice(adjustedTarget, 0, category);
}

function moveSite(sourceCategoryId, siteId, targetCategoryId, targetSiteId) {
  const sourceCategory = state.data.categories.find((item) => item.id === sourceCategoryId);
  const targetCategory = state.data.categories.find((item) => item.id === targetCategoryId);
  const sourceIndex = sourceCategory?.sites.findIndex((item) => item.id === siteId) ?? -1;
  if (sourceIndex < 0 || !targetCategory) return;
  const [site] = sourceCategory.sites.splice(sourceIndex, 1);
  const targetIndex = targetSiteId ? targetCategory.sites.findIndex((item) => item.id === targetSiteId) : targetCategory.sites.length;
  targetCategory.sites.splice(targetIndex < 0 ? targetCategory.sites.length : targetIndex, 0, site);
}

function swapSites(sourceCategoryId, siteId, targetCategoryId, targetSiteId) {
  const sourceCategory = state.data.categories.find((item) => item.id === sourceCategoryId);
  const targetCategory = state.data.categories.find((item) => item.id === targetCategoryId);
  const sourceIndex = sourceCategory?.sites.findIndex((item) => item.id === siteId) ?? -1;
  const targetIndex = targetCategory?.sites.findIndex((item) => item.id === targetSiteId) ?? -1;
  if (sourceIndex < 0 || targetIndex < 0 || !sourceCategory || !targetCategory) return;

  if (sourceCategory === targetCategory) {
    [sourceCategory.sites[sourceIndex], sourceCategory.sites[targetIndex]] = [
      sourceCategory.sites[targetIndex],
      sourceCategory.sites[sourceIndex]
    ];
    return;
  }

  const sourceSite = sourceCategory.sites[sourceIndex];
  sourceCategory.sites[sourceIndex] = targetCategory.sites[targetIndex];
  targetCategory.sites[targetIndex] = sourceSite;
}

function resetDrag() {
  state.drag = null;
  document.querySelectorAll(".dragging, .drop-before, .drop-target").forEach((item) => item.classList.remove("dragging", "drop-before", "drop-target"));
}

async function toggleView() {
  state.view = state.view === "list" ? "icon" : "list";
  applyPreferences();
  await chrome.storage.local.set({ [VIEW_KEY]: state.view });
}

function openSettings() {
  els.searchVisible.checked = state.settings.searchVisible;
  const selectedSize = els.settingsForm.querySelector(`input[name="cardSize"][value="${state.settings.cardSize}"]`);
  if (selectedSize) selectedSize.checked = true;
  els.settingsDialog.showModal();
}

async function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(els.settingsForm);
  state.settings = {
    searchVisible: els.searchVisible.checked,
    cardSize: ["small", "medium", "large"].includes(form.get("cardSize")) ? form.get("cardSize") : "medium",
    solidBackground: state.settings.solidBackground
  };
  if (!state.settings.searchVisible) {
    state.query = "";
    els.search.value = "";
  }
  await chrome.storage.local.set({ [SETTINGS_KEY]: state.settings });
  applyPreferences();
  render();
  els.settingsDialog.close();
  showToast("Görünüm ayarları kaydedildi.");
}

function openBackgroundSettings() {
  els.backgroundSearchStatus.textContent = "";
  renderSolidBackgrounds();
  renderBackgroundResults();
  els.backgroundDialog.showModal();
}

function hostPermissionPattern(proxyUrl) {
  const url = new URL(proxyUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

function requestHostPermission(proxyUrl) {
  return new Promise((resolve, reject) => {
    chrome.permissions.request({ origins: [hostPermissionPattern(proxyUrl)] }, (granted) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(granted);
    });
  });
}

function normalizePexelsPhoto(photo) {
  if (!photo || typeof photo !== "object") return null;
  const normalized = {
    imageUrl: httpsUrl(photo.imageUrl),
    thumbnailUrl: httpsUrl(photo.thumbnailUrl),
    photographerName: String(photo.photographerName || "").trim().slice(0, 120),
    photographerUrl: httpsUrl(photo.photographerUrl),
    pexelsPhotoUrl: httpsUrl(photo.pexelsPhotoUrl),
    alt: String(photo.alt || "Pexels arka plan görseli").trim().slice(0, 180)
  };
  return normalized.imageUrl && normalized.thumbnailUrl && normalized.photographerName && normalized.photographerUrl && normalized.pexelsPhotoUrl
    ? normalized
    : null;
}

function renderBackgroundResults() {
  els.backgroundResults.innerHTML = state.backgroundResults.map((photo, index) => {
    const selected = state.background?.imageUrl === photo.imageUrl;
    return `<button class="background-result${selected ? " selected" : ""}" type="button" role="option" aria-selected="${selected}" data-background-index="${index}">
      <img src="${escapeHtml(photo.thumbnailUrl)}" alt="${escapeHtml(photo.alt)}" loading="lazy">
      <span>${escapeHtml(photo.photographerName)}</span>
    </button>`;
  }).join("");
}

function renderSolidBackgrounds() {
  els.solidBackgrounds.innerHTML = SOLID_BACKGROUNDS.map(({ name, color }) => {
    const selected = state.settings.solidBackground === color;
    return `<button class="solid-swatch${selected ? " selected" : ""}" type="button" role="option" aria-selected="${selected}" aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}" data-solid-color="${color}" style="--swatch: ${color}"></button>`;
  }).join("");
  const preset = SOLID_BACKGROUNDS.some(({ color }) => color === state.settings.solidBackground);
  if (state.settings.solidBackground) els.customBackgroundColor.value = state.settings.solidBackground;
  els.customBackgroundColor.closest(".custom-color")?.classList.toggle("selected", Boolean(state.settings.solidBackground && !preset));
}

async function selectSolidBackground(rawColor) {
  const color = normalizeHexColor(rawColor);
  if (!color) return;
  state.settings.solidBackground = color;
  state.background = null;
  await Promise.all([
    chrome.storage.local.set({ [SETTINGS_KEY]: state.settings }),
    chrome.storage.local.remove(BACKGROUND_KEY)
  ]);
  applyBackground();
  renderSolidBackgrounds();
  renderBackgroundResults();
  showToast("Düz arka plan seçildi.");
}

async function searchBackgrounds() {
  const proxyUrl = PEXELS_PROXY_URL;
  const query = els.backgroundQuery.value.trim();
  if (query.length < 2) {
    els.backgroundSearchStatus.textContent = "En az 2 karakterle arama yapın.";
    els.backgroundQuery.focus();
    return;
  }

  els.backgroundSearch.disabled = true;
  els.backgroundSearchStatus.textContent = "Görseller aranıyor…";
  try {
    const granted = await requestHostPermission(proxyUrl);
    if (!granted) throw new Error("Worker bağlantı izni verilmedi.");
    const endpoint = new URL(proxyUrl);
    if (!endpoint.pathname.endsWith("/api/pexels/search")) endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/api/pexels/search`;
    endpoint.searchParams.set("query", query);
    endpoint.searchParams.set("per_page", "18");
    endpoint.searchParams.set("client", chrome.runtime.id);
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 429) throw new Error("Arama limiti doldu. Bir süre sonra tekrar deneyin.");
    if (!response.ok) throw new Error(payload.error || "Pexels araması tamamlanamadı.");
    state.backgroundResults = Array.isArray(payload.photos) ? payload.photos.map(normalizePexelsPhoto).filter(Boolean) : [];
    renderBackgroundResults();
    els.backgroundSearchStatus.textContent = state.backgroundResults.length
      ? `${state.backgroundResults.length} yatay görsel bulundu.`
      : "Bu arama için görsel bulunamadı.";
  } catch (error) {
    state.backgroundResults = [];
    renderBackgroundResults();
    els.backgroundSearchStatus.textContent = navigator.onLine === false
      ? "İnternet bağlantısı yok. Mevcut arka plan korunuyor."
      : error.message;
  } finally {
    els.backgroundSearch.disabled = false;
  }
}

async function selectBackground(index) {
  const photo = state.backgroundResults[index];
  if (!photo) return;
  state.background = {
    imageUrl: photo.imageUrl,
    photographerName: photo.photographerName,
    photographerUrl: photo.photographerUrl,
    pexelsPhotoUrl: photo.pexelsPhotoUrl
  };
  state.settings.solidBackground = "";
  await chrome.storage.local.set({ [BACKGROUND_KEY]: state.background, [SETTINGS_KEY]: state.settings });
  applyBackground();
  renderBackgroundResults();
  showToast("Arka plan seçildi.");
}

async function removeBackground() {
  state.background = null;
  state.settings.solidBackground = "";
  await Promise.all([
    chrome.storage.local.remove(BACKGROUND_KEY),
    chrome.storage.local.set({ [SETTINGS_KEY]: state.settings })
  ]);
  clearBackgroundDisplay();
  renderSolidBackgrounds();
  renderBackgroundResults();
  showToast("Varsayılan arka plana dönüldü.");
}

function openBrowserImport() {
  els.browserImportError.textContent = "";
  els.browserImportDialog.showModal();
}

function requestOptionalPermission(permission) {
  return new Promise((resolve, reject) => {
    chrome.permissions.request({ permissions: [permission] }, (granted) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(granted);
    });
  });
}

function getTopSites() {
  return new Promise((resolve, reject) => {
    chrome.topSites.get((sites) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(sites || []);
    });
  });
}

function getBookmarkTree() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((tree) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(tree || []);
    });
  });
}

function browserSite(name, url) {
  try {
    const normalizedUrl = normalizeUrl(url);
    return {
      id: uid("site"),
      name: String(name || new URL(normalizedUrl).hostname).trim().slice(0, 120),
      url: normalizedUrl
    };
  } catch {
    return null;
  }
}

function bookmarkCategories(tree) {
  const categories = [];
  function visit(node, path = []) {
    const nextPath = node.title ? [...path, node.title] : path;
    const directSites = (node.children || [])
      .filter((child) => child.url)
      .map((child) => browserSite(child.title, child.url))
      .filter(Boolean);
    if (directSites.length) {
      categories.push({
        id: uid("cat"),
        name: (nextPath.filter(Boolean).join(" › ") || "Brave Yer İmleri").slice(0, 80),
        sites: directSites
      });
    }
    (node.children || []).filter((child) => !child.url).forEach((child) => visit(child, nextPath));
  }
  tree.forEach((node) => visit(node));
  return categories;
}

async function appendBrowserCategories(categories) {
  const knownUrls = new Set(state.data.categories.flatMap((category) => category.sites.map((site) => {
    try { return normalizeUrl(site.url); } catch { return site.url; }
  })));
  let importedCount = 0;
  categories.forEach((category) => {
    const sites = category.sites.filter((site) => {
      if (knownUrls.has(site.url)) return false;
      knownUrls.add(site.url);
      importedCount += 1;
      return true;
    });
    if (sites.length) state.data.categories.push({ ...category, sites });
  });
  if (importedCount) await persistData();
  render();
  return importedCount;
}

async function importFromBrowser(source) {
  const button = source === "topSites" ? els.importTopSites : els.importBookmarks;
  const permission = source === "topSites" ? "topSites" : "bookmarks";
  els.browserImportError.textContent = "";
  button.disabled = true;
  try {
    const granted = await requestOptionalPermission(permission);
    if (!granted) throw new Error("İzin verilmedi.");
    let categories;
    if (source === "topSites") {
      const sites = (await getTopSites()).map((site) => browserSite(site.title, site.url)).filter(Boolean);
      categories = [{ id: uid("cat"), name: "Brave • Sık Ziyaret Edilenler", sites }];
    } else {
      categories = bookmarkCategories(await getBookmarkTree());
    }
    const count = await appendBrowserCategories(categories);
    els.browserImportDialog.close();
    showToast(count ? `${count} site Brave’den alındı.` : "Eklenecek yeni site bulunamadı.");
  } catch (error) {
    els.browserImportError.textContent = `Aktarım tamamlanamadı: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function exportData() {
  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), categories: state.data.categories }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `eclabs-new-tab-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("JSON dışa aktarıldı.");
}

function parseBraveHtml(html) {
  const documentFromFile = new DOMParser().parseFromString(html, "text/html");
  let anchors = [...documentFromFile.querySelectorAll("a.top-site-tile[href]")];
  if (!anchors.length) anchors = [...documentFromFile.querySelectorAll("a[href]")];

  const sites = anchors.map((anchor) => {
    const title = anchor.querySelector(".top-site-title")?.textContent || anchor.textContent;
    return browserSite(title, anchor.getAttribute("href"));
  }).filter(Boolean);

  if (!sites.length) throw new Error("HTML dosyasında aktarılabilir site bulunamadı.");
  return {
    id: uid("cat"),
    name: "Brave • HTML Aktarımı",
    sites
  };
}

async function importData(file) {
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("Dosya 5 MB sınırını aşıyor.");
    const content = await file.text();
    const isHtml = /\.html?$/i.test(file.name || "") || /^\s*<!doctype html|^\s*<html/i.test(content);
    state.query = "";
    els.search.value = "";

    if (isHtml) {
      const count = await appendBrowserCategories([parseBraveHtml(content)]);
      showToast(count ? `${count} site HTML dosyasından alındı.` : "Eklenecek yeni site bulunamadı.");
    } else {
      const parsed = JSON.parse(content);
      state.data = sanitizeData(parsed);
      await persistData();
      render();
      showToast(`${state.data.categories.length} kategori içe aktarıldı.`);
    }
  } catch (error) {
    showToast(`İçe aktarılamadı: ${error.message}`);
  } finally {
    els.importInput.value = "";
  }
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  state.toastTimer = setTimeout(() => els.toast.classList.remove("visible"), 2600);
}

function bindGlobalEvents() {
  els.addCategory.addEventListener("click", () => openCategoryEditor());
  els.emptyAdd.addEventListener("click", () => openCategoryEditor());
  els.viewButton.addEventListener("click", toggleView);
  els.settingsButton.addEventListener("click", openSettings);
  els.backgroundButton.addEventListener("click", openBackgroundSettings);
  els.settingsForm.addEventListener("submit", saveSettings);
  els.settingsDialog.querySelector(".settings-cancel").addEventListener("click", () => els.settingsDialog.close());
  els.settingsDialog.querySelector(".dialog-x").addEventListener("click", () => els.settingsDialog.close());
  els.backgroundDialog.querySelector(".dialog-x").addEventListener("click", () => els.backgroundDialog.close());
  els.browserImportDialog.querySelector(".dialog-x").addEventListener("click", () => els.browserImportDialog.close());
  els.importTopSites.addEventListener("click", () => importFromBrowser("topSites"));
  els.importBookmarks.addEventListener("click", () => importFromBrowser("bookmarks"));
  els.settingsBrowserImport.addEventListener("click", () => {
    els.settingsDialog.close();
    openBrowserImport();
  });
  els.settingsImport.addEventListener("click", () => {
    els.settingsDialog.close();
    els.importInput.click();
  });
  els.settingsExport.addEventListener("click", exportData);
  els.backgroundSearch.addEventListener("click", searchBackgrounds);
  els.backgroundQuery.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchBackgrounds();
    }
  });
  els.backgroundResults.addEventListener("click", (event) => {
    const result = event.target.closest("[data-background-index]");
    if (result) selectBackground(Number(result.dataset.backgroundIndex));
  });
  els.solidBackgrounds.addEventListener("click", (event) => {
    const swatch = event.target.closest("[data-solid-color]");
    if (swatch) selectSolidBackground(swatch.dataset.solidColor);
  });
  els.customBackgroundColor.addEventListener("change", () => selectSolidBackground(els.customBackgroundColor.value));
  els.removeBackground.addEventListener("click", removeBackground);
  els.importInput.addEventListener("change", () => importData(els.importInput.files[0]));
  els.search.addEventListener("input", () => { state.query = els.search.value; render(); });
  els.editorForm.addEventListener("submit", submitEditor);
  els.dialogClose.addEventListener("click", closeEditor);
  els.dialogCancel.addEventListener("click", closeEditor);
  els.confirmDialog.addEventListener("close", () => {
    if (els.confirmDialog.returnValue === "confirm") confirmDelete();
    else state.pendingDelete = null;
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest(".site-item.actions-open")) return;
    document.querySelectorAll(".site-item.actions-open").forEach((item) => {
      item.classList.remove("actions-open");
      item.querySelector(".icon-site-menu")?.setAttribute("aria-expanded", "false");
    });
  });
  document.addEventListener("keydown", (event) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    const dialogOpen = document.querySelector("dialog[open]");
    if (event.key === "/" && state.settings.searchVisible && !typing && !dialogOpen) {
      event.preventDefault();
      els.search.focus();
    }
    if (event.key.toLocaleLowerCase("tr-TR") === "v" && !typing && !dialogOpen) toggleView();
    if (event.key === "Escape" && document.activeElement === els.search && els.search.value) {
      els.search.value = "";
      state.query = "";
      render();
    }
  });
}

bindGlobalEvents();
loadState();
