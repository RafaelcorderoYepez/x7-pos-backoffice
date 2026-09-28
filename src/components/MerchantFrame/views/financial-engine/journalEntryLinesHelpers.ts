import type { JournalEntry, JournalEntryLine, LedgerAccount } from '../../../../types/accounting';

export interface FlattenedJournalEntryLine {
  key: string;
  line: JournalEntryLine;
  entry: JournalEntry;
}

export function flattenJournalEntryLines(entries: JournalEntry[]): FlattenedJournalEntryLine[] {
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) =>
    (entry?.lines || []).map((line) => ({ key: `${entry?.id ?? '0'}-${line?.id ?? Math.random()}`, line, entry })),
  );
}

export function isLeafAccount(account: LedgerAccount | null | undefined, accounts: LedgerAccount[]): boolean {
  if (!account) return false;
  if (!Array.isArray(accounts)) return true;
  return !accounts.some((a) => a && a.parent_account_id === account.id && a.is_active);
}
