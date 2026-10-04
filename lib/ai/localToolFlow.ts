import { executeLocalTool, isLocalTool, localToolFailureMessage, LocalToolContext, LocalToolName } from './localTools';

export type LocalToolStatus = 'pending_confirm' | 'running' | 'ok' | 'error' | 'rejected';

export interface LocalToolFlowItem {
  id: string;
  name: string;
  preview: string;
  status: LocalToolStatus;
  args: any;
  resultSummary?: string;
  errorMessage?: string;
  requiresConfirm?: boolean;
}

export interface LocalToolFlowHandlers<T extends LocalToolFlowItem> {
  upsertTool: (tool: T) => void;
  appendAssistantText: (text: string) => void;
  continueWithLocalResult: (tool: T, ok: boolean, result?: any, error?: string) => Promise<void>;
}

export function isReadOnlyLocalTool(name: string): boolean {
  return READ_ONLY_LOCAL_TOOLS.has(name as LocalToolName);
}

export async function runLocalToolFlow<T extends LocalToolFlowItem>(
  tool: T,
  handlers: LocalToolFlowHandlers<T>,
  context?: LocalToolContext,
): Promise<void> {
  if (!isLocalTool(tool.name)) return;
  handlers.upsertTool({ ...tool, status: 'running' });
  try {
    const result = await executeLocalTool(tool.name, tool.args, context);
    const okTool = { ...tool, status: 'ok' as const, resultSummary: result.summary };
    handlers.upsertTool(okTool);
    await handlers.continueWithLocalResult(okTool, true, result.result);
  } catch (err: any) {
    const message = err?.message ?? 'unknown error';
    const errorTool = { ...tool, status: 'error' as const, errorMessage: message };
    handlers.upsertTool(errorTool);
    handlers.appendAssistantText(localToolFailureMessage(tool.name, message));
    await handlers.continueWithLocalResult(errorTool, false, undefined, message);
  }
}

export function localContinuationFailureMessage(tool: LocalToolFlowItem, ok: boolean, error: string): string {
  const prefix = ok
    ? (tool.requiresConfirm === false ? 'I finished the local lookup' : 'Saved locally')
    : 'The local action failed';
  return `${prefix}, but I couldn't continue the AI response: ${error}`;
}

const READ_ONLY_LOCAL_TOOLS = new Set<LocalToolName>([
  'search_local_productivity',
  'summarize_expenses',
  'get_today_productivity',
  'list_memory',
]);
