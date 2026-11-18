import { create } from "zustand";
import { db, type Attempt, type Progress, type Writing } from "./db";
export const useLearning = create<{
  attempts: Attempt[];
  progress: Progress[];
  writing: Writing[];
  error: string;
  loaded: boolean;
  refresh: () => Promise<void>;
}>((set) => ({
  attempts: [],
  progress: [],
  writing: [],
  error: "",
  loaded: false,
  refresh: async () => {
    try {
      const [attempts, progress, writing] = await Promise.all([
        db.attempts.toArray(),
        db.progress.toArray(),
        db.writing.toArray(),
      ]);
      set({ attempts, progress, writing, error: "", loaded: true });
    } catch {
      set({
        loaded: true,
        error:
          "Local storage could not be opened. Enable browser storage and reload.",
      });
    }
  },
}));
