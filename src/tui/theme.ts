export const THEME_IDS = ["ocean", "sunset"] as const;
export type ThemeId = typeof THEME_IDS[number];

export const themeLabels: Record<ThemeId, string> = {
  ocean: "Ocean Blue",
  sunset: "Sunset Red"
};

type ThemePalette = {
  reset: string;
  bold: string;
  dim: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  cyan: string;
  magenta: string;
  white: string;
  gray: string;
  diffAdded: string;
  diffRemoved: string;
};

const palettes: Record<ThemeId, ThemePalette> = {
  ocean: {
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
    gray: "\x1b[38;2;92;143;184m",
    diffAdded: "\x1b[48;2;20;104;55;38;2;238;255;242m",
    diffRemoved: "\x1b[48;2;145;28;48;38;2;255;238;241m"
  },
  sunset: {
    reset: "\x1b[0m",
    bold: "\x1b[1;38;2;255;93;115m",
    dim: "\x1b[2;38;2;174;74;92m",
    red: "\x1b[38;2;255;59;77m",
    green: "\x1b[38;2;255;138;61m",
    yellow: "\x1b[38;2;255;159;67m",
    blue: "\x1b[38;2;255;79;129m",
    cyan: "\x1b[38;2;255;112;84m",
    magenta: "\x1b[38;2;255;61;142m",
    white: "\x1b[38;2;255;209;190m",
    gray: "\x1b[38;2;190;91;102m",
    diffAdded: "\x1b[48;2;20;104;55;38;2;238;255;242m",
    diffRemoved: "\x1b[48;2;145;28;48;38;2;255;238;241m"
  }
};

// Keep one stable object because renderers import it by reference.
export const theme: ThemePalette = { ...palettes.ocean };
let activeTheme: ThemeId = "ocean";

export function setActiveTheme(id: ThemeId): void {
  activeTheme = id;
  Object.assign(theme, palettes[id]);
}

export function getActiveTheme(): ThemeId {
  return activeTheme;
}

export function color(value: string, code: string): string {
  return `${code}${value.replaceAll(theme.reset, `${theme.reset}${code}`)}${theme.reset}`;
}
