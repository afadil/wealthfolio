"use client";

import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { ChevronRight, Folder, FolderOpen, File } from "lucide-react";
import { cn } from "@/lib/utils";

// Types
export interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  icon?: React.ReactNode;
  data?: unknown;
}

interface TreeViewProps {
  data: TreeNode[];
  selectedId?: string | null;
  onSelect?: (node: TreeNode) => void;
  className?: string;
  expandedIds?: Set<string>;
  onExpandedChange?: (expandedIds: Set<string>) => void;
  defaultExpandedIds?: string[];
}

interface TreeItemProps {
  node: TreeNode;
  level: number;
  selectedId?: string | null;
  onSelect?: (node: TreeNode) => void;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}

// TreeItem component (recursive)
function TreeItem({
  node,
  level,
  selectedId,
  onSelect,
  expandedIds,
  onToggle,
}: TreeItemProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <div className="select-none">
      <CollapsiblePrimitive.Root
        open={isExpanded}
        onOpenChange={() => hasChildren && onToggle(node.id)}
      >
        <div
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors",
            "hover:bg-muted/50",
            isSelected && "bg-accent text-accent-foreground",
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => onSelect?.(node)}
        >
          {hasChildren ? (
            <CollapsiblePrimitive.Trigger asChild>
              <button
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(node.id);
                }}
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    isExpanded && "rotate-90",
                  )}
                />
              </button>
            </CollapsiblePrimitive.Trigger>
          ) : (
            <span className="w-5" />
          )}

          <span className="shrink-0 text-muted-foreground">
            {node.icon ? (
              node.icon
            ) : hasChildren ? (
              isExpanded ? (
                <FolderOpen className="h-4 w-4" />
              ) : (
                <Folder className="h-4 w-4" />
              )
            ) : (
              <File className="h-4 w-4" />
            )}
          </span>

          <span className="truncate">{node.name}</span>
        </div>

        {hasChildren && (
          <CollapsiblePrimitive.Content className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
            {node.children!.map((child) => (
              <TreeItem
                key={child.id}
                node={child}
                level={level + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                expandedIds={expandedIds}
                onToggle={onToggle}
              />
            ))}
          </CollapsiblePrimitive.Content>
        )}
      </CollapsiblePrimitive.Root>
    </div>
  );
}

// Main TreeView component
export function TreeView({
  data,
  selectedId,
  onSelect,
  className,
  expandedIds: controlledExpandedIds,
  onExpandedChange,
  defaultExpandedIds = [],
}: TreeViewProps) {
  const [internalExpandedIds, setInternalExpandedIds] = React.useState<Set<string>>(
    () => new Set(defaultExpandedIds),
  );

  const expandedIds = controlledExpandedIds ?? internalExpandedIds;
  const setExpandedIds = onExpandedChange ?? setInternalExpandedIds;

  const handleToggle = React.useCallback(
    (id: string) => {
      const next = new Set(expandedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      setExpandedIds(next);
    },
    [expandedIds, setExpandedIds],
  );

  return (
    <div className={cn("py-2", className)} role="tree">
      {data.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          level={0}
          selectedId={selectedId}
          onSelect={onSelect}
          expandedIds={expandedIds}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}

// Helper to convert flat categories to tree structure
export function buildCategoryTree<T extends { id: string; parentId?: string | null; name: string }>(
  categories: T[],
): TreeNode[] {
  const map = new Map<string, TreeNode & { originalData: T }>();
  const roots: TreeNode[] = [];

  // First pass: create all nodes
  for (const cat of categories) {
    map.set(cat.id, {
      id: cat.id,
      name: cat.name,
      children: [],
      data: cat,
      originalData: cat,
    });
  }

  // Second pass: build tree structure
  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
