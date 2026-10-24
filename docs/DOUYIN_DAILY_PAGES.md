# 抖音每日看板发布

访问地址：https://z58479874.github.io/super-bubble-weekly-lite/douyin-daily/

周报首页导航提供新窗口入口，保留原有周报及云同步配置。

只发布 public/douyin-daily 中四个汇总文件。原始 Excel、订单明细、顾客标识、售后编号、本地路径不发布；核验索引仅保留文件名、工作表和行号，完整核验需在本地进行。

现有 Vite 构建 base=/super-bubble-weekly-lite/；每日看板使用相对资源路径。GitHub Actions 运行既有测试、构建和浏览器发布检查，并校验每日看板脱敏及构建文件后发布 dist。

更新时先在本地重新生成脱敏汇总，再替换上述四个文件，运行 node scripts/check-douyin-daily.mjs 和 pnpm verify:release 后提交。不要直接复制完整本地 index.html。

静态页面浏览器检查对已配置的周报云端读取使用只读空数据夹具，避免外部服务 DNS 中断误阻止静态发布；生产构建仍保留原有云端配置。此检查不代表线上云服务可用，云同步行为由既有单元测试覆盖。
