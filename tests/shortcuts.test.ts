import assert from "node:assert/strict";
import test from "node:test";
import { webSearchUrl, youtubeSearchUrl } from "../src/cli/shortcuts.js";

test("YouTube shortcut builds an encoded search URL", () => {
  assert.equal(
    youtubeSearchUrl("настройка hermes"),
    "https://www.youtube.com/results?search_query=%D0%BD%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B0+hermes"
  );
});

test("web shortcut builds an encoded search URL", () => {
  assert.equal(webSearchUrl("Raya & CLI"), "https://www.google.com/search?q=Raya+%26+CLI");
});
