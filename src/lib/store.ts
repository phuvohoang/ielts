import type { LearningProgress } from "./learning-model";
import { create } from "zustand";
import { db, type Attempt, type Progress, type Writing } from "./db";
export const useLearning = create<{
  attempts: Attempt[];
  progress: Progress[];
  writing: Writing[];
  lessons: LearningProgress[];
  error: string;
  loaded: boolean;
  refresh: () => Promise<void>;
}>((set) => ({
  attempts: [],
  progress: [],
  writing: [],
  lessons: [],
  error: "",
  loaded: false,
  refresh: async () => {
    try {
      const [attempts, progress, writing, lessons] = await Promise.all([
        db.attempts.toArray(),
        db.progress.toArray(),
        db.writing.toArray(),
        db.lessons.toArray(),
      ]);
      set({ attempts, progress, writing, lessons, error: "", loaded: true });
    } catch {
      set({
        loaded: true,
        error:
          "Local storage could not be opened. Enable browser storage and reload.",
      });
    }
  },
}));
