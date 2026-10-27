// Deleting a role from the tracker used to leave its "Pending to Apply/<Company>"
// folder behind (14 Oct 2026: four orphan folders from locally-deleted roles).
// This removes that folder, and only that folder, when it is safe to.
import fs from 'node:fs/promises';
import path from 'node:path';

const PENDING = 'Pending to Apply';

/**
 * Remove the unapplied drafts folder of a deleted entry.
 *
 * Refuses (returns false) unless ALL hold:
 *  - the entry never left `researching` (applied/interview/offer/declined folders are history)
 *  - the folder is exactly one level under "<careerDir>/Pending to Apply/"
 *  - no remaining entry still points at the same folder (companies with two roles share one)
 *
 * @param {{careerDir:string, entry:object, remaining:object[], fallbackDir:(e:object)=>string}} p
 */
export async function deletePendingFolder({ careerDir, entry, remaining, fallbackDir }) {
  if (entry.status && entry.status !== 'researching') return false;
  const rel = entry.folderPath || fallbackDir(entry);
  if (!rel || typeof rel !== 'string') return false;

  const pendingRoot = path.resolve(careerDir, PENDING);
  const resolved = path.resolve(careerDir, rel);
  if (path.dirname(resolved) !== pendingRoot) return false;

  const sameFolder = (e) => {
    const r = e.folderPath || (e.status === 'researching' || !e.status ? fallbackDir(e) : '');
    return r && path.resolve(careerDir, r) === resolved;
  };
  if (remaining.some(sameFolder)) return false;

  try {
    await fs.access(resolved);
  } catch {
    return false;
  }
  await fs.rm(resolved, { recursive: true, force: true });
  return true;
}
