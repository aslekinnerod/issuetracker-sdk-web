import type { Runtime, IssueReportType, Breadcrumb, CrashReport } from './runtime';
import { callFunction, type CreateIssueResult } from './transport';
import { reporterPayload } from './identity';
import { snapshotBreadcrumbs } from './breadcrumbs';
import { collectContext } from './context';

export interface ReportDraft {
  title: string;
  description?: string;
  type?: IssueReportType;
  screenshotDataUrl?: string;
  crashReport?: CrashReport;
}

function dataUrlParts(dataUrl: string): { contentType: string; base64: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid data URL');
  return { contentType: match[1], base64: match[2] };
}

export async function submitReport(rt: Runtime, draft: ReportDraft): Promise<CreateIssueResult> {
  const payload: Record<string, unknown> = {
    apiKey: rt.apiKey,
    title: draft.title,
    type: draft.type ?? 'bug',
    context: collectContext(),
    reporter: reporterPayload(),
  };
  if (draft.description) payload.description = draft.description;
  if (draft.screenshotDataUrl) {
    const { contentType, base64 } = dataUrlParts(draft.screenshotDataUrl);
    payload.screenshot = {
      base64,
      contentType,
      name: `screenshot-${Math.floor(Date.now() / 1000)}.jpg`,
    };
  }
  if (draft.crashReport) payload.crashReport = draft.crashReport;
  const crumbs = snapshotBreadcrumbs();
  if (crumbs.length > 0) {
    payload.breadcrumbs = crumbs.map((c: Breadcrumb) => ({
      timestamp: c.timestamp,
      action: c.action,
      ...(c.metadata ? { metadata: c.metadata } : {}),
    }));
  }
  return callFunction<CreateIssueResult>(rt.endpoint, 'createIssueFromSdk', payload);
}
