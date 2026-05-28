const API_URL = "/.netlify/functions/crawl-news";
const CACHE_KEY = "data-dispatch-items";

const statusEl = document.getElementById("status");
const itemsEl = document.getElementById("items");
const refreshBtn = document.getElementById("refreshBtn");

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchNews() {
  const response = await fetch(`${API_URL}?t=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function render(data) {
  const generated = data.generatedAt
    ? new Date(data.generatedAt).toLocaleString()
    : "unknown";

  statusEl.textContent = `Updated ${generated} · ${data.count || 0} items`;

  if (!data.items || data.items.length === 0) {
    itemsEl.innerHTML = `<div class="empty">No matching items found in the last 24 hours.</div>`;
    return;
  }

  itemsEl.innerHTML = data.items.map(item => {
    const title = escapeHtml(item.title || "Untitled");
    const source = escapeHtml(item.source || "Unknown source");
    const summary = escapeHtml(item.summary || "");
    const published = item.publishedAt
      ? new Date(item.publishedAt).toLocaleString()
      : "Unknown date";

    return `
      <article class="article-card">
        <h2>
          <a href="${item.url}" target="_blank" rel="noopener noreferrer">${title}</a>
        </h2>
        <p class="article-meta">${source} · ${published}</p>
        <p class="summary">${summary}</p>
      </article>
    `;
  }).join("");
}

async function loadNews() {
  refreshBtn.disabled = true;
  statusEl.textContent = "Checking for latest items...";

  try {
    const data = await fetchNews();
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    render(data);
  } catch (error) {
    console.error(error);
    const cached = localStorage.getItem(CACHE_KEY);

    if (cached) {
      render(JSON.parse(cached));
      statusEl.textContent += " · showing cached content";
    } else {
      statusEl.textContent = "Could not load items.";
      itemsEl.innerHTML = `<div class="empty">Try again after deployment finishes or check Netlify function logs.</div>`;
    }
  } finally {
    refreshBtn.disabled = false;
  }
}

refreshBtn.addEventListener("click", loadNews);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(console.error);
  });
}

loadNews();
setInterval(loadNews, 6 * 60 * 60 * 1000);
