export const theme = {
  reset: "\x1b[0m",
  bold: "\x1b[1;38;2;150;222;255m",
  dim: "\x1b[2;38;2;91;139;181m",
  red: "\x1b[38;2;86;169;255m",
  green: "\x1b[38;2;89;206;255m",
  yellow: "\x1b[38;2;135;213;255m",
  blue: "\x1b[38;2;70;145;255m",
  cyan: "\x1b[38;2;88;199;255m",
  magenta: "\x1b[38;2;116;164;255m",
  white: "\x1b[38;2;191;232;255m",
  gray: "\x1b[38;2;92;143;184m"
} as const;

export function color(value: string, code: string): string {
  return `${code}${value.replaceAll(theme.reset, `${theme.reset}${code}`)}${theme.reset}`;
}
