import React from 'react';
import type { LedgerAccount } from '../../../../types/accounting';

import {
  TYPE_BADGE_CLASSES,
  resolveParentLabel,
  buildTree,
  type TreeNode,
} from './ledgerAccountTreeHelpers';

function subtreeMatches(
  node: TreeNode,
  matches: (account: LedgerAccount) => boolean,
  visited: Set<number> = new Set(),
): boolean {
  if (visited.has(node.id)) return false;
  visited.add(node.id);
  if (matches(node)) return true;
  return node.children.some((child) => subtreeMatches(child, matches, visited));
}

interface LedgerAccountTreeProps {
  accounts: LedgerAccount[];
  matches: (account: LedgerAccount) => boolean;
  onEdit: (account: LedgerAccount) => void;
  onViewDetails: (account: LedgerAccount) => void;
  onToggleStatus: (account: LedgerAccount) => void;
}

export const LedgerAccountTree: React.FC<LedgerAccountTreeProps> = ({
  accounts,
  matches,
  onEdit,
  onViewDetails,
  onToggleStatus,
}) => {
  const tree = React.useMemo(() => buildTree(accounts), [accounts]);
  const accountsById = React.useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const renderNode = (node: TreeNode, depth: number, ancestorIds: Set<number>): React.ReactNode => {
    if (ancestorIds.has(node.id)) {
      return (
        <tr key={`cycle-${node.id}-${depth}`}>
          <td
            colSpan={6}
            className="px-6 py-2 text-[11px] text-red-600 font-semibold"
            style={{ paddingLeft: depth * 20 + 24 }}
          >
            Circular reference detected ({node.code})
          </td>
        </tr>
      );
    }

    if (!subtreeMatches(node, matches)) return null;

    const nextAncestors = new Set(ancestorIds).add(node.id);
    const parent = resolveParentLabel(node, accountsById);

    return (
      <React.Fragment key={node.id}>
        <tr
          data-testid={`ledger-account-row-${node.id}`}
          onClick={() => onViewDetails(node)}
          className={`hover:bg-[#f8f3eb] transition-colors cursor-pointer ${!node.is_active ? 'opacity-75' : ''}`}
        >
          <td className="px-6 py-4" style={{ paddingLeft: depth * 24 + 24 }}>
            <div className="flex items-center gap-1.5">
              {depth > 0 && (
                <span className="material-symbols-outlined text-[#8a8880] text-[16px] select-none">
                  subdirectory_arrow_right
                </span>
              )}
              <span className="font-bold text-[#1d1c17]">{node.code}</span>
            </div>
          </td>
          <td className="px-6 py-4 text-[#1d1c17]">{node.name}</td>
          <td className="px-6 py-4 text-center">
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${TYPE_BADGE_CLASSES[node.type]}`}
            >
              {node.type}
            </span>
          </td>
          <td className="px-6 py-4">
            <span className={parent.kind === 'missing' ? 'text-red-600 text-sm' : 'text-sm text-[#5f5e5e]'}>
              {parent.label}
            </span>
          </td>
          <td className="px-6 py-4 text-center">
            {node.is_active ? (
              <span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                Active
              </span>
            ) : (
              <span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                Inactive
              </span>
            )}
          </td>
          <td className="px-6 py-4 text-center">
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(node);
                }}
                aria-label={`Edit ${node.code}`}
                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">edit</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStatus(node);
                }}
                aria-label={node.is_active ? `Deactivate ${node.code}` : `Activate ${node.code}`}
                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {node.is_active ? 'block' : 'check_circle'}
                </span>
              </button>
            </div>
          </td>
        </tr>
        {node.children.map((child) => renderNode(child, depth + 1, nextAncestors))}
      </React.Fragment>
    );
  };

  return <>{tree.map((root) => renderNode(root, 0, new Set()))}</>;
};

export default LedgerAccountTree;
