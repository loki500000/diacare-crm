"use client";
import { useState } from "react";
import { FlowNode, NodeType, DB_SCHEMA_MAP } from "@/lib/api";

interface Props {
  node: FlowNode;
  onChange: (updated: FlowNode) => void;
  onClose: () => void;
}

const NODE_COLORS: Record<NodeType, string> = {
  speak: "bg-blue-100 text-blue-700 border-blue-300",
  smart_extract: "bg-purple-100 text-purple-700 border-purple-300",
  branch: "bg-amber-100 text-amber-700 border-amber-300",
  write_db: "bg-green-100 text-green-700 border-green-300",
  care_alert: "bg-red-100 text-red-700 border-red-300",
  end: "bg-slate-100 text-slate-700 border-slate-300",
};

const NODE_LABELS: Record<NodeType, string> = {
  speak: "Speak",
  smart_extract: "Smart Extract",
  branch: "Branch",
  write_db: "Write to DB",
  care_alert: "Care Alert",
  end: "End Call",
};

const DB_TABLES = Object.keys(DB_SCHEMA_MAP) as (keyof typeof DB_SCHEMA_MAP)[];

export default function NodeConfigPanel({ node, onChange, onClose }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function set(key: keyof FlowNode, value: unknown) {
    onChange({ ...node, [key]: value });
  }

  function setDbTarget(key: string, value: string) {
    onChange({
      ...node,
      db_target: { ...(node.db_target || { table: "patients", field: "" }), [key]: value },
    });
  }

  const dbTable = (node.db_target?.table || "patients") as keyof typeof DB_SCHEMA_MAP;
  const dbFields = dbTable in DB_SCHEMA_MAP ? Object.keys(DB_SCHEMA_MAP[dbTable]) : [];
  const dbField = node.db_target?.field || "";
  const dbSubfields =
    dbTable in DB_SCHEMA_MAP && dbField in (DB_SCHEMA_MAP[dbTable] as Record<string, unknown>)
      ? (DB_SCHEMA_MAP[dbTable] as Record<string, unknown>)[dbField]
      : null;

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col h-full">
      {/* Header */}
      <div className={`flex items-center justify-between p-4 border-b border-slate-200`}>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${NODE_COLORS[node.type]}`}>
            {NODE_LABELS[node.type]}
          </span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase">Node Label</label>
          <input
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5]"
            value={node.label}
            onChange={e => set("label", e.target.value)}
          />
        </div>

        {/* Type-specific fields */}
        {node.type === "speak" && (
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Text to speak</label>
            <textarea
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5] resize-none"
              rows={4}
              placeholder="Hello! I am DiaCare AI..."
              value={node.text || ""}
              onChange={e => set("text", e.target.value)}
            />
          </div>
        )}

        {node.type === "smart_extract" && (
          <>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">AI Question</label>
              <textarea
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5] resize-none"
                rows={3}
                placeholder="What did you eat today?"
                value={node.ai_question || ""}
                onChange={e => set("ai_question", e.target.value)}
              />
              <p className="text-[10px] text-slate-400 mt-1">Use {"{{med.friendly_name}}"} for medication loops</p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Output Variable</label>
              <input
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5]"
                placeholder="diet_result"
                value={node.output_var || ""}
                onChange={e => set("output_var", e.target.value)}
              />
            </div>
            <DbTargetPicker node={node} dbTable={dbTable} dbFields={dbFields} dbField={dbField} dbSubfields={dbSubfields} setDbTarget={setDbTarget} />

            {/* Advanced section */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setAdvancedOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase hover:bg-slate-100"
              >
                Advanced
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  {advancedOpen ? "expand_less" : "expand_more"}
                </span>
              </button>
              {advancedOpen && (
                <div className="p-3 space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Rules Source <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                    <input
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5]"
                      placeholder="patient.diet_rules"
                      value={node.rules_source || ""}
                      onChange={e => set("rules_source", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Loop Over <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                    <input
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5]"
                      placeholder="patient.medications"
                      value={node.loop_over || ""}
                      onChange={e => set("loop_over", e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {node.type === "branch" && (
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Condition</label>
            <input
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5]"
              placeholder="diet_result.no_alcohol == false"
              value={node.condition || ""}
              onChange={e => set("condition", e.target.value)}
            />
            <p className="text-[10px] text-slate-400 mt-1">Connect from the green handle for TRUE, grey handle for FALSE.</p>
          </div>
        )}

        {node.type === "write_db" && (
          <>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Value From (variable)</label>
              <input
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5]"
                placeholder="glucose_result"
                value={node.value_from || ""}
                onChange={e => set("value_from", e.target.value)}
              />
            </div>
            <DbTargetPicker node={node} dbTable={dbTable} dbFields={dbFields} dbField={dbField} dbSubfields={dbSubfields} setDbTarget={setDbTarget} />
          </>
        )}

        {node.type === "care_alert" && (
          <>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Priority</label>
              <select
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5]"
                value={node.db_target?.priority || "high"}
                onChange={e => setDbTarget("priority", e.target.value)}
              >
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Alert Message</label>
              <textarea
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5] resize-none"
                rows={3}
                placeholder="Patient consumed alcohol"
                value={node.message || ""}
                onChange={e => set("message", e.target.value)}
              />
            </div>
          </>
        )}

        {node.type === "end" && (
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Farewell Message <span className="normal-case font-normal text-slate-400">(optional)</span></label>
            <textarea
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5] resize-none"
              rows={3}
              placeholder="Thank you. Stay healthy!"
              value={node.farewell || ""}
              onChange={e => set("farewell", e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function DbTargetPicker({
  node, dbTable, dbFields, dbField, dbSubfields, setDbTarget,
}: {
  node: FlowNode;
  dbTable: string;
  dbFields: string[];
  dbField: string;
  dbSubfields: unknown;
  setDbTarget: (k: string, v: string) => void;
}) {
  return (
    <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <p className="text-[10px] font-bold text-slate-500 uppercase">DB Write Target</p>
      <div>
        <label className="text-[10px] text-slate-400">Table</label>
        <select
          className="mt-0.5 w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#1a59d5]"
          value={dbTable}
          onChange={e => setDbTarget("table", e.target.value)}
        >
          {Object.keys(DB_SCHEMA_MAP).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[10px] text-slate-400">Field</label>
        <select
          className="mt-0.5 w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#1a59d5]"
          value={dbField}
          onChange={e => setDbTarget("field", e.target.value)}
        >
          <option value="">— select —</option>
          {dbFields.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      {Array.isArray(dbSubfields) && dbSubfields.length > 0 && (
        <div>
          <label className="text-[10px] text-slate-400">Subfield</label>
          <select
            className="mt-0.5 w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#1a59d5]"
            value={node.db_target?.subfield || ""}
            onChange={e => setDbTarget("subfield", e.target.value)}
          >
            <option value="">— select —</option>
            {(dbSubfields as string[]).map((sf: string) => <option key={sf} value={sf}>{sf}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
