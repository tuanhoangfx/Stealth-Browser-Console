"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  setCatalogProfileBaseline,
  shouldBlockCatalogShrinkFlush,
} = require("./catalog-persist-guard.cjs");

describe("catalog-persist-guard", () => {
  it("blocks flush when memory collapsed but baseline was large", () => {
    setCatalogProfileBaseline(5002);
    const fakeDb = {
      exec(sql) {
        if (String(sql).includes("COUNT")) return [{ values: [[1]] }];
        return [];
      },
    };
    assert.equal(shouldBlockCatalogShrinkFlush(fakeDb, "C:\\fake\\stealth-console.db"), true);
  });

  it("allows flush when memory still has many profiles", () => {
    setCatalogProfileBaseline(5002);
    const fakeDb = {
      exec(sql) {
        if (String(sql).includes("COUNT")) return [{ values: [[4800]] }];
        return [];
      },
    };
    assert.equal(shouldBlockCatalogShrinkFlush(fakeDb, "C:\\fake\\stealth-console.db"), false);
  });
});
