/**
 * Saving a generated file. Inside a claude.ai artifact viewer pages may not download
 * directly; the `downloads` capability asks the viewer instead. Elsewhere an <a download> works.
 */
type DownloadsApi = { save(r: { filename: string; data: Blob | string }): Promise<{ status: 'saved' | 'delivered' }> };
type ClaudeUse = { use(name: 'downloads'): Promise<DownloadsApi | null> };

let api: Promise<DownloadsApi | null> | null = null;
function downloadsApi(): Promise<DownloadsApi | null> {
  const c = (window as unknown as { claude?: ClaudeUse }).claude;
  if (!c?.use) return Promise.resolve(null);
  api ??= c.use('downloads').catch(() => null);
  return api;
}

/** The artifact viewer only accepts common extensions; a .bwproj is a zip, so it travels as .bwproj.zip there. */
const ALLOWED = /\.(gif|png|jpe?g|webp|mp4|webm|txt|json|md|docx|pptx|epub|csv|ttf|html|svg|pdf|xlsx|zip)$/i;

export type SaveOutcome = 'saved' | 'declined' | 'browser';

export async function saveFile(filename: string, data: Blob): Promise<SaveOutcome> {
  const d = await downloadsApi();
  if (d) {
    const name = ALLOWED.test(filename) ? filename : `${filename}.zip`;
    try {
      await d.save({ filename: name, data });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'declined') return 'declined';
      if (code !== 'unavailable' && code !== 'not_granted' && code !== 'capability_disabled')
        throw new Error((e as { message?: string }).message ?? 'Could not save the file.');
    }
  }
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'browser';
}
