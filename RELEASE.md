# 超级泡泡周经营看板｜发布检查

每周更新静态经营数据、页面或诊断规则后，Codex 必须先执行：

```powershell
npm run verify:release
```

这条检查会验证脚本语法、自动化测试、生产构建、GitHub Pages 子路径下的真实浏览器打开情况、五个页面和 390px 手机宽度。任何一步失败，都不能发布。

检查通过后，店长只需在项目目录执行：

```powershell
git push origin main
```

GitHub Actions 会再次运行同一检查；只有全部通过，GitHub Pages 才会替换线上版本。发布后打开：

<https://z58479874.github.io/super-bubble-weekly-lite/>

确认周经营总览能打开、左侧五个入口可点击、手机流量可访问，即表示线上版本正常。
