import Parser from "rss-parser";
import crypto from "crypto";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "DataDispatchBot/1.0" }
});

const FEEDS = [
  { url: "https://seattledataguy.substack.com/feed", sourceType: "Substack" },
  { url: "https://dataproducts.substack.com/feed", sourceType: "Substack" },
  { url: "https://moderndata101.substack.com/feed", sourceType: "Substack" },
  { url: "https://medium.com/feed/tag/data-engineering", sourceType: "Medium" },
  { url: "https://medium.com/feed/tag/data-leadership", sourceType: "Medium" },
  { url: "https://medium.com/feed/tag/analytics-engineering", sourceType: "Medium" },
  { url: "https://news.google.com/rss/search?q=data+engineering+OR+data+platform+OR+analytics+engineering+when:1d&hl=en-US&gl=US&ceid=US:en", sourceType: "Google News" },
  { url: "https://news.google.com/rss/search?q=data+leadership+OR+data+strategy+OR+chief+data+officer+when:1d&hl=en-US&gl=US&ceid=US:en", sourceType: "Google News" }
];

const ENGINEERING_KEYWORDS = [
  "data engineering", "data engineer", "data platform", "analytics engineering",
  "modern data stack", "dbt", "airflow", "dagster", "bigquery", "snowflake",
  "lakehouse", "databricks", "data governance", "data quality", "metadata",
  "lineage", "orchestration", "etl", "elt", "pipeline", "warehouse", "semantic layer"
];

const LEADERSHIP_KEYWORDS = [
  "data leadership", "data strategy", "data team", "data culture", "data literacy",
  "chief data officer", "cdo", "vp data", "head of data", "data manager",
  "engineering manager", "hiring", "career", "operating model", "stakeholder",
  "executive", "leadership", "mentorship", "governance"
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
  return published >= Date.now() - 24 * 60 * 60 * 1000;
}

function keywordScore(text, keywords) {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 3 : 0), 0);
}

function classifyAndScore(item) {
  const text = `${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""}`.toLowerCase();
  const engineeringScore = keywordScore(text, ENGINEERING_KEYWORDS);
  const leadershipScore = keywordScore(text, LEADERSHIP_KEYWORDS);

  let category = engineeringScore >= leadershipScore ? "engineering" : "leadership";
  let score = Math.max(engineeringScore, leadershipScore);

  if (text.includes("architecture")) score += 2;
  if (text.includes("platform")) score += 2;
  if (text.includes("leadership")) score += 2;
  if (text.includes("ai")) score += 1;

  return { category, score, engineeringScore, leadershipScore };
}

function cleanSummary(summary = "") {
  return summary
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

function sourceName(feed, feedMeta) {
  const feedTitle = feed.title || "";
  if (feedMeta.sourceType === "Google News") return "Google News";
  if (feedMeta.sourceType === "Medium") return feedTitle.includes("Medium") ? "Medium" : feedTitle || "Medium";
  if (feedMeta.sourceType === "Substack") return feedTitle || "Substack";
  return feedTitle || feedMeta.sourceType;
}

function dedupe(items) {
  const map = new Map();

  for (const item of items) {
    const titleKey = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const key = item.normalizedUrl || titleKey;
    const existing = map.get(key);

    if (!existing || item.score > existing.score) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

function rank(items, limit) {
  return items
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    })
    .slice(0, limit)
    .map(({ normalizedUrl, score, engineeringScore, leadershipScore, ...item }) => item);
}

export default async () => {
  const results = [];
  const failures = [];

  for (const feedMeta of FEEDS) {
    try {
      const feed = await parser.parseURL(feedMeta.url);

      for (const item of feed.items || []) {
        const url = item.link || item.guid;
        const publishedAt = item.isoDate || item.pubDate;
        const title = item.title?.trim();

        if (!url || !publishedAt || !title || !isRecent(publishedAt)) continue;

        const normalizedUrl = normalizeUrl(url);
        const classification = classifyAndScore(item);
        if (classification.score <= 0) continue;

        results.push({
          id: hash(normalizedUrl || title),
          title,
          url,
          normalizedUrl,
          source: sourceName(feed, feedMeta),
          sourceType: feedMeta.sourceType,
          category: classification.category,
          publishedAt,
          summary: cleanSummary(item.contentSnippet || item.summary || ""),
          ...classification
        });
      }
    } catch (err) {
      failures.push({ feedUrl: feedMeta.url, error: err.message });
      console.error(`Feed failed: ${feedMeta.url}`, err.message);
    }
  }

  const deduped = dedupe(results);
  const engineering = rank(deduped.filter(item => item.category === "engineering"), 25);
  const leadership = rank(deduped.filter(item => item.category === "leadership"), 10);

  return Response.json({
    generatedAt: new Date().toISOString(),
    engineering,
    leadership,
    items: [...engineering, ...leadership],
    counts: {
      engineering: engineering.length,
      leadership: leadership.length,
      total: engineering.length + leadership.length
    },
    failures
  });
};
