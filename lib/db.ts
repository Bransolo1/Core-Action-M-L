/**
 * Server-side JSON file store for team collaboration.
 * Stores all app data in /data/app-data.json on the server.
 * Multiple team members pointing at the same server share data automatically.
 */
import fs from "fs";
import path from "path";
import type { AppState } from "@/store/app-store";
import { INITIAL_STATE } from "@/store/app-store";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "app-data.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readDb(): AppState {
  ensureDir();
  try {
    if (!fs.existsSync(DATA_FILE)) return INITIAL_STATE;
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return { ...INITIAL_STATE, ...(JSON.parse(raw) as AppState) };
  } catch {
    return INITIAL_STATE;
  }
}

export function writeDb(state: AppState): void {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf-8");
}
