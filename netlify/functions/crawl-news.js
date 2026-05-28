import Parser from "rss-parser";
import crypto from "crypto";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "DataDispatchBot/1.0"
  }
});

const FEEDS = [
  "https://seattledataguy.substack.com/feed",
  "https://dataproducts.substack.com/feed",
  "https://moderndata101.substack.com/feed",
  "https://medium.com/feed/tag/data-engineering",
  "https://medium.com/feed/tag/data-leadership",
  "https://medium.com/feed/tag/analytics-engineering",
  "https://news.google.com/rss/search?q=data+engineering+OR+data+leadership+when:1d&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=analytics+engineering+OR+data+platform+when:1d&hl=en-US&gl=US&ceid=US:en"
];

const KEYWORDS = [
  "data engineering",
  "data engineer",
  "data platform",
  "data leadership",
  "analytics engineering",
  "modern data stack",
  "dbt",
  "airflow",
  "bigquery",
  "snowflake",
  "lakehouse",
  "data governance",
  "data quality",
  "data team",
  "data strategy",
  "metadata",
  "lineage",
  "orchestration"
];

function normalizeUrl(url = "") {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.split("?")[0].replace(/\/$/, "").toLowerCase();
  }
}

function hash(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function isRecent(date) {
  if (!date) return false;
  const published = new Date(date).getTime();
  if (Number.isNaN(published)) return false;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return published >= cutoff;
}

function scoreItem(item) {
  const text = `${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""}`.toLowerCase();
  let score = 0;

  for (const keyword of KEYWORDS) {
    if (text.includes(keyword)) score += 3;
  }

  if (text.includes("leadership")) score += 2;
  if (text.includes("architecture")) score += 2;
  if (text.includes("platform")) score += 2;
  if (text.includes("engineering manager")) score += 2;
  if (text.includes("ai")) score += 1;

  return score;
}

function cleanSummary(summary = "") {
  return summary
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

export default async () => {
  const results = [];
  const failures = [];

  for (const feedUrl of FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);

      for (const item of feed.items || []) {
        const url = item.link || item.guid;
        const publishedAt = item.isoDate || item.pubDate;

        if (!url || !publishedAt || !isRecent(publishedAt)) continue;

        const normalizedUrl = normalizeUrl(url);
        const title = item.title?.trim();
        if (!title) continue;

        const candidate = {
          id: hash(normalizedUrl || title),
          title,
          url,
          normalizedUrl,
          source: feed.title || new URL(feedUrl).hostname,
          publishedAt,
          summary: cleanSummary(item.contentSnippet || item.summary || ""),
          score: scoreItem(item)
        };

        if (candidate.score > 0) {
          results.push(candidate);
        }
      }
    } catch (err) {
      failures.push({ feedUrl, error: err.message });
      console.error(`Feed failed: ${feedUrl}`, err.message);
    }
  }

  const dedupedMap = new Map();

  for (const item of results) {
    const titleKey = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const key = item.normalizedUrl || titleKey;
    const existing = dedupedMap.get(key);

    if (!existing || item.score > existing.score) {
      dedupedMap.set(key, item);
    }
  }

  const topItems = [...dedupedMap.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    })
    .slice(0, 25)
    .map(({ normalizedUrl, score, ...item }) => item);

  return Response.json({
    generatedAt: new Date().toISOString(),
    count: topItems.length,
    items: topItems,
    failures
  });
};
