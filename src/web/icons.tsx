import clipboardCopy from "./assets/icons/clipboard-copy.svg";
import folder from "./assets/icons/folder.svg";
import gripDefault from "./assets/icons/grip-default.svg";
import gripAccent from "./assets/icons/grip-vertical.svg";
import link from "./assets/icons/link.svg";
import linkAccent from "./assets/icons/link-accent.svg";
import monitorPlay from "./assets/icons/monitor-play.svg";
import terminal from "./assets/icons/terminal.svg";
import trash from "./assets/icons/trash.svg";
import trashAccent from "./assets/icons/trash-accent.svg";

const iconSources = {
  clipboardCopy,
  folder,
  gripAccent,
  gripDefault,
  link,
  linkAccent,
  monitorPlay,
  terminal,
  trash,
  trashAccent,
};

export type IconName = keyof typeof iconSources;

interface IconProps {
  name: IconName;
  size: number;
}

export function Icon({ name, size }: IconProps) {
  return (
    <img
      className="icon"
      src={iconSources[name]}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
    />
  );
}
