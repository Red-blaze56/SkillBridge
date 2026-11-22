import { ResumeDetail, ResumeSummary } from '@skillbridge/shared';
import { api } from '../api.ts';

/** Mirrors MAX_BYTES in packages/resume and MAX_RESUMES_PER_STUDENT in apps/api. */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MAX_RESUMES = 5;

/** GET /api/resumes — the student's resumes, newest first. */
export async function listResumes(): Promise<ResumeSummary[]> {
  return ResumeSummary.array().parse(await api<unknown>('/resumes'));
}

/** GET /api/resumes/:id — one resume with its passages, hidden text and quality notes. */
export async function getResume(id: string): Promise<ResumeDetail> {
  return ResumeDetail.parse(await api<unknown>(`/resumes/${id}`));
}

/**
 * POST /api/resumes — the PDF itself is the request body. The file name travels
 * in X-File-Name because the body has no room for it.
 */
export async function uploadResume(file: File): Promise<ResumeDetail> {
  return ResumeDetail.parse(
    await api<unknown>('/resumes', {
      method: 'POST',
      raw: file,
      headers: {
        'Content-Type': 'application/pdf',
        'X-File-Name': encodeURIComponent(file.name),
      },
    }),
  );
}

/** DELETE /api/resumes/:id — answers 204. */
export async function deleteResume(id: string): Promise<void> {
  await api<void>(`/resumes/${id}`, { method: 'DELETE' });
}
