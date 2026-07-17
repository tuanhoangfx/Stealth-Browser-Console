import type { HubDirectoryColumnHintContent } from "@tool-workspace/hub-ui";
import { colHint } from "@tool-workspace/hub-ui";

export function profileAdaptiveEditLabelHint(selectedCount: number): HubDirectoryColumnHintContent {
  if (selectedCount === 0) {
    return colHint("Detail", "Select one row to open detail, or 2+ rows for bulk detail edit.");
  }
  if (selectedCount === 1) {
    return colHint("Detail", "Open detail modal for the selected profile.");
  }
  return colHint("Detail", "Open bulk detail modal for all selected profiles.");
}
