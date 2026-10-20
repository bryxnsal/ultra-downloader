import { Language } from "../../../shared/i18n";

export interface CustomTheme {
  id: string;
  name: string;
  bgPrimary: string;
  bgSecondary: string;
  bgSurface: string;
  border: string;
  textMain: string;
  textMuted: string;
  accent: string;
  accentMuted?: string;
}

export type PresetTheme = "matrix" | "amber" | "cyan" | "mono" | "dracula";
export type Theme = PresetTheme | string;
export type ColorMode = "dark" | "light" | "auto";

export type ConnectionSpeedType = "low" | "medium" | "high" | "lan_turbo";

export interface SettingsState {
  language: Language;
  colorMode: ColorMode;
  theme: Theme;
  customThemes?: CustomTheme[];
  maxConnectionsNumber: number;
  connectionType: ConnectionSpeedType;
  speedLimitEnabled: boolean;
  speedLimitBytesSec: number;
  tempPath: string;
  saveToDefault: string;
  autoAssemble: boolean;
  virusScanEnabled: boolean;
  virusScanCmd: string;
  ffmpegPath: string;
  autostartEnabled: boolean;
  nativeMessagingEnabled: boolean;
  interceptExtensions: string;
  exceptionServers: string;
  grabberTheme: Theme;
}

export const DEFAULT_SETTINGS: SettingsState = {
  language: "en",
  colorMode: "dark",
  theme: "matrix",
  customThemes: [],
  maxConnectionsNumber: 16,
  connectionType: "lan_turbo",
  speedLimitEnabled: false,
  speedLimitBytesSec: 10485760,
  tempPath: "",
  saveToDefault: "",
  autoAssemble: true,
  virusScanEnabled: false,
  virusScanCmd: "",
  ffmpegPath: "",
  autostartEnabled: false,
  nativeMessagingEnabled: true,
  interceptExtensions: "3GP 7Z AAC ACE AVI BIN BZ2 EXE GZ GZIP IMG ISO LZH M4A M4V MKV MOV MP3 MP4 MSI PDF RAR TAR ZIP",
  exceptionServers: "*.update.microsoft.com download.windowsupdate.com siteseal.thawte.com",
  grabberTheme: "same_as_app",
};
