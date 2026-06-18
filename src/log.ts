import { appendFileSync } from "node:fs";

type Level = "DEBUG" | "INFO" | "WARNING" | "ERROR";
const ORDER: Record<Level, number> = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40 };
const level = (process.env.YD_LOG_LEVEL || "INFO").toUpperCase() as Level;
const threshold = ORDER[level] ?? 20;
export const LOG_BODIES = (process.env.YD_LOG_BODIES || "").toLowerCase() === "true";

const logFile = process.env.YD_LOG_FILE || "";

function emit(l: Level, msg: string): void {
  if (ORDER[l] < threshold) return;
  const line = `${l} ${msg}\n`;
  process.stderr.write(line);
  if (logFile) {
    try { appendFileSync(logFile, line); } catch { /* ignore file errors */ }
  }
}

export const log = {
  debug: (m: string) => emit("DEBUG", m),
  info: (m: string) => emit("INFO", m),
  warning: (m: string) => emit("WARNING", m),
  error: (m: string) => emit("ERROR", m),
};
