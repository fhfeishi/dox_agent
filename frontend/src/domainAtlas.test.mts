import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAtlas, atlasLayout, lensValue, type AtlasData } from "./domainAtlas.ts";

// Pure aggregation: catches project double-counting, missing vs listed-zero, and statistical
// thresholds inside a selected layer, beyond what the HTTP schema contract can exercise.
test("layer/window deduplication retains unknown years, listed-zero and judged means", () => {
  const data:AtlasData={funding_label:"批准资助金额",years:[2021,2022],domains:[{id:"a",name:"A",projects:[
    {id:"p1",title:"一",year:2021,amount:100,outputs:2},{id:"p2",title:"二",year:2022,amount:null,outputs:null},
    {id:"p3",title:"三",year:null,amount:0,outputs:0}],items:[{id:"t1",project_id:"p1",maturity:4},{id:"t2",project_id:"p1",maturity:0},{id:"t3",project_id:"p2",maturity:2}],
    systems:[{id:"s",name:"S",item_ids:["t1","t2","t1","t3"],unplaced:false,directions:[]}]}]};
  const model=buildAtlas(data),s=model.measure("s");
  assert.equal(s.projects,2);assert.equal(s.items,3);assert.equal(s.funding,100);assert.equal(s.maturity,3);
  assert.equal(model.measure("s",{from:2021,to:2021}).projects,1);
  const all=model.measure("a");assert.equal(all.projects,3);assert.equal(all.funded,2);assert.equal(all.listed,2);assert.equal(all.undated,1);
  assert.equal(all.avgFunding,null);assert.equal(all.avgOutputs,null);assert.match(lensValue(all,"money").reason!,/不足/);
  assert.equal(model.measure("a",{from:2022,to:2022}).listed,0);
  assert.equal(model.measure("a",{from:2021,to:2021}).outputs,2);
  const c=atlasLayout([s],"base",720,360);assert.equal(c.mx,3);assert.equal(c.my,3);
  assert.ok(c.points.every(p=>Number.isFinite(p.cx)&&Number.isFinite(p.cy)));
  assert.equal(c.points[0].x>c.mx,false);assert.equal(c.points[0].y>c.my,false);
  const large=atlasLayout([s],"base",1800,930,19);
  assert.equal(large.mx,c.mx);assert.equal(large.my,c.my);
  // Third-round contract: readable 8–30px markers keep their screen size.
  assert.equal(large.points[0].r,c.points[0].r);
  assert.ok(c.points.every(p=>p.r>=8&&p.r<=30));
  assert.ok([...large.seats.values()].every(p=>p.x>=large.left&&p.x<=large.right&&p.y>=large.top&&p.y<=large.bottom));
  const zeros=buildAtlas({funding_label:"批准资助金额",years:[2021],domains:[{id:"zero",name:"零值",projects:[1,2,3].map(i=>({id:String(i),title:String(i),year:2021,amount:0,outputs:0})),items:[1,2,3].map(i=>({id:String(i),project_id:String(i),maturity:1})),systems:[]}]}).measure("zero");
  const zeroPlot=atlasLayout([zeros],"money",720,414);
  assert.equal(zeroPlot.mx,0);assert.equal(zeroPlot.my,0);
  assert.equal(zeroPlot.medianX,zeroPlot.px(0));
});
