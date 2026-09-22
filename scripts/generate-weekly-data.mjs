import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import * as XLSX from "xlsx";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPaths = process.argv.slice(2).filter((value) => value !== "--").map((value) => path.resolve(value));

function readStaticDataset(source) {
  const match = source.match(/window\.LITE_DATA\s*=\s*([\s\S]*);\s*$/);
  return match ? JSON.parse(match[1]) : {};
}

if (inputPaths.length < 6) {
  throw new Error("请至少传入运营报表、销售办卡、新版直播、新版商品、订单成交明细、核销明细6个文件路径。售后与短视频可选。");
}

globalThis.window = globalThis;
globalThis.XLSX = XLSX;
await import(pathToFileURL(path.join(projectRoot, "scripts", "lib", "import-engine.js")).href);

const historySource = process.env.LITE_HISTORY_REF
  ? execFileSync("git", ["show", `${process.env.LITE_HISTORY_REF}:public/data.js`], { cwd: projectRoot, encoding: "utf8" })
  : await readFile(path.join(projectRoot, "public", "data.js"), "utf8");
const historical = readStaticDataset(historySource);

const files = await Promise.all(inputPaths.map(async (filePath) => {
  const bytes = await readFile(filePath);
  return new File([bytes], path.basename(filePath));
}));

const parsed = await globalThis.LiteImportEngine.parseFiles(files);
if (parsed.quality?.errors?.length) {
  throw new Error(`数据生成被阻止：\n${parsed.quality.errors.join("\n")}`);
}

const weeksById = new Map([...(historical.weeks || []), ...(parsed.weeks || [])].map((week) => [week.id, week]));
const weeks = [...weeksById.values()].sort((left, right) => left.startDate.localeCompare(right.startDate)).slice(-4).map((week) => ({
  ...week,
  reportId: `${String(week.startDate).replaceAll("-", "")}-${String(week.endDate).replaceAll("-", "")}`,
}));
const weekIds = new Set(weeks.map((week) => week.id));
const receptionByWeek = Object.fromEntries(Object.entries({ ...(historical.receptionByWeek || {}), ...(parsed.receptionByWeek || {}) }).filter(([weekId]) => weekIds.has(weekId)));
const douyinFacts = Object.fromEntries(Object.entries({ ...(historical.douyinFacts || {}), ...(parsed.douyinFacts || {}) }).filter(([weekId]) => weekIds.has(weekId)));
const quality = {
  ...parsed.quality,
  reconciliation: (parsed.quality?.reconciliation || []).filter((row) => weekIds.has(row.weekId)),
};
const dataset = {
  ...parsed,
  generatedAt: new Date().toISOString(),
  weeks,
  receptionByWeek,
  reception: weeks.length ? receptionByWeek[weeks.at(-1).id] || [] : [],
  douyinFacts,
  quality,
};

const output = `/* 由 scripts/generate-weekly-data.mjs 生成。最多保留最近4期标准经营快照；不含原始Excel明细。 */\nwindow.LITE_DATA = ${JSON.stringify(dataset, null, 2)};\n`;
await writeFile(path.join(projectRoot, "public", "data.js"), output, "utf8");

console.log(JSON.stringify({
  output: "public/data.js",
  weeks: weeks.map((week) => ({ id: week.id, label: week.label, range: week.range })),
  imports: quality.imports?.length || 0,
  warnings: quality.warnings?.length || 0,
}, null, 2));
