const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

export function normalizePiPackageName(input: string): string {
  const name = input.replace(/^npm:/, "").trim();
  if (!PACKAGE_NAME.test(name)) {
    throw new Error("Pi package must be a plain npm package name, for example npm:pi-subagents or npm:@scope/package.");
  }
  return name;
}
