import { useMemo, useState } from 'react';

interface TreeNode {
    name: string;
    fullName: string;
    children: TreeNode[];
    isLeaf: boolean;
}

function buildTree(methods: string[]): TreeNode[] {
    const root: TreeNode = { name: '', fullName: '', children: [], isLeaf: false };
    for (const m of methods) {
        const parts = m.split('.');
        let cur = root;
        parts.forEach((part, i) => {
            const isLeaf = i === parts.length - 1;
            let child = cur.children.find((c) => c.name === part);
            if (!child) {
                child = {
                    name: part,
                    fullName: parts.slice(0, i + 1).join('.'),
                    children: [],
                    isLeaf,
                };
                cur.children.push(child);
            }
            cur = child;
        });
    }
    const sort = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => {
            if (a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1;
            return a.name.localeCompare(b.name);
        });
        nodes.forEach((n) => sort(n.children));
    };
    sort(root.children);
    return root.children;
}

interface MethodTreeProps {
    methods: string[];
    selected: string;
    onSelect: (method: string) => void;
}

export function MethodTree({ methods, selected, onSelect }: MethodTreeProps) {
    const tree = useMemo(() => buildTree(methods), [methods]);

    if (methods.length === 0) {
        return <p className="empty">暂无可用方法。</p>;
    }

    return (
        <ul className="tree">
            {tree.map((n) => (
                <Node
                    key={n.fullName}
                    node={n}
                    selected={selected}
                    onSelect={onSelect}
                    depth={0}
                />
            ))}
        </ul>
    );
}

interface NodeProps {
    node: TreeNode;
    selected: string;
    onSelect: (method: string) => void;
    depth: number;
}

function Node({ node, selected, onSelect, depth }: NodeProps) {
    const [open, setOpen] = useState(false); // ← 默认折叠

    if (node.isLeaf) {
        const active = selected === node.fullName;
        return (
            <li
                className={`leaf${active ? ' active' : ''}`}
                style={{ paddingLeft: depth * 14 }}
                onClick={() => onSelect(node.fullName)}
                title={node.fullName}
            >
                {node.name}
            </li>
        );
    }

    return (
        <li>
            <div
                className="dir-row"
                style={{ paddingLeft: depth * 14 }}
                onClick={() => setOpen((o) => !o)}
            >
                <span className="expander">{open ? '▾' : '▸'}</span>
                <span className="dir">{node.name}</span>
            </div>
            {open && (
                <ul>
                    {node.children.map((c) => (
                        <Node
                            key={c.fullName}
                            node={c}
                            selected={selected}
                            onSelect={onSelect}
                            depth={depth + 1}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}