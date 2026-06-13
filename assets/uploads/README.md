# 上传图片目录

这个目录预留给你手动放新增成品菜图片。

示例：

```text
assets/uploads/yuxiang-eggplant.jpg
```

然后在网站「厨师工作台 -> 菜品和图片」里，把对应菜品的图片地址填写为：

```text
assets/uploads/yuxiang-eggplant.jpg
```

网页里的「上传本地图片」按钮会把图片压缩后写入 Supabase 状态数据库，因此刷新页面后仍会保留，并且其他设备读取同一个 Supabase 项目时也能看到。

如果你希望图片以普通文件形式随 GitHub Pages 一起发布，也可以把图片文件放进这个目录并提交到 GitHub，然后使用上面的相对路径。
