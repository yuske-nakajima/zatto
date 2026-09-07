import { Icon } from "../../src/web/icons";
import { INK } from "./style";

/**
 * Presents an expandable filesystem branch.
 * @param props - Folder name, entry count and expansion state.
 * @returns A folder row.
 */
export function Folder({
  label,
  count,
  expanded,
}: {
  label: string;
  count: number;
  expanded: boolean;
}) {
  return (
    <div
      style={{
        height: 40,
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingLeft: 16,
        color: INK.muted,
        fontSize: 15,
      }}
    >
      <Icon name={expanded ? "chevronDown" : "chevronRight"} size={13} />
      <Icon name="folder" size={16} />
      <strong>{label}</strong>
      <span>({count})</span>
    </div>
  );
}
