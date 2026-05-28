import Parser from "rss-parser";
import crypto from "crypto";
import * as cheerio from "cheerio";

const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/122 Safari/537.36 DataDispatch/1.0",
  "Accept": "application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8"
};

const parser = new Parser({
  timeout: 30000,
  headers: REQUEST_HEADERS
});

const SUBSTACK_FEEDS = [
  { url: "https://seattledataguy.substack.com/feed", hint: "engineering" },
  { url: "https://moderndata101.substack.com/feed", hint: "engineering" },
  { url: "https://dataproducts.substack.com/feed", hint: "leadership" },
  { url: "https://practicaldataleadership.substack.com/feed", hint: "leadership" },
  { url: "https://dataleadershipweekly.substack.com/feed", hint: "leadership" },
  { url: "https://benn.substack.com/feed", hint: "leadership" },
  { url: "https://dataengineeringweekly.substack.com/feed", hint: "engineering" },
  { url: "https://dataelixir.substack.com/feed", hint: "engineering" },
  { url: "https://analyticsengineeringroundup.substack.com/feed", hint: "engineering" },
  { url: "https://roundup.getdbt.com/feed", hint: "engineering" },
  { url: "https://locallyoptimistic.substack.com/feed", hint: "leadership" },
  { url: "https://mikkeldengsoe.substack.com/feed", hint: "engineering" },
  { url: "https://datatopics.substack.com/feed", hint: "engineering" },
  { url: "https://databased.substack.com/feed", hint: "engineering" },
  { url: "https://datagibberish.substack.com/feed", hint: "leadership" },
  { url: "https://dataliteracy.substack.com/feed", hint: "leadership" },
  { url: "https://datacurious.substack.com/feed", hint: "leadership" },
  { url: "https://databeats.substack.com/feed", hint: "engineering" },
  { url: "https://datamonkey.substack.com/feed", hint: "engineering" },
  { url: "https://datastackshow.substack.com/feed", hint: "engineering" },
  { url: "https://dataqualitycamp.substack.com/feed", hint: "engineering" },
  { url: "https://mattturck.substack.com/feed", hint: "leadership" },
  { url: "https://technically.substack.com/feed", hint: "leadership" },
  { url: "https://softwareleadweekly.com/feed", hint: "leadership" },
  { url: "https://newsletter.pragmaticengineer.com/feed", hint: "leadership" },
  { url: "https://charity.wtf/feed", hint: "leadership" }
].map(feed => ({ ...feed, sourceType: "Substack", freshnessHours: 72 }));

const MEDIUM_FEEDS = [
  "https://medium.com/feed/tag/data-engineering",
  "https://medium.com/feed/tag/data-leadership",
  "https://medium.com/feed/tag/analytics-engineering",
  "https://medium.com/feed/tag/data-strategy",
  "https://medium.com/feed/tag/data-governance"
].map(url => ({ url, sourceType: "Medium", freshnessHours: 24 }));

const OTHER_FEEDS = [
  { url: "https://www.nicolaaskham.com/blog", hint: "leadership" },
  { url: "https://www.getdbt.com/blog/rss.xml", hint: "engineering" },
  { url: "https://airbyte.com/blog/rss.xml", hint: "engineering" },
  { url: "https://dagster.io/blog/rss.xml", hint: "engineering" },
  { url: "https://www.montecarlodata.com/blog/rss.xml", hint: "engineering" },
  { url: "https://www.datafold.com/blog/rss.xml", hint: "engineering" },
  { url: "https://www.fivetran.com/blog/rss.xml", hint: "engineering" },
  { url: "https://www.databricks.com/feed", hint: "engineering" },
  { url: "https://www.snowflake.com/blog/feed/", hint: "engineering" },
  { url: "https://www.starburst.io/blog/feed/", hint: "engineering" },
  { url: "https://www.kdnuggets.com/feed", hint: "engineering" },
  { url: "https://www.oreilly.com/radar/feed/index.xml", hint: "leadership" },
  { url: "https://martinfowler.com/feed.atom", hint: "leadership" },
  { url: "https://www.thoughtworks.com/rss/insights.xml", hint: "leadership" },
  { url: "https://hbr.org/rss/topic/technology-and-analytics", hint: "leadership" }
].map(feed => ({ ...feed, sourceType: "Other", freshnessHours: 24 }));

const FEEDS = [...SUBSTACK_FEEDS, ...MEDIUM_FEEDS, ...OTHER_FEEDS];

const ENGINEERING_KEYWORDS = [
  "data engineering", "data engineer", "data platform", "analytics engineering",
  "modern data stack", "dbt", "airflow", "dagster", "bigquery", "snowflake",
  "lakehouse", "databricks", "data governance", "data quality", "metadata",
  "lineage", "orchestration", "etl", "elt", "pipeline", "warehouse",
  "semantic layer", "table format", "iceberg", "delta lake", "data warehouse",
  "streaming", "spark", "flink", "reverse etl", "data contracts", "observability"
];

const LEADERSHIP_KEYWORDS = [
  "data leadership", "data strategy", "data team", "data culture", "data literacy",
  "chief data officer", "cdo", "vp data", "head of data", "data manager",
  "engineering manager", "hiring", "career", "operating model", "stakeholder",
  "executive", "leadership", "mentorship", "governance", "data product",
  "decision making", "org design", "management", "influence", "roadmap",
  "strategy", "prioritization", "communication", "transformation"
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

function isRecent(date, hours = 24) {
  if (!date) return false;
  const published = new Date(date).getTime();
  if (Number.isNaN(published)) return false;
  return published >= Date.now() - hours * 60 * 60 * 1000;
}

function keywordScore(text, keywords) {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 3 : 0), 0);
}

function classifyAndScore(item, feedMeta) {
  const text = `${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""} ${item.content || ""}`.toLowerCase();
  let engineeringScore = keywordScore(text, ENGINEERING_KEYWORDS);
  let leadershipScore = keywordScore(text, LEADERSHIP_KEYWORDS);

  if (feedMeta.hint === "engineering") engineeringScore += 4;
  if (feedMeta.hint === "leadership") leadershipScore += 4;

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
    .slice(0, 300);
}

function sourceName(feed, feedMeta) {
  const feedTitle = feed.title || "";
  try {
    const host = new URL(feedMeta.url).hostname.replace(/^www\./, "");
    if (feedMeta.sourceType === "Medium") return feedTitle.includes("Medium") ? "Medium" : feedTitle || "Medium";
    if (feedMeta.sourceType === "Substack") return feedTitle || host.replace(".substack.com", "");
    return feedTitle || host;
  } catch {
    return feedTitle || feedMeta.sourceType;
  }
}

async function discoverFeedUrl(url) {
  if (/\.(xml|rss|atom)$/i.test(url) || url.endsWith("/feed") || url.includes("/feed/")) return url;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, { headers: REQUEST_HEADERS, signal: controller.signal });
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();

    if (contentType.includes("xml") || body.trim().startsWith("<?xml") || body.includes("<rss")) return url;

    const $ = cheerio.load(body);
    const candidates = [];

    $('link[rel="alternate"]').each((_, el) => {
      const type = ($(el).attr("type") || "").toLowerCase();
      const href = $(el).attr("href");
      if (href && (type.includes("rss") || type.includes("atom") || type.includes("xml"))) {
        candidates.push(new URL(href, url).toString());
      }
    });

    if (candidates.length) return candidates[0];

    return url.replace(/\/$/, "") + "/feed";
  } finally {
    clearTimeout(timeout);
  }
}

function dedupe(items) {
  const map = new Map();

  for (const item of items) {
    const titleKey = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const key = item.normalizedUrl || titleKey;
    const existing = map.get(key);

    if (!existing || item.score > existing.score) map.set(key, item);
  }

  return [...map.values()];
}

function rank(items, limit = 25) {
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
      const feedUrl = await discoverFeedUrl(feedMeta.url);
      const feed = await parser.parseURL(feedUrl);

      for (const item of feed.items || []) {
        const url = item.link || item.guid;
        const publishedAt = item.isoDate || item.pubDate;
        const title = item.title?.trim();

        if (!url || !publishedAt || !title || !isRecent(publishedAt, feedMeta.freshnessHours)) continue;

        const normalizedUrl = normalizeUrl(url);
        const classification = classifyAndScore(item, feedMeta);

        if (classification.score <= 0 && feedMeta.sourceType !== "Substack") continue;

        const adjustedScore = classification.score +
          (feedMeta.sourceType === "Substack" ? 5 : 0) +
          (feedMeta.sourceType === "Medium" ? 2 : 0) +
          (feedMeta.sourceType === "Other" ? 1 : 0);

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
      failures.push({ feedUrl: feedMeta.url, sourceType: feedMeta.sourceType, error: err.message });
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
    sourceGroups: ["Substack", "Medium", "Other"],
    failures
  });
};
