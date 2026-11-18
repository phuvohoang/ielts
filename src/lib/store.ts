import { create } from "zustand";
import { db, type Attempt, type Progress, type Writing } from "./db";
export const useLearning = create<{
  attempts: Attempt[];
  progress: Progress[];
  writing: Writing[];
  error: string;
  refresh: () => Promise<void>;
}>((set) => ({
  attempts: [],
  progress: [],
  writing: [],
  error: "",
  refresh: async () => {
    try {
      const [attempts, progress, writing] = await Promise.all([
        db.attempts.toArray(),
        db.progress.toArray(),
        db.writing.toArray(),
      ]);
      set({ attempts, progress, writing, error: "" });
    } catch {
      set({
        error:
          "Local storage could not be opened. Enable browser storage and reload.",
      });
    }
  },
}));
