import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore("data-dispatch");
  const data = await store.get("latest-news", { type: "json" });

  if (!data) {
    return Response.json({
      generatedAt: null,
      dataEngineering: [],
      dataLeadership: [],
      diagnostics: {
        message: "No cached data yet. The frontend will trigger update-news on first run."
      }
    });
  }

  return Response.json(data);
};
