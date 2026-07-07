import type { ReactNode } from "react";
import { HubAdmNoteEditorField } from "./HubAdmNoteEditorField";
import { HubAdmNoteReadonlyBody } from "./HubAdmNoteReadonlyBody";
import { hubAccountDetailSectionIcon, hubAccountDetailSectionIconClass } from "./hubAccountDetailSectionIcons";
import { HubToolDetailRail } from "./HubToolDetailSplitLayout";

type HubAdmNoteRailBaseProps = {
  title?: ReactNode;
  className?: string;
  id?: string;
  ariaLabel?: string;
  searchLabel?: string;
};

export type HubAdmNoteRailReadonlyProps = HubAdmNoteRailBaseProps & {
  mode?: "readonly";
  note: string;
  emptyMessage?: string;
  placeholder?: string;
  scroll?: boolean;
};

export type HubAdmNoteRailEditorProps = HubAdmNoteRailBaseProps & {
  mode: "editor";
  value: string;
  onChange: (value: string) => void;
  name?: string;
  placeholder?: string;
  controlClassName?: string;
  rows?: number;
  searchPlaceholder?: string;
  scroll?: boolean;
};

export type HubAdmNoteRailProps = HubAdmNoteRailReadonlyProps | HubAdmNoteRailEditorProps;

/** Golden note rail — HubToolDetailRail + Search note SSOT (P0020 Mail). */
export function HubAdmNoteRail(props: HubAdmNoteRailProps) {
  const title = props.title ?? "Note";
  const isEditor = props.mode === "editor";
  const scroll = props.scroll ?? !isEditor;

  return (
    <HubToolDetailRail
      id={props.id}
      title={title}
      icon={hubAccountDetailSectionIcon("note")}
      iconClassName={hubAccountDetailSectionIconClass("note")}
      className={props.className}
      scroll={scroll}
      bodyClassName="hub-adm-note-rail__body"
      ariaLabel={props.ariaLabel ?? (typeof title === "string" ? title : "Note")}
    >
      {isEditor ? (
        <HubAdmNoteEditorField
          value={props.value}
          onChange={props.onChange}
          name={props.name}
          placeholder={props.placeholder}
          controlClassName={props.controlClassName}
          rows={props.rows}
          searchLabel={props.searchLabel}
          searchPlaceholder={props.searchPlaceholder}
        />
      ) : (
        <HubAdmNoteReadonlyBody
          note={props.note}
          emptyMessage={props.emptyMessage}
          searchLabel={props.searchLabel}
          placeholder={props.placeholder}
        />
      )}
    </HubToolDetailRail>
  );
}
