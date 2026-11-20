import type { CollectionNodeDto } from "@timeline/contracts";
import type { ReactNode } from "react";

export function collectionPath(
  nodesById: Map<string, CollectionNodeDto>,
  id: string,
) {
  const path: CollectionNodeDto[] = [];
  for (
    let node = nodesById.get(id);
    node;
    node = node.parentId === null ? undefined : nodesById.get(node.parentId)
  ) {
    path.push(node);
  }
  return path.reverse();
}

export default function CollectionTree({
  nodes,
  renderNode,
}: {
  nodes: CollectionNodeDto[];
  renderNode: (node: CollectionNodeDto) => ReactNode;
}) {
  const byParent = new Map<string | null, CollectionNodeDto[]>();
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId);
    if (siblings) siblings.push(node);
    else byParent.set(node.parentId, [node]);
  }

  function branch(parentId: string | null) {
    const children = byParent.get(parentId);
    if (!children) return null;
    return (
      <ul
        className={
          parentId === null
            ? "space-y-1"
            : "mt-1 ml-3 space-y-1 border-l border-binding pl-3"
        }
      >
        {children.map((node) => (
          <li key={node.id}>
            {renderNode(node)}
            {branch(node.id)}
          </li>
        ))}
      </ul>
    );
  }

  return branch(null);
}
