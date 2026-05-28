import { getStore } from "@netlify/blobs";
import { SOURCES } from "./sources.js";

export default async () => {
  const store = getStore("data-dispatch");
  const data = await store.get("latest-news", { type: "json" });

  return Response.json({
    hasCache: Boolean(data),
    sourceCount: SOURCES.length,
    generatedAt: data?.generatedAt || null,
    dataEngineering: data?.dataEngineering?.length || 0,
    dataLeadership: data?.dataLeadership?.length || 0,
    diagnostics: data?.diagnostics || null,
    sources: SOURCES
  });
};
