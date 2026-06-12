# 专属小厨房网站版

这是从微信小程序版转换来的静态网站项目，可以直接部署到 GitHub Pages。

## 功能

- 顾客端：浏览可制作菜品、查看菜品图片、选择口味、加入点菜单、提交订单。
- 厨师端：查看订单、接单、开始制作、查看做菜详情、完成出餐、扣减库存。
- 库存管理：维护原材料、调配料、工具状态。
- 菜品管理：新增/编辑菜品、配置图片、上传本地图片、上架/下架。
- 配方管理：维护每道菜的原材料、调配料、工具和步骤。
- 邮件通知：顾客提交订单后发送邮件到 `mxinyu2003@163.com`。
- 数据库同步：通过 Supabase 保存订单、购物车、库存、菜品、配方和操作记录。
- 静态站跨设备兜底方案：邮件里包含订单导入链接，厨师点击后可导入订单到工作台。

## 本地查看

直接双击 `index.html` 可以查看大部分效果。更推荐用本地静态服务器：

```powershell
python -m http.server 8080
```

然后打开：

```text
http://localhost:8080
```

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库，例如 `private-kitchen`。
2. 把 `gitproject` 目录里的所有文件提交到仓库。
3. 进入仓库 Settings -> Pages。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`。
6. 保存后等待 GitHub Pages 发布。
7. 发布后得到类似地址：

```text
https://你的用户名.github.io/private-kitchen/
```

8. 打开网站「设置」，把这个地址填到「网站地址」。

## 数据库同步

部署前请先配置 Supabase，否则保存类操作会被拦截，只能预览页面。

完整建表和配置说明看：

```text
docs/supabase.md
```

## 邮件发送

静态 GitHub Pages 不能安全地直接发送 SMTP 邮件，所以本项目使用 EmailJS。

未配置 EmailJS 时，提交订单会自动打开系统邮件客户端作为兜底。

完整配置看：

```text
docs/emailjs.md
```

## 图片

成品菜图片放在：

```text
assets/dishes/
```

预留上传图片文件夹：

```text
assets/uploads/
```

在厨师端「菜品和图片」里，可以：

- 填写图片相对路径，例如 `assets/uploads/my-dish.jpg`
- 直接选择本地图片上传，上传结果会写入当前 Supabase 数据库状态

如果希望所有设备都能长期稳定看到新增图片，更推荐把图片文件放入仓库并重新提交到 GitHub，然后在菜品图片地址里填写相对路径。
