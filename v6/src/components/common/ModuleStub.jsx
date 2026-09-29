import {
  Layers,
} from "lucide-react";
import { MODULES } from "../../constants/modules";
import { COLORS } from "../../constants/theme";

export function ModuleStub({ moduleKey }) {
  const mod = MODULES.find((m) => m.key === moduleKey);
  const Icon = mod?.icon || Layers;
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: COLORS.textMuted }}>
      <span style={{ width: 52, height: 52, borderRadius: 14, background: `${mod?.color}1F`, color: mod?.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={24} />
      </span>
      <div style={{ fontFamily: "Sora, sans-serif", fontSize: 17, fontWeight: 700, color: COLORS.text }}>{mod?.label}</div>
      <div style={{ fontSize: 13.5, maxWidth: 320, textAlign: "center" }}>
        This module follows the same pattern as Department — grid, search, and a slide-over form wired to its own Power Automate flow. Not built yet in this preview.
      </div>
    </div>
  );
}
