import type { AccountType, LedgerAccount } from '../../../../types/accounting';

export const TYPE_BADGE_CLASSES: Record<AccountType, string> = {
  ASSET: 'bg-blue-500/10 text-blue-600',
  LIABILITY: 'bg-amber-500/10 text-amber-600',
  EQUITY: 'bg-purple-500/10 text-purple-600',
  REVENUE: 'bg-green-500/10 text-green-600',
  EXPENSE: 'bg-orange-500/10 text-orange-600',
};

export function resolveParentLabel(
  account: LedgerAccount,
  accountsById: Map<number, LedgerAccount>,
): { label: string; kind: 'root' | 'resolved' | 'missing' } {
  if (account.parent_account_id == null) {
    return { label: 'Root Account', kind: 'root' };
  }
  const parent = accountsById.get(account.parent_account_id);
  if (!parent) {
    return { label: 'Parent not found', kind: 'missing' };
  }
  return { label: `${parent.code} — ${parent.name}`, kind: 'resolved' };
}

export interface TreeNode extends LedgerAccount {
  children: TreeNode[];
}

export function buildTree(accounts: LedgerAccount[]): TreeNode[] {
  const map = new Map<number, TreeNode>(accounts.map((a) => [a.id, { ...a, children: [] }]));
  const roots: TreeNode[] = [];

  for (const a of accounts) {
    const node = map.get(a.id)!;
    if (a.parent_account_id != null && a.parent_account_id !== a.id && map.has(a.parent_account_id)) {
      map.get(a.parent_account_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Defensive: any node not reachable from a declared root (e.g. a pure
  // parent<->child cycle) is surfaced as its own root instead of being
  // silently dropped from the tree.
  const reachable = new Set<number>();
  const visit = (node: TreeNode) => {
    if (reachable.has(node.id)) return;
    reachable.add(node.id);
    node.children.forEach(visit);
  };
  roots.forEach(visit);

  for (const a of accounts) {
    if (!reachable.has(a.id)) {
      const node = map.get(a.id)!;
      roots.push(node);
      visit(node);
    }
  }

  return roots;
}

export function getDescendantIds(tree: TreeNode[], accountId: number): Set<number> {
  const ids = new Set<number>();

  const findNode = (nodes: TreeNode[]): TreeNode | null => {
    for (const node of nodes) {
      if (node.id === accountId) return node;
      const found = findNode(node.children);
      if (found) return found;
    }
    return null;
  };

  const collect = (node: TreeNode) => {
    for (const child of node.children) {
      ids.add(child.id);
      collect(child);
    }
  };

  const target = findNode(tree);
  if (target) collect(target);

  return ids;
}
