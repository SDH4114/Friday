import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer(
  { name: "raya-test-mcp", version: "1.0.0" },
  { instructions: "Use echo for deterministic MCP integration tests." }
);

server.registerTool("echo", {
  description: "Echo text through MCP.",
  inputSchema: { text: z.string() },
  annotations: { readOnlyHint: true }
}, async ({ text }) => ({ content: [{ type: "text", text: `echo:${text}` }] }));

server.registerTool("mutate", {
  description: "A test tool that is intentionally not read-only.",
  inputSchema: { value: z.string() }
}, async ({ value }) => ({ content: [{ type: "text", text: `mutated:${value}` }] }));

server.registerResource("sample", "raya://sample", {
  title: "Sample resource",
  mimeType: "text/plain"
}, async (uri) => ({ contents: [{ uri: uri.href, text: "resource-from-mcp" }] }));

server.registerPrompt("welcome", {
  description: "A deterministic test prompt.",
  argsSchema: { name: z.string() }
}, async ({ name }) => ({ messages: [{ role: "user", content: { type: "text", text: `Welcome ${name}` } }] }));

await server.connect(new StdioServerTransport());
