# Marshall Kitchen 智能点菜网站

这是一个从微信小程序思路迁移到 GitHub Pages 的静态点菜网站，支持：

- 菜品分类浏览和关键词搜索
- 菜品图片配置
- 购物车数量调整、合计金额计算
- 按人数、预算、口味偏好生成智能推荐
- 顾客填写姓名、电话、桌号/取餐方式和备注后提交订单
- 使用 EmailJS 自动发送订单邮件，未配置时回退到本机邮件客户端

## 部署到 GitHub Pages

1. 将本仓库推送到 GitHub。
2. 打开仓库 `Settings` → `Pages`。
3. `Build and deployment` 选择 `Deploy from a branch`。
4. Branch 选择当前分支，目录选择 `/root`。
5. 保存后等待 GitHub Pages 构建完成。

## 配置菜品图片

图片目录已经预留在：`github/images/`。

把图片上传到该目录，并在 `github/images/image-config.js` 中配置文件名即可。默认图片清单见 `github/images/README.md`。

## 配置邮件发送

GitHub Pages 是静态托管，不能直接连接 SMTP。网站已集成 EmailJS 浏览器端发信方案：

1. 注册并登录 [EmailJS](https://www.emailjs.com/)。
2. 创建 Email Service。
3. 创建 Email Template，建议包含这些变量：
   - `to_email`
   - `customer_name`
   - `customer_phone`
   - `table_number`
   - `order_note`
   - `order_detail`
   - `order_total`
4. 打开 `app.js`，把 `EMAIL_CONFIG` 中的 `publicKey`、`serviceId`、`templateId` 替换为你的值。
5. 默认收件邮箱为 `mxinyu2003@163.com`。

> 你提供的邮箱写作 `mxinyu2003@163,.com`，其中逗号会导致邮箱无效；本项目已按常见邮箱格式修正为 `mxinyu2003@163.com`。

## 本地预览

```bash
python3 -m http.server 4173
```

然后打开 `http://localhost:4173`。
