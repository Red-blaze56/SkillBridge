// Job matching: read companies' public job boards, keep fresher-friendly developer jobs,
// and score each against a student's skill gap analysis.
export {
  ATS,
  BOARDS,
  fetchBoard,
  fillDescription,
  isAts,
  ldJsonDescription,
  parseBoard,
  USER_AGENT,
  type Ats,
  type Board,
  type BoardResult,
  type Fetch,
  type Posting,
} from './boards.ts';
export { experience, FRESHER, minYears } from './experience.ts';
export { dropReason, fingerprint, inIndia, isRemote, MAX_AGE_DAYS, MAX_EXPERIENCE_YEARS, titleFits, tooExperienced, type DropReason } from './filters.ts';
export { ENOUGH_LEVEL, matchPosting, type Match, type SkillFit } from './match.ts';
export { rolesFor, skillsIn } from './skills.ts';
export { decodeEntities, stripHtml } from './text.ts';
