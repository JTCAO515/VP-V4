import type { Confidence, Localized } from "./types";

const P = (en: string, zh: string): Localized => ({ en, zh });

export type ImportStageId = "received" | "parsing" | "extracted" | "checked";

export const IMPORT_STAGES: Array<{ id: ImportStageId; label: Localized; body: Localized }> = [
  { id: "received", label: P("Received", "已接收"), body: P("China Trip.pdf · 2.4 MB · PDF", "中国旅行.pdf · 2.4 MB · PDF") },
  { id: "parsing", label: P("Parsing", "解析中"), body: P("Reading dates, cities, places and booking references", "正在抽取日期、城市、地点和订单字段") },
  { id: "extracted", label: P("Extracted", "已抽取"), body: P("5 items found · 1 needs a manual correction", "已找到 5 条 · 1 条需要手工修正") },
  { id: "checked", label: P("Checked", "已检查"), body: P("2 workable stops · 1 timing conflict · 2 supporting details", "2 个可行节点 · 1 个时间冲突 · 2 条辅助信息") },
];

export const IMPORT_ITEMS: Array<{
  id: string;
  field: Localized;
  value: Localized;
  alternate: Localized;
  confidence: Confidence;
  failed?: boolean;
}> = [
  { id: "date", field: P("Travel date", "旅行日期"), value: P("24 May", "5 月 24 日"), alternate: P("25 May", "5 月 25 日"), confidence: "high" },
  { id: "city", field: P("City", "城市"), value: P("Shanghai", "上海"), alternate: P("Xi'an", "西安"), confidence: "high" },
  { id: "poi", field: P("Place", "地点"), value: P("Yu Garden", "豫园"), alternate: P("The Bund", "外滩"), confidence: "medium" },
  { id: "train", field: P("Train reference", "高铁字段"), value: P("Unreadable in the PDF", "PDF 中无法辨认"), alternate: P("G192", "G192"), confidence: "recheck", failed: true },
  { id: "hotel", field: P("Hotel area", "酒店区域"), value: P("People's Square", "人民广场"), alternate: P("The Bund", "外滩"), confidence: "medium" },
];

export const IMPORT_UI = {
  title: P("Review an imported guide", "检查导入的攻略"),
  lede: P("Check or correct each item before it reaches your Canvas.", "抽取结果可以逐条检查和修改，确认后再进入 Canvas。"),
  edit: P("Edit", "修改"),
  undo: P("Undo", "撤销"),
  repair: P("Fill by hand", "手工补充"),
  partial: P("Partly parsed", "部分解析成功"),
  partialBody: P("Four fields were extracted. The train reference could not be read and stays out of the Canvas until you repair it.", "4 个字段已抽取；高铁字段无法辨认，在手工修正前不会进入 Canvas。"),
  review: P("Review the proposed Canvas changes", "查看 Canvas 改动提案"),
  privacy: P("This is a static example. No real file is uploaded, stored or recognised.", "这里只展示静态示例，不会上传、存储或识别真实文件。"),
};
