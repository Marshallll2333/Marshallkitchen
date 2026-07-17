# Lucy 的专属小厨房

这是一个给 Lucy 和 Marshall 私用的点菜网站。Lucy 在顾客端登录后点菜，Marshall 在厨师工作台接单、看配方、管理菜品和库存。项目为可部署到 GitHub Pages 的静态网站，并已经接入实际的 Supabase 数据库、EmailJS 邮件托管系统和 DeepSeek AI API。点击链接直接访问： https://marshallll2333.github.io/Marshallkitchen/

项目目录：

```text
D:\Codex\workspace\智能点菜小程序\gitproject
```

## 项目作用

这个网站解决的是“今天想吃什么、家里能不能做、Marshall 需要准备什么”的私用流程：

- Lucy 登录后浏览菜品、查看介绍、选择口味、加入点菜单并提交订单。
- Marshall 登录厨师工作台后查看订单、接单、开始制作、完成出餐。
- 厨师端维护菜品、配方、图片、库存、工具状态和操作记录。
- 数据通过 Supabase 在多设备之间同步。
- 顾客提交订单后通过 EmailJS 自动发邮件提醒 Marshall。
- 新增菜品时可以只输入菜名，由 DeepSeek 生成菜品信息和配方草稿。

## 当前接入的外部服务

### Supabase 数据库

项目已经配置 Supabase：
数据库表：

- `kitchen_state`：保存当前厨房的完整业务状态。
- `kitchen_audit_logs`：保存关键操作日志。

建表 SQL：

```text
supabase/schema.sql
```

当前项目没有单独的 `dishes`、`orders`、`materials` 等数据库表。这些业务数据都保存在 `kitchen_state.data` 这个 JSON 字段里。

### EmailJS 邮件托管

项目已经配置 EmailJS：


配置文件：


提交订单时，网站会调用 EmailJS 发送邮件。邮件中包含订单内容和导入厨师工作台的链接。

### DeepSeek AI API

DeepSeek 用于“AI 只填菜名”新增菜品功能。

配置方式：

- 打开网站「设置」。
- 在「DeepSeek AI」区域填写 API Key。
- API Key 只保存在当前浏览器 `localStorage`。
- API Key 不会写入 Supabase，也不会提交到 GitHub。

默认配置：

```text
Base URL: https://api.deepseek.com
Model: deepseek-v4-flash
```

## 登录账号

### 顾客端


登录状态保存在当前浏览器会话 `sessionStorage`，关闭浏览器后需要重新登录。

### 厨师工作台


厨师登录状态也保存在当前浏览器会话 `sessionStorage`。

## 功能清单

### 顾客点菜

- Lucy 账号密码登录。
- 浏览所有可展示菜品。
- 按分类和标签筛选菜品。
- 搜索菜名、分类、简介、标签和必须材料。
- 查看菜品介绍。
- 选择菜品数量。
- 选择口味：
  - 少盐
  - 少油
  - 不放葱
  - 不放蒜
  - 不辣
- 填写单品备注和整单备注。
- 选择吃饭时间：
  - 现在就吃
  - 30 分钟后
  - 今晚再吃
  - 自定义月、日、时间
- 加入点菜单。
- 修改点菜单数量。
- 提交订单。
- 提交订单后自动发送 EmailJS 邮件。

### 菜品展示和必须材料规则

每道菜可以配置 `requiredMaterials`，表示这道菜的主材料。

示例：

```js
requiredMaterials: ['土豆', '猪肉']
```

展示规则：

- 未上架：不展示到可点菜列表。
- 没有配方：不展示到可点菜列表。
- 工具不可用：不展示到可点菜列表。
- 必须材料完全没有库存：不展示到可点菜列表，进入“暂时做不了”。
- 至少有一种必须材料有库存，但其他材料或调料不足：仍展示，并显示黄色标签“缺少部分材料”。

当 Lucy 点“缺少部分材料”的菜时，会弹出提醒：

```text
缺少原材料哦，不过还是能做！请联系Marshall大厨~
```

### 厨师工作台

- 密码进入厨师工作台。
- 查看订单列表。
- 查看订单详情。
- 查看缺少项提醒。
- 接单。
- 开始制作。
- 完成出餐。
- 标记吃完。
- 取消订单。
- 查看做菜详情：
  - 原材料
  - 调味料
  - 工具
  - 步骤
  - 根据 Lucy 口味偏好调整后的用量

### 库存管理

- 管理原材料。
- 管理调配料。
- 管理工具。
- 原材料按素菜、荤菜、主食、其他分组。
- 调整库存数量。
- 新增库存项。
- 启用或停用工具。

### 菜品和图片管理

- 新增菜品。
- 删除菜品。
- 修改菜品名称。
- 修改分类。
- 修改价格。
- 修改制作时间。
- 修改图片地址。
- 上传本地图片。
- 修改简介。
- 修改菜品标签。
- 修改必须材料。
- 勾选上架。
- 勾选“Lucy最爱”。
- 点击“确定状态”后同步给顾客端。

### 配方管理

- 左侧选择菜品。
- 右侧编辑配方。
- 编辑原材料。
- 编辑调配料。
- 编辑工具。
- 编辑步骤。
- 配方格式：

```text
原材料/调配料：名称 数量 单位
工具：每行一个名称
步骤：每行一步
```

### AI 新增菜品

点击厨师端「新增菜品」后可选择两种模式：

1. AI 只填菜名
2. 手动填写

AI 模式流程：

- 输入菜名，例如 `乾隆白菜`。
- DeepSeek 自动生成：
  - 菜名
  - 分类
  - 价格
  - 制作时间
  - 简介
  - 标签
  - 必须材料
  - 原材料
  - 调配料
  - 工具
  - 步骤
- 生成结果先进入草稿。
- Marshall 可以继续编辑草稿。
- 点击确认后才创建菜品。
- AI 创建的新菜默认不上架，需要手动确认上架。

### 操作记录

厨师端「记录」页可以查看关键操作历史。

记录包括：

- 顾客加入点菜单。
- 顾客提交订单。
- 厨师导入订单。
- 厨师更新订单状态。
- 厨师新增菜品。
- AI 新增菜品。
- 厨师删除菜品。
- 厨师编辑菜品。
- 厨师编辑菜品标签。
- 厨师编辑必须材料。
- 厨师编辑配方。
- 厨师调整库存。
- 厨师新增库存项。
- 厨师调整工具状态。
- 厨师上传菜品图片。
- 恢复初始数据。

## 数据库读写说明

### 会读取数据库的操作

网站启动时会读取 Supabase：

- 从 `kitchen_state` 读取当前厨房状态。
- 从 `kitchen_audit_logs` 读取操作记录。

如果数据库里还没有 `kitchen_state`，网站会用本地初始数据创建一条 `id = main` 的记录。

### 会写入数据库的操作

以下操作会更新 `kitchen_state.data`，也就是会改数据库：

- 顾客加入点菜单。
- 顾客修改点菜单数量。
- 顾客填写整单备注。
- 顾客选择就餐时间。
- 顾客提交订单。
- 厨师接单、开始制作、完成出餐、标记吃完、取消订单。
- 厨师新增菜品。
- 厨师 AI 新增菜品。
- 厨师删除菜品。
- 厨师修改菜品名称、分类、价格、制作时间、简介、图片地址。
- 厨师修改菜品标签。
- 厨师修改必须材料。
- 厨师确认上架/下架。
- 厨师确认“Lucy最爱”。
- 厨师修改配方。
- 厨师新增库存项。
- 厨师调整原材料或调配料库存。
- 厨师启用或停用工具。
- 厨师上传菜品图片。
- 设置 EmailJS 信息。
- 恢复初始数据。

同时，以下关键操作还会向 `kitchen_audit_logs` 新增一条日志：

- 顾客加入点菜单。
- 顾客提交订单。
- 厨师订单状态更新。
- 厨师导入订单。
- 厨师新增、删除、编辑菜品。
- 厨师修改标签、必须材料、配方。
- 厨师新增或调整库存。
- 厨师调整工具状态。
- 厨师上传图片。
- 恢复初始数据。

### 不会写入数据库的内容

以下内容只保存在当前浏览器：

- Lucy 顾客登录状态：`sessionStorage.privateKitchenCustomerUnlocked`
- 厨师登录状态：`sessionStorage.privateKitchenChefUnlocked`
- DeepSeek API Key：`localStorage.privateKitchenAiConfig`
- 当前搜索关键词。
- 当前打开的弹窗。
- 当前切换的页面标签。

### 重要提醒

厨师工作台里修改菜品信息时，不是在修改前端代码文件，而是在修改 Supabase 里的 `kitchen_state.data`。

前端代码文件只有在开发或重新部署时才会变化。网站运行时不会自动改 `app.js`、`styles.css`、`data/seed.js` 或 `config/*.js`。

## 本地使用

推荐用本地静态服务器打开：

```powershell
cd D:\Codex\workspace\智能点菜小程序\gitproject
python -m http.server 8080
```

然后访问：

```text
http://localhost:8080
```

也可以直接双击 `index.html` 预览，但部分浏览器对本地文件的网络请求限制更严格，建议使用本地服务器。

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库，例如 `private-kitchen`。
2. 把 `gitproject` 目录里的所有文件提交到仓库。
3. 进入仓库 Settings -> Pages。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`。
6. Folder 选择 `/root`。
7. 保存后等待 GitHub Pages 发布。
8. 发布后得到类似地址：

```text
https://你的用户名.github.io/private-kitchen/
```

9. 打开网站「设置」，把这个地址填到「网站地址」。

这个地址会用于邮件里的“导入订单到厨师工作台”链接。

## 图片管理

成品菜图片建议放在：

```text
assets/dishes/
```

预留上传图片文件夹：

```text
assets/uploads/
```

厨师端可以直接填写图片相对路径，例如：

```text
assets/uploads/qianlong-cabbage.jpg
```

网页内直接上传本地图片时，图片会以 Data URL 的形式写入 Supabase 状态。这样可以立即跨设备显示，但长期使用更推荐把图片文件放进仓库，然后填写相对路径。

## 配置文件

### Supabase

```text
config/supabase-config.js
```

### EmailJS

```text
config/email-config.js
```

### 初始数据

```text
data/seed.js
```

初始数据只在数据库没有状态或执行“恢复初始数据”时使用。正常使用时，以 Supabase 里的 `kitchen_state.data` 为准。

## 安全说明

- 这个项目是情侣私用工具，不适合作为公开商业点餐系统。
- Supabase 当前 RLS 策略为了简单部署，允许匿名读写项目数据。
- 不要把 GitHub Pages 地址公开传播。
- 不要把 DeepSeek API Key 写进项目文件。
- 不要把 EmailJS Secret、邮箱密码或 163 授权码写进项目文件。
- 厨师密码和顾客密码目前是前端私用门禁，不是高安全登录系统。
