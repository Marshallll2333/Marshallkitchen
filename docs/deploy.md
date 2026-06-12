# 部署上线指南

## 1. 准备小程序

1. 登录 [微信公众平台](https://mp.weixin.qq.com/) 注册小程序。
2. 获取小程序 AppID。
3. 用微信开发者工具打开 `D:\Codex\workspace\智能点菜小程序`。
4. 将 `project.config.json` 中的 `appid` 从 `touristappid` 改成你的 AppID。

## 2. 开通云开发

1. 在微信开发者工具里点击「云开发」。
2. 创建一个云环境，建议命名为 `smart-kitchen`。
3. 将云环境 ID 填入 `miniprogram/config.js` 的 `cloudEnvId`，也可以留空使用默认云环境。

## 3. 创建数据库集合

在云开发数据库中创建这些集合：

```text
app_config
users
dishes
recipes
materials
seasonings
tools
carts
orders
stock_logs
```

建议权限：

- 所有业务集合先设置为「仅创建者及管理员可读写」或「所有用户不可读写，仅云函数可读写」。
- 前端所有业务读写都通过云函数完成，不直接开放数据库权限。

## 4. 导入初始化数据

把 `docs/seed` 里的 JSON 文件分别导入对应集合：

| 文件 | 集合 |
|---|---|
| `app_config.json` | `app_config` |
| `dishes.json` | `dishes` |
| `materials.json` | `materials` |
| `seasonings.json` | `seasonings` |
| `tools.json` | `tools` |
| `recipes.json` | `recipes` |

## 5. 绑定两个人的 openid

第一次打开小程序时，如果没有绑定身份，会进入「私人小厨房」页面并显示当前 openid。

把你的 openid 填进 `app_config` 集合 `_id = roles` 文档的 `chefOpenids`，把她的 openid 填进 `customerOpenids`：

```json
{
  "_id": "roles",
  "chefOpenids": ["你的openid"],
  "customerOpenids": ["她的openid"]
}
```

保存后重新打开小程序即可进入对应端。

## 6. 上传云函数

在微信开发者工具中，逐个右键 `cloudfunctions` 下的函数目录，选择：

```text
上传并部署：云端安装依赖
```

需要上传的函数包括：

```text
login
getAvailableDishes
getDishDetail
getCart
updateCart
submitOrder
getMyOrders
getOrderDetail
getChefOrders
acceptOrder
startCooking
getCookDetail
finishOrder
cancelOrder
getInventory
updateInventory
createDish
updateDish
updateRecipe
updateToolStatus
```

如果以后修改了 `cloudfunctions/_shared/index.js`，先运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-cloud-shared.ps1
```

再重新上传相关云函数。

## 7. 体验版和正式发布

1. 在微信开发者工具点击「上传」。
2. 到微信公众平台「版本管理」设为体验版。
3. 用你的手机和她的手机分别测试完整流程。
4. 测试通过后提交审核。
5. 审核通过后发布正式版。

## 8. 隐私与审核提示

首版不收集手机号、地址、支付信息，也不接真实支付。若使用头像昵称或订阅消息，需要在微信公众平台按实际能力补充隐私保护指引。

