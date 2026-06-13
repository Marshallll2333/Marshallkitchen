# EmailJS 邮件配置

## 为什么需要 EmailJS

GitHub Pages 是静态网站，不能在服务器上安全地保存邮箱密码，也不能直接用 SMTP 发邮件。

所以网站使用 EmailJS 从浏览器发邮件。顾客提交订单后，会把订单内容发送到：

```text
mxinyu2003@163.com
```

你原先写的是 `mxinyu2003@163,.com`，这里已按常规邮箱格式修正为 `mxinyu2003@163.com`。

## 配置步骤

1. 打开 EmailJS 官网：`https://www.emailjs.com/`
2. 注册并登录。
3. 添加一个 Email Service，例如 163 邮箱或 Gmail。
4. 创建一个 Email Template。
5. 模板变量建议使用：

```text
{{to_email}}
{{order_no}}
{{order_summary}}
{{remark}}
{{expected_time}}
{{total_price}}
{{created_at}}
{{import_url}}
```

推荐邮件内容：

```text
她提交了一份新点菜单：

订单号：{{order_no}}
下单时间：{{created_at}}
期望时间：{{expected_time}}
合计：{{total_price}}

菜品：
{{order_summary}}

整单备注：
{{remark}}

点击导入订单到厨师工作台：
{{import_url}}
```

6. 复制 `Service ID`、`Template ID`、`Public Key`。
7. 打开 `config/email-config.js`，填入：

```js
window.KITCHEN_EMAIL_CONFIG = {
  enabled: true,
  serviceId: '你的Service ID',
  templateId: '你的Template ID',
  publicKey: '你的Public Key',
  toEmail: 'mxinyu2003@163.com',
  siteUrl: 'https://你的用户名.github.io/你的仓库名/'
}
```

8. 提交到 GitHub，重新部署。

## 网站内配置

你也可以在网站「设置」页临时填写 EmailJS 信息。它会保存在当前浏览器 localStorage 中。

如果要让 GitHub Pages 上所有访问者都默认使用这套配置，还是建议修改 `config/email-config.js` 并提交。

