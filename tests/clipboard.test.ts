import assert from "node:assert/strict";
import test from "node:test";
import { displayPromptValue, promptViewport, styleImageMarkers } from "../src/tui/app.js";
import { insertClipboardImage, insertClipboardText, normalizePastedText, parseMacClipboardOutput } from "../src/tui/clipboard.js";

test("pasted text is normalized and inserted as one operation", () => {
  assert.equal(normalizePastedText("first\r\nsecond\0"), "first\nsecond");
  assert.deepEqual(insertClipboardText("before after", 7, "one\r\ntwo"), {
    value: "before one\ntwoafter",
    cursor: 14
  });
  assert.match(displayPromptValue("one\ntwo"), /one.*↵.*two/);
  assert.doesNotMatch(displayPromptValue("safe\x1b[2J"), /\x1b\[2J/);
  assert.deepEqual(promptViewport("a very long pasted prompt", 18, 12), {
    text: "… pasted pr…",
    cursorColumn: 8
  });
});

test("clipboard images get increasing, readable markers", () => {
  const first = insertClipboardImage("describe", 8, 1);
  assert.equal(first.value, "describe [Image 1]");
  assert.equal(first.cursor, first.value.length);

  const second = insertClipboardImage(first.value, first.cursor, 2);
  assert.equal(second.value, "describe [Image 1] [Image 2]");
  assert.equal(second.marker, "[Image 2]");
  assert.match(styleImageMarkers(second.value), /\x1b\[7m\[Image 1\]\x1b\[27m/);
});

test("macOS clipboard output becomes real multimodal image content", () => {
  const payload = parseMacClipboardOutput(JSON.stringify({
    kind: "image",
    data: Buffer.from("image bytes").toString("base64"),
    mimeType: "image/png"
  }));
  assert.deepEqual(payload, {
    kind: "image",
    image: { type: "image", data: "aW1hZ2UgYnl0ZXM=", mimeType: "image/png" }
  });
});
