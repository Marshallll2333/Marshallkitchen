# GitHub Pages 发布步骤

发布前先按 `docs/supabase.md` 配置 Supabase。未配置时，网站可以打开预览，但加入点菜单、提交订单、编辑菜品和调整库存会被拦截。

## 1. 初始化 Git 仓库

如果你把 `gitproject` 单独作为仓库：

```powershell
cd D:\Codex\workspace\智能点菜小程序\gitproject
git init
git add .
git commit -m "Initial private kitchen website"
```

## 2. 推送到 GitHub

在 GitHub 创建一个空仓库后：

```powershell
git remote add origin https://github.com/你的用户名/你的仓库名.git
git branch -M main
git push -u origin main
```

## 3. 开启 Pages

进入仓库：

```text
Settings -> Pages -> Build and deployment
```

选择：

```text
Source: Deploy from a branch
Branch: main
Folder: /root
```

保存后等待发布。

## 4. 配置网站地址

发布成功后，把 GitHub Pages 地址写入：

```text
config/email-config.js
```

字段：

```js
siteUrl: 'https://你的用户名.github.io/你的仓库名/'
```

这个地址会用于生成邮件里的「导入订单链接」。
