const API_URL = "/.netlify/functions/crawl-news";
const CACHE_KEY = "data-dispatch-items-v3";

const statusEl = document.getElementById("status");
const engineeringItemsEl = document.getElementById("engineeringItems");
const leadershipItemsEl = document.getElementById("leadershipItems");
const engineeringCountEl = document.getElementById("engineeringCount");
const leadershipCountEl = document.getElementById("leadershipCount");
const refreshBtn = document.getElementById("refreshBtn");
const categoryFilter = document.getElementById("categoryFilter");
const sourceFilter = document.getElementById("sourceFilter");
const searchInput = document.getElementById("searchInput");
const engineeringSection = document.getElementById("engineeringSection");
const leadershipSection = document.getElementById("leadershipSection");

let currentData = { engineering: [], leadership: [] };
let lastGeneratedAt = null;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchNews() {
  const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function formatDate(value) {
  if (!value) return "Unknown date";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getBuckets(data) {
  if (Array.isArray(data.engineering) || Array.isArray(data.leadership)) {
    return {
      engineering: data.engineering || [],
      leadership: data.leadership || []
    };
  }

  const items = data.items || [];
  return {
    engineering: items.filter(item => item.category !== "leadership"),
    leadership: items.filter(item => item.category === "leadership")
  };
}

function updateSourceFilter() {
  const selected = sourceFilter.value;
  const sources = [...new Set([
    ...currentData.engineering,
    ...currentData.leadership
  ].map(item => item.source).filter(Boolean))].sort();

  sourceFilter.innerHTML = `<option value="all">All sources</option>` +
    sources.map(source => `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`).join("");

  if (sources.includes(selected)) sourceFilter.value = selected;
}

function itemMatches(item, category) {
  const selectedCategory = categoryFilter.value;
  const selectedSource = sourceFilter.value;
  const query = searchInput.value.trim().toLowerCase();

  if (selectedCategory !== "all" && selectedCategory !== category) return false;
  if (selectedSource !== "all" && item.source !== selectedSource) return false;

  if (query) {
    const text = `${item.title || ""} ${item.summary || ""} ${item.source || ""} ${item.sourceType || ""}`.toLowerCase();
    if (!text.includes(query)) return false;
  }

  return true;
}

function renderCard(item, index) {
  const title = escapeHtml(item.title || "Untitled");
  const source = escapeHtml(item.source || "Unknown source");
  const sourceType = escapeHtml(item.sourceType || "Source");
  const summary = escapeHtml(item.summary || "");
  const published = formatDate(item.publishedAt);
  const url = escapeHtml(item.url || "#");

  return `
    <article class="article-card">
      <div class="rank-box">${index + 1}</div>
      <div class="article-main">
        <h3><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
        <p class="meta-row">
          <span class="source-chip">${source}</span>
          <span class="type-chip">${sourceType}</span>
          <span>${published}</span>
        </p>
        ${summary ? `<p class="summary">${summary}</p>` : ""}
      </div>
    </article>
  `;
}

function renderList(element, items, category) {
  const filtered = items.filter(item => itemMatches(item, category));

  if (!filtered.length) {
    element.innerHTML = `<div class="empty">No matching ${category === "leadership" ? "Data Leadership" : "Data Engineering"} reads found.</div>`;
  } else {
    element.innerHTML = filtered.map((item, index) => renderCard(item, index)).join("");
  }

  return filtered.length;
}

function applyVisibility() {
  const showEngineering = categoryFilter.value === "all" || categoryFilter.value === "engineering";
  const showLeadership = categoryFilter.value === "all" || categoryFilter.value === "leadership";

  engineeringSection.classList.toggle("hidden", !showEngineering);
  leadershipSection.classList.toggle("hidden", !showLeadership);
}

function render(data) {
  const buckets = getBuckets(data);
  currentData = buckets;
  if (data.generatedAt) lastGeneratedAt = data.generatedAt;

  updateSourceFilter();

  const generated = lastGeneratedAt ? new Date(lastGeneratedAt).toLocaleString() : "unknown";
  statusEl.textContent = `Updated ${generated}`;

  const engineeringCount = renderList(engineeringItemsEl, buckets.engineering, "engineering");
  const leadershipCount = renderList(leadershipItemsEl, buckets.leadership, "leadership");

  engineeringCountEl.textContent = `${engineeringCount} reads`;
  leadershipCountEl.textContent = `${leadershipCount} reads`;
  applyVisibility();
}

async function loadNews() {
  refreshBtn.disabled = true;
  statusEl.textContent = "Checking latest brief...";

  try {
    const data = await fetchNews();
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    render(data);
  } catch (error) {
    console.error(error);
    const cached = localStorage.getItem(CACHE_KEY);

    if (cached) {
      render(JSON.parse(cached));
      statusEl.textContent = `${statusEl.textContent} · showing cached brief`;
    } else {
      statusEl.textContent = "Could not load brief.";
      engineeringItemsEl.innerHTML = `<div class="empty">Check Netlify deployment and function logs.</div>`;
      leadershipItemsEl.innerHTML = "";
    }
  } finally {
    refreshBtn.disabled = false;
  }
}

[categoryFilter, sourceFilter, searchInput].forEach(control => {
  control.addEventListener("input", () => render({ ...currentData, generatedAt: lastGeneratedAt }));
});

refreshBtn.addEventListener("click", loadNews);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(console.error);
  });
}

loadNews();
setInterval(loadNews, 6 * 60 * 60 * 1000);
