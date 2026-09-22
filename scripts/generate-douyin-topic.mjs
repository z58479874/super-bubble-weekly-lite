import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDouyinTopics, readWorkbookRows, sourceType } from "./lib/douyin-topic.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPaths = process.argv.slice(2).filter((item) => item !== "--").map((item) => path.resolve(item));
if (inputPaths.length < 4 || inputPaths.length > 5) throw new Error("请传入直播、商品、订单成交明细、核销明细，以及可选的售后明细Excel文件。");

const existingSource = await readFile(path.join(root, "public", "data.js"), "utf8");
const match = existingSource.match(/window\.LITE_DATA\s*=\s*([\s\S]*);\s*$/);
if (!match) throw new Error("无法读取现有 public/data.js 标准周数据。");
const data = JSON.parse(match[1]);
const input = {};
for (const filePath of inputPaths) {
  const rows = await readWorkbookRows(filePath);
  const type = sourceType(rows);
  if (type === "unknown") throw new Error(`无法识别Excel字段：${path.basename(filePath)}`);
  if (input[type]) throw new Error(`同一事实源不能同时写入两份：${type}`);
  input[type] = rows;
}
for (const type of ["live", "product", "orders", "redemptions"]) if (!input[type]) throw new Error(`缺少${type}数据源`);

const generated = buildDouyinTopics({ weeks: data.weeks || [], ...input });
data.douyinTopic = generated.topics;
data.douyinTopicMeta = { schemaVersion: "douyin-topic-v1", generatedAt: new Date().toISOString(), dataAsOf: generated.dataAsOf, sourceCounts: generated.sourceCounts, sourcePolicy: "订单成交明细仅计算本期成交财务事实；核销明细仅计算到店核销事实；直播与商品数据只用于效率和结构分析，不与订单成交额相加。" };
await writeFile(path.join(root, "public", "data.js"), `/* 由静态经营数据生成流程写入；不包含原始订单、商品或核销明细。 */\nwindow.LITE_DATA = ${JSON.stringify(data, null, 2)};\n`, "utf8");
console.log(JSON.stringify({ output: "public/data.js", dataAsOf: generated.dataAsOf, sourceCounts: generated.sourceCounts, weeks: Object.values(generated.topics).map((topic) => ({ id: topic.period.id, paid: topic.orders.userPaid, redeemed: topic.fulfillment.redeemedAmount, productReconciled: topic.quality.productReconciled, status: topic.status.label })) }, null, 2));
