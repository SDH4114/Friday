import { Type } from "@earendil-works/pi-ai";
import type { RayaTool } from "../types/tool.js";
import { mutateMemory } from "../memory/store.js";
const Params = Type.Object({ action: Type.Union([Type.Literal("add"),Type.Literal("replace"),Type.Literal("remove")]), target: Type.Union([Type.Literal("memory"),Type.Literal("user")]), content: Type.Optional(Type.String()), old_text: Type.Optional(Type.String()) });
export function createMemoryTool(): RayaTool<typeof Params> { return { name:"memory", label:"Memory", description:"Persist a compact durable fact. Use user for preferences/profile and memory for environment, projects and lessons. Supports add, replace, remove.", parameters:Params, executionMode:"sequential", async execute(_id,p){ const result=mutateMemory(p.action,p.target,p.content,p.old_text); return {content:[{type:"text",text:result}],details:{result}}; } }; }
