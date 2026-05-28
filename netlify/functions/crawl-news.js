import Parser from "rss-parser";
import crypto from "crypto";

const parser = new Parser({
  timeout: 20000,
  headers: { "User-Agent": "DataDispatchBot/1.0 (+https://netlify.app)" }
});

const FEEDS = [
  // Substack: data engineering / platforms / analytics engineering
  { url: "https://seattledataguy.substack.com/feed", sourceType: "Substack" },
  { url: "https://moderndata101.substack.com/feed", sourceType: "Substack" },
  { url: "https://dataproducts.substack.com/feed", sourceType: "Substack" },
  { url: "https://roundup.getdbt.com/feed", sourceType: "Substack" },
  { url: "https://benn.substack.com/feed", sourceType: "Substack" },
  { url: "https://practicaldataleadership.substack.com/feed", sourceType: "Substack" },
  { url: "https://dataleadershipweekly.substack.com/feed", sourceType: "Substack" },

  // Medium
  { url: "https://medium.com/feed/tag/data-engineering", sourceType: "Medium" },
  { url: "https://medium.com/feed/tag/data-leadership", sourceType: "Medium" },
  { url: "https://medium.com/feed/tag/analytics-engineering", sourceType: "Medium" },
  { url: "https://medium.com/feed/tag/data-strategy", sourceType: "Medium" },

  // Google News RSS. This is intentionally Google News RSS, not direct Google scraping.
  { url: "https://news.google.com/rss/search?q=data+engineering+OR+data+platform+OR+analytics+engineering+when:1d&hl=en-US&gl=US&ceid=US:en", sourceType: "Google News" },
  { url: "https://news.google.com/rss/search?q=data+leadership+OR+data+strategy+OR+chief+data+officer+OR+data+culture+when:1d&hl=en-US&gl=US&ceid=US:en", sourceType: "Google News" }
];

const ENGINEERING_KEYWORDS = [
  "data engineering", "data engineer", "data platform", "analytics engineering",
  "modern data stack", "dbt", "airflow", "dagster", "bigquery", "snowflake",
  "lakehouse", "databricks", "data governance", "data quality", "metadata",
  "lineage", "orchestration", "etl", "elt", "pipeline", "warehouse",
  "semantic layer", "table format", "iceberg", "delta lake", "data warehouse"
];

const LEADERSHIP_KEYWORDS = [
  "data leadership", "data strategy", "data team", "data culture", "data literacy",
  "chief data officer", "cdo", "vp data", "head of data", "data manager",
  "engineering manager", "hiring", "career", "operating model", "stakeholder",
  "executive", "leadership", "mentorship", "governance", "data product",
  "decision making", "org design", "management"
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

function classifyAndScore(item, feedMeta) {
  const text = `${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""} ${item.content || ""}`.toLowerCase();
  let engineeringScore = keywordScore(text, ENGINEERING_KEYWORDS);
  let leadershipScore = keywordScore(text, LEADERSHIP_KEYWORDS);

  // Source hints help Substack/Medium newsletters surface even when descriptions are short.
  const feedUrl = feedMeta.url.toLowerCase();
  if (feedUrl.includes("leadership") || feedUrl.includes("benn.substack")) leadershipScore += 4;
  if (feedUrl.includes("seattledataguy") || feedUrl.includes("moderndata") || feedUrl.includes("dbt")) engineeringScore += 4;

  if (text.includes("architecture")) engineeringScore += 2;
  if (text.includes("platform")) engineeringScore += 2;
  if (text.includes("leadership")) leadershipScore += 2;
  if (text.includes("strategy")) leadershipScore += 2;
  if (text.includes("ai")) {
    engineeringScore += 1;
    leadershipScore += 1;
  }

  const category = leadershipScore > engineeringScore ? "leadership" : "engineering";
  const score = Math.max(engineeringScore, leadershipScore);

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
  if (feedMeta.sourceType === "Substack") return feedTitle || new URL(feedMeta.url).hostname.replace(".substack.com", "");
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
        const classification = classifyAndScore(item, feedMeta);

        // Keep Substack items even if snippets are sparse. Other feeds still need relevance.
        if (classification.score <= 0 && feedMeta.sourceType !== "Substack") continue;

        const adjustedScore = classification.score +
          (feedMeta.sourceType === "Substack" ? 5 : 0) +
          (feedMeta.sourceType === "Medium" ? 2 : 0);

        results.push({
          id: hash(normalizedUrl || title),
          title,
          url,
          normalizedUrl,
          source: sourceName(feed, feedMeta),
          sourceType: feedMeta.sourceType,
          category: classification.category,
          publishedAt,
          summary: cleanSummary(item.contentSnippet || item.summary || item.content || ""),
          ...classification,
          score: adjustedScore
        });
      }
    } catch (err) {
      failures.push({ feedUrl: feedMeta.url, error: err.message });
      console.error(`Feed failed: ${feedMeta.url}`, err.message);
    }
  }

  const deduped = dedupe(results);
  const engineering = rank(deduped.filter(item => item.category === "engineering"), 25);
  const leadership = rank(deduped.filter(item => item.category === "leadership"), 25);

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
