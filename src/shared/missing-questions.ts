/**
 * Application questions a bot had no saved answer for, collected in
 * output/missing_questions.json so you can answer them all after a run.
 * Each answer then goes into that bot's data/<bot>_answers.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { OUTPUT_ROOT } from '../reports/csv.js';

export const MISSING_FILE = path.join(OUTPUT_ROOT, 'missing_questions.json');

export interface MissingQuestion {
  bots:     string[];
  options:  string[];
  required: boolean;
  seen:     number;
  lastJob:  string;
  lastSeen: string;
}

function load(): Record<string, MissingQuestion> {
  try {
    return JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function recordMissingQuestion(
  bot: string,
  question: string,
  info: { options?: string[]; required?: boolean; job?: string },
): void {
  const all = load();
  const prev = all[question];
  all[question] = {
    bots:     [...new Set([...(prev?.bots ?? []), bot])],
    options:  info.options?.length ? info.options : prev?.options ?? [],
    required: Boolean(info.required || prev?.required),
    seen:     (prev?.seen ?? 0) + 1,
    lastJob:  info.job ?? prev?.lastJob ?? '',
    lastSeen: new Date().toISOString().slice(0, 10),
  };
  fs.mkdirSync(path.dirname(MISSING_FILE), { recursive: true });
  fs.writeFileSync(MISSING_FILE, JSON.stringify(all, null, 2) + '\n');
}

/** Drops questions that now have a saved answer. */
export function forgetMissingQuestion(question: string): void {
  const all = load();
  if (!(question in all)) return;
  delete all[question];
  fs.writeFileSync(MISSING_FILE, JSON.stringify(all, null, 2) + '\n');
}
