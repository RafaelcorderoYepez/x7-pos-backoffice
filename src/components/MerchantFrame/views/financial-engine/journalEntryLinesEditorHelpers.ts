import type { CreateJournalEntryLineDto } from '../../../../types/accounting';

export interface JournalEntryLineDraft {
  key: string;
  account_id: number | null;
  accountQuery: string;
  debit: string;
  credit: string;
  description: string;
}

let lineKeySeq = 0;
export function createEmptyLine(): JournalEntryLineDraft {
  lineKeySeq += 1;
  return {
    key: `line-${lineKeySeq}`,
    account_id: null,
    accountQuery: '',
    debit: '',
    credit: '',
    description: '',
  };
}

export function computeLineTotals(lines: JournalEntryLineDraft[]): {
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
} {
  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  return { totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.001 };
}

export function toCreateLineDtos(lines: JournalEntryLineDraft[]): CreateJournalEntryLineDto[] {
  return lines
    .filter((l) => l.account_id != null && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
    .map((l) => ({
      account_id: l.account_id as number,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      ...(l.description.trim() ? { description: l.description.trim() } : {}),
    }));
}

export function linesAreValidAndBalanced(lines: JournalEntryLineDraft[]): boolean {
  const dtos = toCreateLineDtos(lines);
  if (dtos.length === 0) return false;
  const totalDebit = dtos.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = dtos.reduce((sum, l) => sum + l.credit, 0);
  return totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.001;
}
