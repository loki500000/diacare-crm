"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  getScripts,
  createScript,
  updateScript,
  setDefaultScript,
  deleteScript,
  CallScript,
  FlowNode,
  NodeType,
} from "@/lib/api";
import NodeConfigPanel from "./NodeConfigPanel";
import { toast } from "sonner";

// ─── Node type config ─────────────────────────────────────────────────────────
const NODE_TYPE_META: Record<NodeType, { label: string; color: string; icon: string; bg: string; border: string }> = {
  speak: { label: "Speak", color: "text-blue-700", icon: "record_voice_over", bg: "bg-blue-50", border: "border-blue-300" },
  smart_extract: { label: "Smart Extract", color: "text-purple-700", icon: "psychology", bg: "bg-purple-50", border: "border-purple-300" },
  branch: { label: "Branch", color: "text-amber-700", icon: "call_split", bg: "bg-amber-50", border: "border-amber-300" },
  write_db: { label: "Write DB", color: "text-green-700", icon: "storage", bg: "bg-green-50", border: "border-green-300" },
  care_alert: { label: "Care Alert", color: "text-red-700", icon: "notification_important", bg: "bg-red-50", border: "border-red-300" },
  end: { label: "End Call", color: "text-slate-700", icon: "call_end", bg: "bg-slate-50", border: "border-slate-300" },
};

// ─── Custom node renderer ────────────────────────────────────────────────────
// Node data must satisfy Record<string, unknown> for ReactFlow
type RFNodeData = FlowNode & Record<string, unknown>;
type RFNode = Node<RFNodeData>;

function nodeRing(selected?: boolean) {
  return selected ? "ring-2 ring-[#1a59d5] ring-offset-2 shadow-lg" : "";
}

function SpeakNode({ data, selected }: { data: RFNodeData; selected?: boolean }) {
  return (
    <div className={`w-64 rounded-xl overflow-hidden border-2 border-blue-200 bg-white shadow-sm ${nodeRing(selected)}`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-white !border-2 !border-slate-400" />
      <div className="bg-blue-50 border-b border-blue-200 px-3 py-1.5 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-blue-700" style={{ fontSize: 13 }}>record_voice_over</span>
        <span className="text-[10px] font-bold uppercase text-blue-700">Speak</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-semibold text-slate-800">{data.label}</p>
        {data.text && (
          <p className="text-[10px] text-slate-500 italic mt-1 line-clamp-3">"{String(data.text)}"</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />
    </div>
  );
}

function SmartExtractNode({ data, selected }: { data: RFNodeData; selected?: boolean }) {
  const dbTarget = data.db_target as any;
  return (
    <div className={`w-64 rounded-xl overflow-hidden border-2 border-purple-200 bg-white shadow-sm ${nodeRing(selected)}`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-white !border-2 !border-slate-400" />
      <div className="bg-purple-50 border-b border-purple-200 px-3 py-1.5 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-purple-700" style={{ fontSize: 13 }}>psychology</span>
        <span className="text-[10px] font-bold uppercase text-purple-700">Smart Extract</span>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <p className="text-xs font-semibold text-slate-800">{data.label}</p>
        {data.ai_question && (
          <p className="text-[10px] text-slate-500 line-clamp-2">{String(data.ai_question)}</p>
        )}
        <div className="flex flex-wrap gap-1">
          {data.output_var && (
            <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-mono">out: {String(data.output_var)}</span>
          )}
          {dbTarget?.field && (
            <span className="text-[9px] bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-mono">→ {dbTarget.table}.{dbTarget.field}</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white" />
    </div>
  );
}

function BranchNode({ data, selected }: { data: RFNodeData; selected?: boolean }) {
  return (
    <div className={`w-64 rounded-xl overflow-hidden border-2 border-amber-200 bg-white shadow-sm ${nodeRing(selected)}`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-white !border-2 !border-slate-400" />
      <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-amber-700" style={{ fontSize: 13 }}>call_split</span>
        <span className="text-[10px] font-bold uppercase text-amber-700">Branch</span>
      </div>
      <div className="px-3 py-2 pb-5">
        <p className="text-xs font-semibold text-slate-800">{data.label}</p>
        {data.condition && (
          <p className="text-[10px] font-mono bg-amber-50 border border-amber-100 rounded px-1.5 py-1 mt-1.5 text-slate-700 truncate">{String(data.condition)}</p>
        )}
        <div className="flex justify-between mt-2 px-4">
          <span className="text-[9px] font-bold text-green-600">TRUE</span>
          <span className="text-[9px] font-bold text-slate-400">FALSE</span>
        </div>
      </div>
      <Handle id="true" type="source" position={Position.Bottom}
        style={{ left: "30%" }}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white" />
      <Handle id="false" type="source" position={Position.Bottom}
        style={{ left: "70%" }}
        className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white" />
    </div>
  );
}

function WriteDbNode({ data, selected }: { data: RFNodeData; selected?: boolean }) {
  const dbTarget = data.db_target as any;
  return (
    <div className={`w-64 rounded-xl overflow-hidden border-2 border-green-200 bg-white shadow-sm ${nodeRing(selected)}`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-white !border-2 !border-slate-400" />
      <div className="bg-green-50 border-b border-green-200 px-3 py-1.5 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-green-700" style={{ fontSize: 13 }}>storage</span>
        <span className="text-[10px] font-bold uppercase text-green-700">Write DB</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-semibold text-slate-800">{data.label}</p>
        {(data.value_from || dbTarget?.field) && (
          <p className="text-[10px] text-slate-500 mt-1 font-mono">
            {data.value_from ? String(data.value_from) : "?"} → {dbTarget?.table ?? "?"}.{dbTarget?.field ?? "?"}{dbTarget?.subfield ? `.${dbTarget.subfield}` : ""}
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-green-500 !border-2 !border-white" />
    </div>
  );
}

function CareAlertNode({ data, selected }: { data: RFNodeData; selected?: boolean }) {
  const priority = (data.db_target as any)?.priority || "high";
  const priorityIcon = priority === "high" ? "🔴" : priority === "medium" ? "🟡" : "🟢";
  return (
    <div className={`w-64 rounded-xl overflow-hidden border-2 border-red-200 bg-white shadow-sm ${nodeRing(selected)}`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-white !border-2 !border-slate-400" />
      <div className="bg-red-50 border-b border-red-200 px-3 py-1.5 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-red-700" style={{ fontSize: 13 }}>notification_important</span>
        <span className="text-[10px] font-bold uppercase text-red-700">Care Alert</span>
        <span className="ml-auto text-[11px]">{priorityIcon}</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-semibold text-slate-800">{data.label}</p>
        {data.message && (
          <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{String(data.message)}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-red-500 !border-2 !border-white" />
    </div>
  );
}

function EndNode({ data, selected }: { data: RFNodeData; selected?: boolean }) {
  return (
    <div className={`w-64 rounded-2xl overflow-hidden border-2 border-slate-200 bg-white shadow-sm ${nodeRing(selected)}`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-white !border-2 !border-slate-400" />
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-slate-700" style={{ fontSize: 13 }}>call_end</span>
        <span className="text-[10px] font-bold uppercase text-slate-700">End Call</span>
      </div>
      <div className="px-3 py-3">
        <p className="text-xs font-semibold text-slate-800">{data.label}</p>
        {data.farewell && (
          <p className="text-[10px] text-slate-500 italic mt-1 line-clamp-3">"{String(data.farewell)}"</p>
        )}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  speak: SpeakNode as any,
  smart_extract: SmartExtractNode as any,
  branch: BranchNode as any,
  write_db: WriteDbNode as any,
  care_alert: CareAlertNode as any,
  end: EndNode as any,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toRFNode(fn: FlowNode): RFNode {
  return {
    id: fn.id,
    type: fn.type,
    position: fn.position,
    data: fn as RFNodeData,
  };
}

/** Map a FlowEdge → RF Edge, deriving sourceHandle for branch nodes.
 *  Supports both new ("true"/"false") and old ("default") label conventions. */
function toRFEdge(e: FlowEdge): Edge {
  const sh =
    e.sourceHandle ??
    (e.label === "true" ? "true"
      : e.label === "false" || e.label === "default" ? "false"
      : undefined);
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    ...(sh ? { sourceHandle: sh } : {}),
  };
}

let idCounter = 100;
function newId() { return `n${++idCounter}`; }

// ─── Main component ──────────────────────────────────────────────────────────
export default function ScriptBuilder() {
  const [scripts, setScripts] = useState<CallScript[]>([]);
  const [activeScript, setActiveScript] = useState<CallScript | null>(null);
  const [scriptName, setScriptName] = useState("New Script");
  const [scriptLang, setScriptLang] = useState<string>("Tamil");
  const [saving, setSaving] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    getScripts()
      .then(list => {
        setScripts(list);
        const def = list.find(s => s.is_default) || list[0] || null;
        if (def) loadScript(def);
      })
      .catch(() => {});
  }, []);

  function loadScript(script: CallScript) {
    setActiveScript(script);
    setScriptName(script.name);
    setScriptLang(script.language);
    setRfNodes(script.nodes.map(toRFNode));
    setRfEdges(script.edges.map(toRFEdge));
    setSelectedNodeId(null);
  }

  function newScript() {
    setActiveScript(null);
    setScriptName("New Script");
    setScriptLang("Tamil");
    setRfNodes([]);
    setRfEdges([]);
    setSelectedNodeId(null);
  }

  const onConnect = useCallback(
    (params: Connection) => setRfEdges(eds => addEdge({ ...params, id: `e${Date.now()}` }, eds)),
    [setRfEdges]
  );

  function addNode(type: NodeType) {
    const meta = NODE_TYPE_META[type];
    const id = newId();
    const newNode: FlowNode = {
      id,
      type,
      label: meta.label,
      position: { x: 200 + Math.random() * 100, y: 100 + rfNodes.length * 120 },
    };
    setRfNodes(nds => [...nds, toRFNode(newNode)]);
  }

  function updateNodeData(updated: FlowNode) {
    setRfNodes(nds =>
      nds.map(n =>
        n.id === updated.id
          ? { ...n, data: updated as RFNodeData, position: updated.position }
          : n
      )
    );
  }

  const selectedNode = selectedNodeId
    ? (rfNodes.find(n => n.id === selectedNodeId)?.data as FlowNode | undefined) ?? null
    : null;

  async function saveCurrentScript() {
    setSaving(true);
    try {
      const nodes: FlowNode[] = rfNodes.map(n => ({ ...(n.data as FlowNode), position: n.position }));
      const edges = rfEdges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === "string" ? e.label : undefined,
        sourceHandle: e.sourceHandle ?? undefined,
      }));
      const payload = { name: scriptName, language: scriptLang, nodes, edges };
      let saved: CallScript;
      if (activeScript?.id) {
        saved = await updateScript(activeScript.id, payload);
      } else {
        saved = await createScript(payload);
      }
      setActiveScript(saved);
      const list = await getScripts();
      setScripts(list);
      toast.success("Script saved");
    } catch {
      toast.error("Failed to save script");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault() {
    if (!activeScript?.id) return;
    try {
      await setDefaultScript(activeScript.id);
      const list = await getScripts();
      setScripts(list);
      toast.success("Set as default script");
    } catch {
      toast.error("Failed to set default");
    }
  }

  async function handleDelete() {
    if (!activeScript?.id) return;
    if (!confirm(`Delete "${activeScript.name}"?`)) return;
    try {
      await deleteScript(activeScript.id);
      const list = await getScripts();
      setScripts(list);
      newScript();
      toast.success("Script deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  return (
    <div className="relative flex gap-4 h-[calc(100vh-260px)] min-h-[500px]">
      {/* Left: palette + scripts list */}
      <div className="w-52 flex-shrink-0 flex flex-col gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Scripts</span>
            <button onClick={newScript} className="text-[10px] font-bold text-[#1a59d5] hover:underline">
              + New
            </button>
          </div>
          <div className="max-h-36 overflow-y-auto">
            {scripts.length === 0 && (
              <p className="text-[11px] text-slate-400 p-3">No scripts yet.</p>
            )}
            {scripts.map(s => (
              <button
                key={s.id}
                onClick={() => loadScript(s)}
                className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5 ${
                  activeScript?.id === s.id ? "bg-[#1a59d5]/5 text-[#1a59d5]" : "text-slate-700"
                }`}
              >
                {s.is_default && (
                  <span className="material-symbols-outlined text-amber-500" style={{ fontSize: 11 }}>star</span>
                )}
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 overflow-y-auto">
          <div className="px-3 py-2 border-b border-slate-100">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Add Node</span>
          </div>
          <div className="p-2 space-y-1.5">
            {(Object.entries(NODE_TYPE_META) as [NodeType, typeof NODE_TYPE_META[NodeType]][]).map(([type, meta]) => (
              <button
                key={type}
                onClick={() => addNode(type)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors hover:opacity-80 ${meta.bg} ${meta.border}`}
              >
                <span className={`material-symbols-outlined ${meta.color}`} style={{ fontSize: 14 }}>
                  {meta.icon}
                </span>
                <span className={`text-xs font-bold ${meta.color}`}>{meta.label}</span>
              </button>
            ))}
          </div>
          <div className="px-3 pb-3">
            <p className="text-[10px] text-slate-400">Click a node type to add it. Click a node on the canvas to configure it.</p>
          </div>
        </div>
      </div>

      {/* Center: canvas */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-col border-b border-slate-200 bg-slate-50 flex-shrink-0">
          {/* Main toolbar */}
          <div className="flex items-center gap-3 px-4 py-2.5">
            <input
              className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-[#1a59d5]"
              value={scriptName}
              onChange={e => setScriptName(e.target.value)}
              placeholder="Script name..."
            />
            <select
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5]"
              value={scriptLang}
              onChange={e => setScriptLang(e.target.value)}
            >
              {["Tamil", "Hindi", "Telugu", "English"].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            {activeScript?.id && (
              <>
                <button
                  onClick={handleSetDefault}
                  title="Set as default"
                  className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>star</span>
                </button>
                <button
                  onClick={handleDelete}
                  title="Delete script"
                  className="p-1.5 rounded-lg bg-red-50 border border-red-200 text-red-500 hover:bg-red-100"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                </button>
              </>
            )}
            {/* JSON viewer button */}
            <button
              onClick={() => setJsonOpen(o => !o)}
              title="View JSON schema"
              className={`p-1.5 rounded-lg border font-mono text-xs font-bold transition-colors ${
                jsonOpen
                  ? "bg-slate-700 text-white border-slate-700"
                  : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {"{ }"}
            </button>
            <button
              onClick={saveCurrentScript}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#1a59d5] text-white text-sm font-bold rounded-lg hover:brightness-110 disabled:opacity-60"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

        </div>

        <div className="flex-1">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_evt, node) =>
              setSelectedNodeId(prev => (prev === node.id ? null : node.id))
            }
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <Background gap={20} color="#e2e8f0" />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>

      {/* Right: node config */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onChange={updateNodeData}
          onClose={() => setSelectedNodeId(null)}
        />
      )}

      {/* JSON viewer overlay */}
      {jsonOpen && (
        <div className="absolute inset-0 z-50 flex items-start justify-end pointer-events-none">
          <div className="pointer-events-auto mt-14 mr-4 w-[520px] max-h-[80vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-600">Script JSON</span>
                <span className="text-[10px] text-slate-400">{rfNodes.length} nodes · {rfEdges.length} edges</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const nodes: FlowNode[] = rfNodes.map(n => ({ ...(n.data as FlowNode), position: n.position }));
                    const edges = rfEdges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label || undefined, sourceHandle: e.sourceHandle || undefined }));
                    navigator.clipboard.writeText(JSON.stringify({ name: scriptName, language: scriptLang, nodes, edges }, null, 2));
                    toast.success("Copied to clipboard");
                  }}
                  className="text-[11px] font-bold text-[#1a59d5] hover:underline flex items-center gap-1"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>content_copy</span>
                  Copy
                </button>
                <button onClick={() => setJsonOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-[11px] font-mono text-slate-700 bg-slate-950 text-green-400 leading-relaxed">
              {(() => {
                const nodes: FlowNode[] = rfNodes.map(n => ({ ...(n.data as FlowNode), position: n.position }));
                const edges = rfEdges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label || undefined, sourceHandle: e.sourceHandle || undefined }));
                return JSON.stringify({ name: scriptName, language: scriptLang, nodes, edges }, null, 2);
              })()}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
