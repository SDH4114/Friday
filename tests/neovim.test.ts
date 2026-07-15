import assert from "node:assert/strict";
import test from "node:test";
import { createNeovimState, DEFAULT_NEOVIM_CONFIG, handleNeovimKey, type NeovimConfig, type NeovimKey } from "../src/tui/neovim.js";

class Editor {
  value: string;
  cursor: number;
  readonly config: NeovimConfig;
  readonly state;

  constructor(value = "", cursor = 0, config: NeovimConfig = DEFAULT_NEOVIM_CONFIG) {
    this.value = value;
    this.cursor = cursor;
    this.config = config;
    this.state = createNeovimState(config);
  }

  key(text: string, key: NeovimKey = {}): this {
    const result = handleNeovimKey(this.value, this.cursor, text, key, this.state, this.config);
    this.value = result.value;
    this.cursor = result.cursor;
    return this;
  }

  keys(sequence: string): this {
    for (const character of [...sequence]) this.key(character);
    return this;
  }

  escape(): this { return this.key("", { name: "escape" }); }
  ctrl(name: string): this { return this.key("", { name, ctrl: true }); }
}

test("starts in normal mode and normal keys never insert text", () => {
  const editor = new Editor("hello");
  editor.key("q");
  assert.equal(editor.value, "hello");
  assert.equal(editor.state.mode, "NORMAL");
});

test("insert mode is one undo unit and redo restores it", () => {
  const editor = new Editor().key("i").keys("hello world").escape();
  assert.equal(editor.value, "hello world");
  editor.key("u");
  assert.equal(editor.value, "");
  editor.ctrl("r");
  assert.equal(editor.value, "hello world");
});

test("insert entry commands place the cursor correctly", () => {
  assert.equal(new Editor("ac").key("a").key("b").escape().value, "abc");
  assert.equal(new Editor("bc", 1).key("I").key("a").escape().value, "abc");
  assert.equal(new Editor("ab").key("A").key("c").escape().value, "abc");
  assert.equal(new Editor("bc").key("O").key("a").escape().value, "abc");
  assert.equal(new Editor("ab").key("o").key("c").escape().value, "abc");
  assert.equal(new Editor("  bc").key("I").key("a").escape().value, "  abc");
  assert.equal(new Editor("  bc").keys("gI").key("a").escape().value, "a  bc");
});

test("unicode word motions and counts work", () => {
  const editor = new Editor("один два три");
  editor.keys("2w");
  assert.equal(editor.cursor, 9);
  editor.key("b");
  assert.equal(editor.cursor, 5);
  editor.key("e");
  assert.equal(editor.cursor, 7);
});

test("grapheme motions and deletion keep emoji intact", () => {
  const editor = new Editor("A👨‍👩‍👧‍👦B");
  editor.key("l");
  const emojiCursor = editor.cursor;
  assert.ok(emojiCursor > 0);
  editor.key("x");
  assert.equal(editor.value, "AB");
  editor.key("u");
  assert.equal(editor.value, "A👨‍👩‍👧‍👦B");
});

test("small-word and WORD motions differ at punctuation", () => {
  const small = new Editor("one.two three").key("w");
  const big = new Editor("one.two three").key("W");
  assert.equal(small.cursor, 3);
  assert.equal(big.cursor, 8);
});

test("delete operators use Neovim motion ranges", () => {
  assert.equal(new Editor("one two three").keys("dw").value, "two three");
  assert.equal(new Editor("one two three").keys("de").value, " two three");
  assert.equal(new Editor("one two three", 4).keys("db").value, "two three");
  assert.equal(new Editor("one two three", 4).keys("d$").value, "one ");
  assert.equal(new Editor("one two", 4).keys("d0").value, "two");
  assert.equal(new Editor("one two").keys("dd").value, "");
  assert.equal(new Editor("one two", 4).keys("dgg").value, "");
});

test("operator and motion counts multiply", () => {
  assert.equal(new Editor("one two three four five").keys("2dw").value, "three four five");
  assert.equal(new Editor("one two three four five").keys("d2w").value, "three four five");
  assert.equal(new Editor("one two three four five").keys("2d2w").value, "five");
});

test("change operators enter insert mode and undo as one change", () => {
  const editor = new Editor("one two").keys("cw").keys("ONE").escape();
  assert.equal(editor.value, "ONE two");
  editor.key("u");
  assert.equal(editor.value, "one two");
});

test("inner and around word text objects work", () => {
  assert.equal(new Editor("one two three", 5).keys("diw").value, "one  three");
  assert.equal(new Editor("one two three", 5).keys("daw").value, "one three");
  const editor = new Editor("say hello now", 5).keys("ciw").keys("bye").escape();
  assert.equal(editor.value, "say bye now");
});

test("quote and bracket text objects work", () => {
  assert.equal(new Editor('say "hello" now', 6).keys('di"').value, 'say "" now');
  assert.equal(new Editor("call(foo) now", 6).keys("da(").value, "call now");
});

test("yank and paste use the internal register", () => {
  const editor = new Editor("one two").keys("yiw").key("$").key("p");
  assert.equal(editor.value, "one twoone");
  assert.equal(editor.state.register, "one");
  const toEnd = new Editor("one two", 4).key("Y");
  assert.equal(toEnd.state.register, "two");
});

test("character and end-of-line edits work", () => {
  assert.equal(new Editor("abc").keys("2x").value, "c");
  assert.equal(new Editor("abc", 1).key("X").value, "bc");
  assert.equal(new Editor("abc", 1).key("D").value, "a");
  assert.equal(new Editor("abc", 1).key("C").keys("Z").escape().value, "aZ");
  assert.equal(new Editor("abc", 1).key("s").keys("Z").escape().value, "aZc");
  assert.equal(new Editor("abc").key("S").keys("Z").escape().value, "Z");
});

test("visual mode supports motions, delete, change, yank and paste", () => {
  assert.equal(new Editor("abcdef", 1).key("v").keys("2l").key("d").value, "aef");
  assert.equal(new Editor("abcdef", 1).key("v").key("e").key("c").keys("X").escape().value, "aX");
  const editor = new Editor("one two", 0).key("v").key("e").key("y").key("$").key("p");
  assert.equal(editor.value, "one twoone");
  const replace = new Editor("one two").keys("yiw").key("w").key("v").key("e").key("p");
  assert.equal(replace.value, "one one");
  assert.equal(replace.state.register, "two");
});

test("find, till, repeat and reverse-find motions work", () => {
  const editor = new Editor("a-b-c-d").key("f").key("-");
  assert.equal(editor.cursor, 1);
  editor.key(";");
  assert.equal(editor.cursor, 3);
  editor.key(",");
  assert.equal(editor.cursor, 1);
  assert.equal(new Editor("abc:def").keys("dt:").value, ":def");
  assert.equal(new Editor("abc:def").keys("df:").value, "def");
});

test("replace commands and case toggling work", () => {
  assert.equal(new Editor("abc", 1).key("r").key("Z").value, "aZc");
  assert.equal(new Editor("abc", 1).key("R").keys("XY").escape().value, "aXY");
  assert.equal(new Editor("AbC").keys("3~").value, "aBc");
});

test("slash opens Raya command input without breaking Neovim undo", () => {
  const editor = new Editor().key("/").keys("status").escape();
  assert.equal(editor.value, "/status");
  assert.equal(editor.state.mode, "NORMAL");
  editor.key("u");
  assert.equal(editor.value, "");
});

test("dot repeats normal, operator and insert changes", () => {
  assert.equal(new Editor("abcdef").key("x").key(".").value, "cdef");
  const words = new Editor("one two three").keys("cw").keys("X").escape().key("w").key(".");
  assert.equal(words.value, "X X three");
  const insert = new Editor("ab").key("A").key("!").escape().key("0").key(".");
  assert.equal(insert.value, "ab!!");
});

test("bindings can be remapped through neovim.json data", () => {
  const config: NeovimConfig = {
    ...DEFAULT_NEOVIM_CONFIG,
    bindings: { ...DEFAULT_NEOVIM_CONFIG.bindings, left: ["H"], right: ["L"] }
  };
  const editor = new Editor("abc", 1, config).key("L");
  assert.equal(editor.cursor, 2);
  editor.key("h");
  assert.equal(editor.cursor, 2);
  editor.key("H");
  assert.equal(editor.cursor, 1);
});

test("random command streams preserve cursor and grapheme invariants", () => {
  const inputs = ["h", "j", "k", "l", "w", "b", "e", "0", "$", "i", "a", "A", "I", "v", "d", "c", "y", "x", "X", "p", "P", "u", "r", "R", "s", "~", "1", "2", "f", ";", ",", "Escape", "я", "🙂", " "];
  const editor = new Editor("Привет, world 🙂 test");
  let seed = 0x5eed;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (let step = 0; step < 5_000; step += 1) {
    if (editor.value.length > 500) editor.escape().key("S").keys("seed").escape();
    const input = inputs[Math.floor(random() * inputs.length)]!;
    if (input === "Escape") editor.escape(); else editor.key(input);
    const boundaries = new Set([0, editor.value.length, ...[...segmenter.segment(editor.value)].map((item) => item.index)]);
    assert.ok(editor.cursor >= 0 && editor.cursor <= editor.value.length, `cursor ${editor.cursor} outside ${editor.value.length}`);
    assert.ok(boundaries.has(editor.cursor), `cursor ${editor.cursor} splits a grapheme in ${JSON.stringify(editor.value)}`);
  }
});
