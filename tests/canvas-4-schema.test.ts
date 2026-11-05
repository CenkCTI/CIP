import { describe, expect, it } from "vitest";
import { canvasItemSchema, canvasSceneSaveSchema, type CanvasItem } from "@/lib/canvas/schema";
import {
  setScenePreviewPage, createSceneHistory, commitSceneHistory,
  undoSceneHistory, redoSceneHistory, groupSceneCards,
} from "@/lib/canvas/scene-history";

const id = "0e45ffdf-6905-4f84-a6c6-8d20e60bb201";
const assetId = "f9653a36-7d6f-4755-8c9b-2b8d6842a201";
const media: Extract<CanvasItem,{kind:"ENTITY_REF"}> = {
  id, kind:"ENTITY_REF", content:"", record_type:"SOURCE_ASSET", record_id:assetId,
  x:50,y:80,width:480,height:580,z_index:2,preview_page:1,
};
const note: CanvasItem = {
  id:"7476cdcc-6e56-4629-bf46-1880a112b201", kind:"NOTE", content:"Evidence is not verified",
  x:540,y:80,width:300,height:190,z_index:3,
};
const scene = {items:[media,note],edges:[]};
const input = {
  baseRevision:2,requestId:"cc5cc4cc-cc5c-4cc5-8cc5-4cc5cc5cc501",
  ...scene,
};

describe("CANVAS-4 canonical file preview contract",()=>{
  it("only permits bounded preview pages on canonical SOURCE_ASSET cards",()=>{
    expect(canvasItemSchema.safeParse(media).success).toBe(true);
    expect(canvasItemSchema.safeParse({...media,preview_page:10000}).success).toBe(true);
    expect(canvasItemSchema.safeParse({...media,preview_page:0}).success).toBe(false);
    expect(canvasItemSchema.safeParse({...media,preview_page:10001}).success).toBe(false);
    expect(canvasItemSchema.safeParse({...media,preview_page:1.25}).success).toBe(false);
    expect(canvasItemSchema.safeParse({...media,record_type:"ACTOR"}).success).toBe(false);
    expect(canvasItemSchema.safeParse({...note,preview_page:1}).success).toBe(false);
  });
  it("never serializes blobs, signed URLs or arbitrary external file links",()=>{
    expect(canvasItemSchema.safeParse({...media,signedUrl:"https://attacker.example/file"}).success).toBe(false);
    expect(canvasItemSchema.safeParse({...media,storage_path:"private/file.pdf"}).success).toBe(false);
    expect(canvasItemSchema.safeParse({...media,content:"faked document bytes"}).success).toBe(false);
    expect(canvasSceneSaveSchema.safeParse(input).success).toBe(true);
  });
  it("preserves note, grouping, page changes and undo/redo as a single revision",()=>{
    const changed = setScenePreviewPage(scene,id,7);
    expect(changed.items[0].kind==="ENTITY_REF"&&changed.items[0].preview_page).toBe(7);
    expect(setScenePreviewPage(changed,note.id,3)).toBe(changed);
    expect(setScenePreviewPage(changed,id,0)).toBe(changed);
    const history=commitSceneHistory(createSceneHistory(scene),changed);
    expect(undoSceneHistory(history).present).toEqual(scene);
    expect(redoSceneHistory(undoSceneHistory(history)).present).toEqual(changed);
    const grouped=groupSceneCards(changed,new Set([id,note.id]),
      "40c917c4-e6c7-41c2-8c6d-b15459c2b201");
    expect(grouped.items.find(v=>v.id===id)?.kind).toBe("ENTITY_REF");
    expect(grouped.items.find(v=>v.id===id&&v.kind==="ENTITY_REF")?.preview_page).toBe(7);
  });
  it("loads older CANVAS-1/2/3 cards with absent or null preview fields",()=>{
    expect(canvasItemSchema.safeParse({...media,preview_page:null}).success).toBe(true);
    expect(canvasItemSchema.safeParse({...note,preview_page:null}).success).toBe(true);
    expect(canvasSceneSaveSchema.safeParse({
      ...input,items:[{...media,preview_page:null},note],
    }).success).toBe(true);
  });
});
