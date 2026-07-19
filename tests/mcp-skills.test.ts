import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { normalizeConfig } from "../src/config/config.js";
import { expandMcpValue, formatMcpStatusLines, McpRuntime } from "../src/mcp/client.js";
import { createDefaultTools } from "../src/tools/index.js";

test("MCP config is normalized with visible enabled and safety settings", () => {
  const config = normalizeConfig({
    mcpServers: {
      files: { transport: "stdio", command: "npx", args: ["server.js"] },
      remote: { transport: "http", url: "https://example.com/mcp", enabled: false }
    }
  });
  assert.equal(config.mcpServers.files?.enabled, true);
  assert.equal(config.mcpServers.files?.approval, "writes");
  assert.equal(config.mcpServers.remote?.enabled, false);
  assert.equal(config.mcpServers.remote?.transport, "http");
  assert.throws(() => normalizeConfig({ mcpServers: { "bad name": { transport: "stdio", command: "node" } } }));
});

test("skill authoring is exposed only in Build mode", () => {
  const plan = createDefaultTools(normalizeConfig({ mode: "plan" })).map((tool) => tool.name);
  const build = createDefaultTools(normalizeConfig({ mode: "build" })).map((tool) => tool.name);
  assert.equal(plan.includes("create_skill"), false);
  assert.equal(build.includes("create_skill"), true);
  assert.equal(plan.includes("use_skill"), true);
});

test("MCP environment placeholders resolve without writing secrets to config", () => {
  assert.equal(expandMcpValue("Bearer ${TOKEN}", { TOKEN: "secret" }), "Bearer secret");
  assert.throws(() => expandMcpValue("${MISSING}", {}), /not set: MISSING/);
});

test("MCP status output clearly separates enabled, unavailable, and disabled servers", () => {
  const lines = formatMcpStatusLines([
    { name: "files", enabled: true, connected: true, transport: "stdio", tools: 4 },
    { name: "remote", enabled: true, connected: false, transport: "http", tools: 0, error: "timeout" },
    { name: "legacy", enabled: false, connected: false, transport: "stdio", tools: 0 }
  ]).join("\n");
  assert.match(lines, /files\s+Enabled · Connected · stdio · 4 tools/);
  assert.match(lines, /remote\s+Enabled · Unavailable · http · timeout/);
  assert.match(lines, /legacy\s+Disabled · stdio/);
});

test("stdio MCP tools, resources, prompts, instructions, and safety work end to end", async () => {
  const fixture = join(process.cwd(), "tests", "fixtures", "mcp-server.ts");
  const config = normalizeConfig({
    mode: "build",
    mcpServers: {
      test: {
        transport: "stdio",
        command: process.execPath,
        args: ["--import", "tsx", fixture],
        timeoutMs: 15_000,
        toolTimeoutMs: 15_000
      }
    }
  });
  const mcp = await McpRuntime.connect(config, { clientVersion: "test", strict: true });
  try {
    assert.equal(mcp.connectedCount, 1);
    assert.match(mcp.instructions, /deterministic MCP integration tests/);
    const tools = mcp.createTools(config);
    const echo = tools.find((tool) => tool.name === "mcp_test_echo");
    assert.ok(echo);
    const echoResult = await echo.execute("echo", { text: "hello" });
    assert.equal(echoResult.content[0]?.type, "text");
    assert.equal(echoResult.content[0]?.type === "text" ? echoResult.content[0].text : "", "echo:hello");

    const resources = tools.find((tool) => tool.name === "mcp_list_resources");
    assert.ok(resources);
    const resourceResult = await resources.execute("resources", {});
    assert.match(resourceResult.content[0]?.type === "text" ? resourceResult.content[0].text : "", /raya:\/\/sample/);

    const prompts = tools.find((tool) => tool.name === "mcp_get_prompt");
    assert.ok(prompts);
    const promptResult = await prompts.execute("prompt", { server: "test", name: "welcome", arguments: { name: "Raya" } });
    assert.match(promptResult.content[0]?.type === "text" ? promptResult.content[0].text : "", /Welcome Raya/);

    const planTools = mcp.createTools({ ...config, mode: "plan" });
    const mutate = planTools.find((tool) => tool.name === "mcp_test_mutate");
    assert.ok(mutate);
    await assert.rejects(() => mutate.execute("mutate", { value: "x" }), /Switch to Build mode/);
  } finally {
    await mcp.close();
  }
});

test("Streamable HTTP MCP servers connect and expose callable tools", async (context) => {
  const server = new McpServer({ name: "http-test", version: "1.0.0" });
  server.registerTool("ping", {
    inputSchema: { value: z.string() },
    annotations: { readOnlyHint: true }
  }, async ({ value }) => ({ content: [{ type: "text", text: `pong:${value}` }] }));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true });
  await server.connect(transport);
  const http = createServer((request, response) => {
    void transport.handleRequest(request, response).catch((error) => {
      if (!response.headersSent) response.writeHead(500, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      http.once("error", reject);
      http.listen(0, "127.0.0.1", resolve);
    });
  } catch (error) {
    await server.close();
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      context.skip("Local listening sockets are disabled in this sandbox.");
      return;
    }
    throw error;
  }
  const address = http.address();
  assert.ok(address && typeof address === "object");
  const config = normalizeConfig({
    mode: "plan",
    mcpServers: { remote: { transport: "http", url: `http://127.0.0.1:${address.port}/mcp` } }
  });
  const mcp = await McpRuntime.connect(config, { clientVersion: "test", strict: true });
  try {
    const ping = mcp.createTools(config).find((tool) => tool.name === "mcp_remote_ping");
    assert.ok(ping);
    const result = await ping.execute("ping", { value: "http" });
    assert.equal(result.content[0]?.type === "text" ? result.content[0].text : "", "pong:http");
  } finally {
    await mcp.close();
    await server.close();
    await new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve()));
  }
});

test("first Raya config load installs built-in skills without replacing user files", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-builtins-"));
  try {
    const script = [
      'import { loadConfig } from "./src/config/config.ts";',
      'import { listAvailableSkills } from "./src/skills/loader.ts";',
      'loadConfig();',
      'console.log(JSON.stringify(listAvailableSkills().map((skill) => skill.name).sort()));'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(),
      env: { ...process.env, RAYA_HOME: home },
      encoding: "utf8"
    });
    const names = JSON.parse(output) as string[];
    assert.deepEqual(names, ["create-raya-skills", "debugging", "implementation", "project-audit", "raya-self-knowledge", "web-research"]);
    assert.equal(existsSync(join(home, "skills", "debugging", "SKILL.md")), true);
    assert.match(readFileSync(join(home, "skills", "implementation", "SKILL.md"), "utf8"), /Finish working behavior/);
    const customized = join(home, "skills", "debugging", "SKILL.md");
    writeFileSync(customized, "# My customized debugging skill\n", "utf8");
    execFileSync(process.execPath, ["--import", "tsx", "-e", 'import { loadConfig } from "./src/config/config.ts"; loadConfig();'], {
      cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8"
    });
    assert.equal(readFileSync(customized, "utf8"), "# My customized debugging skill\n");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("skill catalog uses metadata and loads full instructions progressively", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-skill-catalog-"));
  try {
    const script = [
      'import { loadConfig } from "./src/config/config.ts";',
      'import { loadSkillContext } from "./src/skills/loader.ts";',
      'loadConfig();',
      'console.log(loadSkillContext());'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8"
    });
    assert.match(output, /raya-self-knowledge: Understand Raya's identity/);
    assert.match(output, /create-raya-skills: Create or update reusable Raya skills/);
    assert.doesNotMatch(output, /# Raya Self Knowledge/);
    assert.doesNotMatch(output, /## Repair or Improve Raya/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Build mode can create a persistent skill and load its references", () => {
  const home = mkdtempSync(join(tmpdir(), "raya-create-skill-"));
  try {
    const script = [
      'import { createSkillAuthoringTool } from "./src/tools/skill-authoring.ts";',
      'import { createUseSkillTool } from "./src/tools/skill.ts";',
      'const created = await createSkillAuthoringTool().execute("create", {',
      'name: "release-check", description: "Verify a release. Use before publishing a Raya package.",',
      'instructions: "# Release Check\\n\\nRun checks and report evidence.",',
      'references: [{ filename: "commands.md", content: "# Commands\\n\\nRun the project tests." }] });',
      'const skill = await createUseSkillTool().execute("use", { name: "release-check" });',
      'const reference = await createUseSkillTool().execute("ref", { name: "release-check", reference: "commands.md" });',
      'console.log(JSON.stringify({ created: created.details, skill: skill.content[0], reference: reference.content[0] }));'
    ].join("");
    const output = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: process.cwd(), env: { ...process.env, RAYA_HOME: home }, encoding: "utf8"
    });
    const result = JSON.parse(output) as { created: { updated: boolean }; skill: { text: string }; reference: { text: string } };
    assert.equal(result.created.updated, false);
    assert.match(result.skill.text, /name: release-check/);
    assert.match(result.skill.text, /references\/commands\.md/);
    assert.match(result.reference.text, /Run the project tests/);
    assert.equal(existsSync(join(home, "skills", "release-check", "SKILL.md")), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
