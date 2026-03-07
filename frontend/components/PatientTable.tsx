"use client";
import Link from "next/link";
import { Patient } from "@/lib/api";
import SeverityBadge from "./SeverityBadge";
import ComplianceBar from "./ComplianceBar";
import { Phone } from "lucide-react";

interface Props {
  patients: Patient[];
  onScheduleCall?: (patient: Patient) => void;
}

export default function PatientTable({ patients, onScheduleCall }: Props) {
  if (patients.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500 text-sm">
        No patients found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 font-medium text-gray-600">Patient</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Condition</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Severity</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Compliance</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">HbA1c</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {patients.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link href={`/patients/${p.id}`} className="flex items-center gap-2.5 hover:text-[#1a59d5]">
                  <div className="w-8 h-8 rounded-full bg-[#1a59d5]/10 flex items-center justify-center text-[#1a59d5] font-semibold text-xs flex-shrink-0">
                    {p.initials || p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-medium text-gray-900">{p.name}</span>
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{p.condition}</td>
              <td className="px-4 py-3">
                <SeverityBadge severity={p.severity} />
              </td>
              <td className="px-4 py-3 min-w-[120px]">
                <ComplianceBar score={p.compliance_score} />
              </td>
              <td className="px-4 py-3 text-gray-600">
                {p.vitals?.hba1c != null ? `${p.vitals.hba1c}%` : "—"}
              </td>
              <td className="px-4 py-3 text-gray-600">{p.phone || "—"}</td>
              <td className="px-4 py-3">
                {onScheduleCall && (
                  <button
                    onClick={() => onScheduleCall(p)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#1a59d5]/10 text-[#1a59d5] hover:bg-[#1a59d5]/20 transition-colors"
                  >
                    <Phone className="w-3 h-3" />
                    Schedule
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
