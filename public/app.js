const API_URL = "/.netlify/functions/get-news";
const UPDATE_URL = "/.netlify/functions/update-news";

let currentData = { dataEngineering: [], dataLeadership: [] };

const $ = (id) => document.getElementById(id);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function groupClass(group = "") {
  return group.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function shortDate(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getFilters() {
  return {
    q: $("searchInput").value.trim().toLowerCase(),
    group: $("groupFilter").value,
    source: $("sourceFilter").value
  };
}

function filtered(items) {
  const { q, group, source } = getFilters();
  return items.filter(item => {
    const text = `${item.title || ""} ${item.summary || ""} ${item.source || ""}`.toLowerCase();
    return (!q || text.includes(q))
      && (group === "All" || item.sourceGroup === group)
      && (source === "All" || item.source === source);
  });
}

function updateSources() {
  const all = [...currentData.dataEngineering, ...currentData.dataLeadership];
  const sources = [...new Set(all.map(x => x.source).filter(Boolean))].sort();
  const selected = $("sourceFilter").value;

  $("sourceFilter").innerHTML = `<option value="All">All sources</option>` +
    sources.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

  if (sources.includes(selected)) $("sourceFilter").value = selected;
}

function renderFeed(id, items) {
  const list = filtered(items);
  const el = $(id);

  if (!list.length) {
    el.innerHTML = `<div class="empty">No articles found for the current filters. Tap “Check for New Now” to refresh sources.</div>`;
    return;
  }

  el.innerHTML = list.map((item, idx) => `
    <article class="item-card">
      <div class="rank">#${idx + 1}</div>
      <div class="item-main">
        <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h3>
        <div class="meta">
          <span class="pill ${groupClass(item.sourceGroup)}">${escapeHtml(item.sourceGroup)}</span>
          <span class="pill">${escapeHtml(item.source)}</span>
          <span class="pill">${shortDate(item.publishedAt)}</span>
        </div>
        ${item.summary ? `<p class="summary">${escapeHtml(item.summary).slice(0, 240)}</p>` : ""}
      </div>
      <a class="open-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Open →</a>
    </article>
  `).join("");
}

function render() {
  updateSources();

  $("engCount").textContent = currentData.dataEngineering?.length || 0;
  $("leadCount").textContent = currentData.dataLeadership?.length || 0;
  $("lastUpdated").textContent = currentData.generatedAt ? new Date(currentData.generatedAt).toLocaleString() : "—";

  renderFeed("engineeringFeed", currentData.dataEngineering || []);
  renderFeed("leadershipFeed", currentData.dataLeadership || []);
}

async function runUpdate() {
  const res = await fetch(`${UPDATE_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Update failed: ${res.status}`);
  return res.json();
}

async function fetchCached() {
  const res = await fetch(`${API_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Get failed: ${res.status}`);
  return res.json();
}

async function loadNews({ primeIfEmpty = true } = {}) {
  $("status").textContent = "Loading latest dispatch…";
  $("statusPill").textContent = "Loading";

  try {
    let data = await fetchCached();
    let empty = !(data.dataEngineering?.length || data.dataLeadership?.length);

    if (empty && primeIfEmpty) {
      $("status").textContent = "First run detected. Building your dispatch now…";
      $("statusPill").textContent = "Building";
      await runUpdate();
      data = await fetchCached();
    }

    currentData = data;
    render();

    const total = (data.dataEngineering?.length || 0) + (data.dataLeadership?.length || 0);
    $("statusPill").textContent = total ? "Ready" : "Empty";
    $("status").textContent = total
      ? `Loaded ${total} articles.`
      : "No articles returned yet. Check Netlify function logs or tap refresh again.";
  } catch (err) {
    console.error(err);
    $("statusPill").textContent = "Error";
    $("status").textContent = "Could not load dispatch. Check Netlify function logs.";
  }
}

async function refreshNews() {
  $("refreshBtn").disabled = true;
  $("status").textContent = "Refreshing sources now…";
  $("statusPill").textContent = "Refreshing";

  try {
    await runUpdate();
    await loadNews({ primeIfEmpty: false });
  } catch (err) {
    console.error(err);
    $("statusPill").textContent = "Error";
    $("status").textContent = "Refresh failed. Check Netlify function logs.";
  } finally {
    $("refreshBtn").disabled = false;
  }
}

$("refreshBtn").addEventListener("click", refreshNews);
$("searchInput").addEventListener("input", render);
$("groupFilter").addEventListener("change", render);
$("sourceFilter").addEventListener("change", render);

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const key = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".feed-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    $(`${key}Panel`).classList.add("active");
  });
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(console.error);
}

loadNews();
