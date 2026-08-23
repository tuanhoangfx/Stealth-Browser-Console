import { afterEach, describe, expect, it } from "vitest";
import {
  readScriptsDirectoryFilterUrl,
  readStoreDirectoryFilterUrl,
  writeScriptsDirectoryFilterUrl,
  writeStoreDirectoryFilterUrl,
} from "./workflow-directory-filter-url";

describe("workflow directory filter URL", () => {
  afterEach(() => {
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("reads Scripts sgroup/splatform and ignores Profiles group=", () => {
    window.history.replaceState(null, "", "/?group=Work&sgroup=Core&splatform=OpenAI");
    expect(readScriptsDirectoryFilterUrl()).toEqual({
      groupIds: ["Core"],
      platformIds: ["OpenAI"],
    });
  });

  it("writes Scripts chips without clobbering Profiles group=", () => {
    window.history.replaceState(null, "", "/?group=Work");
    writeScriptsDirectoryFilterUrl(["Core"], ["OpenAI"]);
    expect(window.location.search).toContain("group=Work");
    expect(window.location.search).toContain("sgroup=Core");
    expect(window.location.search).toContain("splatform=OpenAI");
    writeScriptsDirectoryFilterUrl([], []);
    expect(window.location.search).toContain("group=Work");
    expect(window.location.search).not.toContain("sgroup=");
    expect(window.location.search).not.toContain("splatform=");
  });

  it("persists Store group/platform/source separately from Scripts", () => {
    writeScriptsDirectoryFilterUrl(["Core"], ["OpenAI"]);
    writeStoreDirectoryFilterUrl(["Appeal"], ["Google"], ["supabase"]);
    expect(readScriptsDirectoryFilterUrl()).toEqual({ groupIds: ["Core"], platformIds: ["OpenAI"] });
    expect(readStoreDirectoryFilterUrl()).toEqual({
      groupIds: ["Appeal"],
      platformIds: ["Google"],
      sourceIds: ["supabase"],
    });
    writeStoreDirectoryFilterUrl([], [], []);
    expect(window.location.search).not.toContain("stgroup=");
    expect(window.location.search).toContain("sgroup=Core");
  });
});
