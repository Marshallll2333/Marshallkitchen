# 数据库字典

## app_config

用于全局配置。首版只需要一个文档：

```json
{
  "_id": "roles",
  "chefOpenids": [],
  "customerOpenids": []
}
```

## users

登录后由 `login` 云函数自动写入。

```json
{
  "openid": "微信openid",
  "role": "chef 或 customer",
  "nickname": "厨师",
  "avatarUrl": "",
  "tastePreferences": ["少盐"],
  "createdAt": "ISO时间",
  "updatedAt": "ISO时间"
}
```

## dishes

菜品展示信息，不包含完整配方。

```json
{
  "_id": "dish_tomato_egg",
  "name": "番茄炒蛋",
  "category": "家常菜",
  "price": 18,
  "costPrice": 6,
  "cookTime": 8,
  "emoji": "🍅",
  "imageUrl": "",
  "description": "酸甜开胃，适合配米饭",
  "tags": ["她爱吃", "快手菜"],
  "isFavorite": true,
  "isListed": true
}
```

## recipes

厨师端可见的配方、工具和步骤。

```json
{
  "dishId": "dish_tomato_egg",
  "materials": [{ "name": "鸡蛋", "amount": 2, "unit": "个" }],
  "seasonings": [{ "name": "盐", "amount": 2, "unit": "g" }],
  "tools": [{ "name": "炒锅" }],
  "steps": ["番茄洗净切块。"]
}
```

## orders

订单状态：

```text
SUBMITTED -> ACCEPTED -> COOKING -> READY -> FINISHED
CANCELLED
```

首版完成出餐后状态设置为 `READY`，表示「可以吃啦」。如需她确认吃完，可后续加一个顾客端确认完成按钮，将 `READY` 改为 `FINISHED`。

