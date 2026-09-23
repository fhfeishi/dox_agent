import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fundMetaFromPath } from "./fundMeta.ts";

describe("fundMetaFromPath", () => {
  it("parses the nf filename convention", () => {
    const meta = fundMetaFromPath("nf/人工智能与医疗/2021_2025_82030037_赵国光_基于AI的癫痫致痫网络和非致痫网络特征及分子机制研究.pdf");
    assert.deepEqual(meta, {
      yearFrom: 2021, yearTo: 2025, projectNo: "82030037", pi: "赵国光",
      title: "基于AI的癫痫致痫网络和非致痫网络特征及分子机制研究",
    });
  });
  it("accepts alphanumeric project numbers like U21A20383", () => {
    const meta = fundMetaFromPath("2022_2025_U21A20383_林天歆_基于人工智能的泌尿系统肿瘤诊疗平台研发与应用.pdf");
    assert.equal(meta?.projectNo, "U21A20383");
    assert.equal(meta?.pi, "林天歆");
  });
  it("accepts the same convention for markdown project metadata", () => {
    const meta = fundMetaFromPath("2022_2025_72172132_陈亚盛_人工智能会计决策系统.md");
    assert.deepEqual(meta, {
      yearFrom: 2022, yearTo: 2025, projectNo: "72172132", pi: "陈亚盛",
      title: "人工智能会计决策系统",
    });
  });
  it("returns null for non-fund names", () => {
    assert.equal(fundMetaFromPath("docs/guide.pdf"), null);
    assert.equal(fundMetaFromPath("2021_报告.pdf"), null);
    assert.equal(fundMetaFromPath(""), null);
  });
});
