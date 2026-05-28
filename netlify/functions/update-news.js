import Parser from "rss-parser";
import { getStore } from "@netlify/blobs";
import { SOURCES } from "./sources.js";

export const config = { schedule: "0 */6 * * *" };

const parser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent": "Mozilla/5.0 DataDispatch/3.1",
    "Accept": "application/rss+xml, application/xml, text/xml, */*"
  }
});

const KEYWORDS = {
  "Data Engineering": [
    "data engineering", "analytics engineering", "pipeline", "orchestration", "airflow", "dbt",
    "bigquery", "snowflake", "databricks", "lakehouse", "warehouse", "streaming", "elt",
    "etl", "governance", "quality", "observability", "platform", "architecture"
  ],
  "Data Leadership": [
    "data leadership", "data strategy", "data culture", "governance", "operating model",
    "team", "executive", "stakeholder", "data product", "data mesh", "literacy",
    "management", "leadership", "org", "decision"
  ]
};

function cleanText(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedUrl(url = "") {
  return String(url).split("?")[0].replace(/\/$/, "").toLowerCase();
}

function isRecent(item, source) {
  if (!item.publishedAt) return true;
  const date = new Date(item.publishedAt).getTime();
  if (Number.isNaN(date)) return true;

  const hours = (Date.now() - date) / 36e5;

  if (source.group === "Substack") return hours <= 72;
  return hours <= 48;
}

function score(item) {
  const terms = KEYWORDS[item.category] || [];
  const text = `${item.title} ${item.summary}`.toLowerCase();
  let value = 0;

  for (const term of terms) {
    if (text.includes(term)) value += 5;
  }

  if (item.sourceGroup === "Substack") value += 4;
  if (item.sourceGroup === "Other") value += 3;
  if (item.sourceGroup === "Medium") value += 1;

  const date = new Date(item.publishedAt).getTime();
  if (!Number.isNaN(date)) {
    const hours = Math.max(1, (Date.now() - date) / 36e5);
    value += Math.max(0, 12 - hours / 6);
  }

  return value;
}

async function fetchFeed(source) {
  try {
    const feed = await parser.parseURL(source.url);

    return (feed.items || []).map(item => {
      const title = cleanText(item.title);
      const url = item.link || item.guid || "";
      const publishedAt = item.isoDate || item.pubDate || item.published || "";
      const summary = cleanText(item.contentSnippet || item.summary || item.content || "");

      return {
        id: normalizedUrl(url) || title.toLowerCase(),
        title,
        url,
        summary,
        publishedAt,
        source: cleanText(feed.title || new URL(source.url).hostname),
        sourceGroup: source.group,
        category: source.category
      };
    }).filter(item => item.title && item.url && isRecent(item, source));
  } catch (error) {
    return [{
      error: true,
      sourceUrl: source.url,
      sourceGroup: source.group,
      category: source.category,
      message: error.message
    }];
  }
}

function dedupe(items) {
  const map = new Map();

  for (const item of items.filter(x => !x.error)) {
    const key = normalizedUrl(item.url) || item.title.toLowerCase();
    const existing = map.get(key);

    if (!existing || score(item) > score(existing)) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

async function crawlAll() {
  const batchSize = 8;
  let all = [];
  let errors = [];

  for (let i = 0; i < SOURCES.length; i += batchSize) {
    const batch = SOURCES.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(fetchFeed));
    const flat = results.flat();

    errors.push(...flat.filter(x => x.error));
    all.push(...flat.filter(x => !x.error));
  }

  const clean = dedupe(all)
    .map(item => ({ ...item, score: score(item) }))
    .sort((a, b) => b.score - a.score || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const dataEngineering = clean.filter(x => x.category === "Data Engineering").slice(0, 25);
  const dataLeadership = clean.filter(x => x.category === "Data Leadership").slice(0, 25);

  return {
    generatedAt: new Date().toISOString(),
    dataEngineering,
    dataLeadership,
    diagnostics: {
      configuredSources: SOURCES.length,
      crawledItems: all.length,
      errors: errors.slice(0, 20)
    }
  };
}

export default async () => {
  const payload = await crawlAll();
  const store = getStore("data-dispatch");
  await store.setJSON("latest-news", payload);

  return Response.json({
    ok: true,
    generatedAt: payload.generatedAt,
    dataEngineering: payload.dataEngineering.length,
    dataLeadership: payload.dataLeadership.length,
    diagnostics: payload.diagnostics
  });
};
