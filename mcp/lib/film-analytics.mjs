import { randomUUID } from "node:crypto";
import { filmAnalyticsParameters } from "../../src/filmAnalytics.js";

// Per-canvas attribution lasts only for this MCP process. Paths stay local.
export function createFilmInsertionAnalytics({ sendGa4, sendPosthog }) {
  const clients = new Map();
  return {
    remember(canvasDir, { clientId, appVersion }) {
      clients.set(canvasDir, { clientId, appVersion });
    },
    async track(canvasDir, result) {
      const client = clients.get(canvasDir);
      if (!client || result.dryRun || !result.isFilm) return false;
      const event = {
        ...client,
        eventName: "ai_film_inserted",
        eventId: randomUUID(),
        parameters: {
          ai_type: "film",
          tool_name: "insert_cowart_html_draft",
          completion_status: "local_saved",
          ...filmAnalyticsParameters({
            filmStyle: result.film?.cowartFilmStyle,
            filmDuration: result.film?.cowartFilmDuration,
            filmMuted: result.film?.cowartFilmMuted,
            filmWidth: result.bounds?.w,
            filmHeight: result.bounds?.h,
          }),
        },
      };
      // Both deliveries are independent, and failure cannot undo an insertion.
      await Promise.allSettled([
        Promise.resolve().then(() => sendGa4(event)),
        Promise.resolve().then(() => sendPosthog(event)),
      ]);
      return true;
    },
  };
}
