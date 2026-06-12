const RESTAURANT_EMAIL = "mxinyu2003@163.com";

const EMAIL_CONFIG = {
  // 1. 注册 https://www.emailjs.com/
  // 2. 创建 Email Service 和 Email Template
  // 3. 将下面三项替换为你的实际配置，GitHub Pages 即可自动发邮件。
  publicKey: "",
  serviceId: "",
  templateId: "",
};

const imageBasePath = "github/images/";
const imageConfig = window.MK_IMAGE_CONFIG || {};

const dishes = [
  {
    id: "bbq-pork-rice",
    name: "蜜汁叉烧饭",
    category: "主食",
    price: 13.99,
    description: "港式蜜汁叉烧配米饭、时蔬和溏心蛋，甜咸平衡。",
    tags: ["人气", "微甜", "主食"],
    image: "bbq-pork-rice.jpg",
    score: 98,
  },
  {
    id: "beef-noodle",
    name: "红烧牛肉面",
    category: "面点",
    price: 12.99,
    description: "慢炖牛腩、浓郁汤底和劲道面条，适合一人食。",
    tags: ["热汤", "人气", "微辣"],
    image: "beef-noodle.jpg",
    score: 95,
  },
  {
    id: "spicy-chicken",
    name: "川香辣子鸡",
    category: "热菜",
    price: 16.99,
    description: "外酥里嫩的鸡块搭配干辣椒和花椒，香辣下饭。",
    tags: ["辣味", "下饭", "热菜"],
    image: "spicy-chicken.jpg",
    score: 92,
  },
  {
    id: "mapo-tofu",
    name: "麻婆豆腐",
    category: "热菜",
    price: 11.99,
    description: "豆腐嫩滑，麻辣鲜香，可选择少辣。",
    tags: ["辣味", "素食", "热菜"],
    image: "mapo-tofu.jpg",
    score: 90,
  },
  {
    id: "garlic-broccoli",
    name: "蒜蓉西兰花",
    category: "素菜",
    price: 9.99,
    description: "清爽少油，保留蔬菜脆嫩口感。",
    tags: ["清淡", "素食", "健康"],
    image: "garlic-broccoli.jpg",
    score: 86,
  },
  {
    id: "tomato-egg",
    name: "番茄炒蛋",
    category: "热菜",
    price: 10.99,
    description: "家常酸甜口味，老人儿童都适合。",
    tags: ["清淡", "家常", "素食"],
    image: "tomato-egg.jpg",
    score: 88,
  },
  {
    id: "spring-rolls",
    name: "脆皮春卷",
    category: "小吃",
    price: 6.99,
    description: "金黄酥脆，可搭配甜辣酱。",
    tags: ["小吃", "素食", "酥脆"],
    image: "spring-rolls.jpg",
    score: 84,
  },
  {
    id: "dumplings",
    name: "手工煎饺",
    category: "小吃",
    price: 8.99,
    description: "底部焦香，内馅多汁，适合分享。",
    tags: ["人气", "小吃", "分享"],
    image: "dumplings.jpg",
    score: 91,
  },
  {
    id: "mango-sago",
    name: "芒果西米露",
    category: "甜品饮品",
    price: 5.99,
    description: "清甜芒果、椰奶和西米，饭后解辣。",
    tags: ["甜品", "饮品", "清爽"],
    image: "mango-sago.jpg",
    score: 89,
  },
  {
    id: "lemon-tea",
    name: "港式冻柠茶",
    category: "甜品饮品",
    price: 3.99,
    description: "茶香浓郁，酸甜清爽。",
    tags: ["饮品", "清爽", "人气"],
    image: "lemon-tea.jpg",
    score: 87,
  },
];

const state = {
  category: "全部",
  search: "",
  cart: JSON.parse(localStorage.getItem("marshallKitchenCart") || "{}"),
};

const $ = (selector) => document.querySelector(selector);
const formatPrice = (value) => `$${value.toFixed(2)}`;

function saveCart() {
  localStorage.setItem("marshallKitchenCart", JSON.stringify(state.cart));
}

function getDish(id) {
  return dishes.find((dish) => dish.id === id);
}

function setFeaturedDish() {
  const featured = [...dishes].sort((a, b) => b.score - a.score)[0];
  $("#featuredDish").textContent = featured.name;
  $("#featuredDesc").textContent = featured.description;
}

function renderCategories() {
  const categories = ["全部", ...new Set(dishes.map((dish) => dish.category))];
  const container = $("#categoryTabs");
  container.innerHTML = "";
  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab${state.category === category ? " active" : ""}`;
    button.textContent = category;
    button.addEventListener("click", () => {
      state.category = category;
      renderCategories();
      renderMenu();
    });
    container.appendChild(button);
  });
}

function dishMatchesSearch(dish) {
  const keyword = state.search.trim().toLowerCase();
  if (!keyword) return true;
  return [dish.name, dish.category, dish.description, ...dish.tags]
    .join(" ")
    .toLowerCase()
    .includes(keyword);
}

function getFilteredDishes() {
  return dishes.filter((dish) => {
    const categoryMatch = state.category === "全部" || dish.category === state.category;
    return categoryMatch && dishMatchesSearch(dish);
  });
}

function renderMenu() {
  const container = $("#menu");
  const template = $("#menuCardTemplate");
  container.innerHTML = "";
  const filteredDishes = getFilteredDishes();

  if (!filteredDishes.length) {
    container.innerHTML = '<p class="cart-items empty">没有找到匹配菜品，请更换关键词。</p>';
    return;
  }

  filteredDishes.forEach((dish) => {
    const card = template.content.cloneNode(true);
    const image = card.querySelector(".dish-image");
    const configuredImage = imageConfig[dish.id] || dish.image;
    image.style.backgroundImage = `linear-gradient(135deg, rgba(246,179,64,.32), rgba(184,59,27,.4)), url('${imageBasePath}${configuredImage}')`;
    image.setAttribute("aria-label", dish.name);
    card.querySelector("h3").textContent = dish.name;
    card.querySelector(".price").textContent = formatPrice(dish.price);
    card.querySelector(".description").textContent = dish.description;
    card.querySelector(".tags").innerHTML = dish.tags.map((tag) => `<span class="tag">${tag}</span>`).join("");
    card.querySelector("button").addEventListener("click", () => addToCart(dish.id));
    container.appendChild(card);
  });
}

function addToCart(id, quantity = 1) {
  state.cart[id] = (state.cart[id] || 0) + quantity;
  saveCart();
  renderCart();
}

function updateQuantity(id, delta) {
  const nextQuantity = (state.cart[id] || 0) + delta;
  if (nextQuantity <= 0) {
    delete state.cart[id];
  } else {
    state.cart[id] = nextQuantity;
  }
  saveCart();
  renderCart();
}

function getCartRows() {
  return Object.entries(state.cart)
    .map(([id, quantity]) => ({ dish: getDish(id), quantity }))
    .filter((row) => row.dish && row.quantity > 0);
}

function getCartTotal() {
  return getCartRows().reduce((total, row) => total + row.dish.price * row.quantity, 0);
}

function renderCart() {
  const container = $("#cartItems");
  const rows = getCartRows();
  $("#cartTotal").textContent = formatPrice(getCartTotal());

  if (!rows.length) {
    container.className = "cart-items empty";
    container.textContent = "购物车为空，请先选择菜品。";
    return;
  }

  container.className = "cart-items";
  container.innerHTML = rows.map((row) => `
    <div class="cart-row">
      <div>
        <h4>${row.dish.name}</h4>
        <small>${formatPrice(row.dish.price)} × ${row.quantity} = ${formatPrice(row.dish.price * row.quantity)}</small>
      </div>
      <div class="qty" aria-label="调整 ${row.dish.name} 数量">
        <button type="button" data-id="${row.dish.id}" data-delta="-1">−</button>
        <strong>${row.quantity}</strong>
        <button type="button" data-id="${row.dish.id}" data-delta="1">+</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => updateQuantity(button.dataset.id, Number(button.dataset.delta)));
  });
}

function buildRecommendation({ people, budget, preference }) {
  const perPersonBudget = budget / people;
  const preferenceFilters = {
    spicy: (dish) => dish.tags.includes("辣味"),
    light: (dish) => dish.tags.includes("清淡"),
    vegetarian: (dish) => dish.tags.includes("素食"),
    popular: (dish) => dish.tags.includes("人气"),
    balanced: () => true,
  };
  const filter = preferenceFilters[preference] || preferenceFilters.balanced;
  const sorted = [...dishes].sort((a, b) => b.score - a.score);
  const preferred = sorted.filter(filter);
  const pool = preferred.length >= 3 ? preferred : sorted;
  const targetCount = Math.max(2, Math.min(people + 2, 6));
  const selected = [];
  let total = 0;

  const categoryOrder = ["主食", "热菜", "素菜", "小吃", "甜品饮品", "面点"];
  categoryOrder.forEach((category) => {
    if (selected.length >= targetCount) return;
    const candidate = pool.find((dish) => dish.category === category && !selected.includes(dish) && total + dish.price <= budget);
    if (candidate) {
      selected.push(candidate);
      total += candidate.price;
    }
  });

  pool.forEach((dish) => {
    if (selected.length >= targetCount) return;
    if (!selected.includes(dish) && total + dish.price <= budget) {
      selected.push(dish);
      total += dish.price;
    }
  });

  if (!selected.length) {
    const cheapest = [...dishes].sort((a, b) => a.price - b.price)[0];
    selected.push(cheapest);
    total = cheapest.price;
  }

  return { selected, total, perPersonBudget };
}

function renderRecommendation(event) {
  event.preventDefault();
  const people = Number($("#peopleCount").value) || 1;
  const budget = Number($("#budget").value) || 0;
  const preference = $("#preference").value;
  const result = buildRecommendation({ people, budget, preference });
  const resultBox = $("#recommendResult");
  resultBox.hidden = false;
  resultBox.innerHTML = `
    <strong>已为 ${people} 人生成 ${result.selected.length} 道推荐，总价 ${formatPrice(result.total)}，人均约 ${formatPrice(result.total / people)}。</strong>
    <ul>${result.selected.map((dish) => `<li>${dish.name} - ${formatPrice(dish.price)}</li>`).join("")}</ul>
    <button class="button small" type="button" id="addRecommendation">一键加入购物车</button>
  `;
  $("#addRecommendation").addEventListener("click", () => {
    result.selected.forEach((dish) => addToCart(dish.id));
    location.hash = "#order";
  });
}

function buildOrderText(formData) {
  const rows = getCartRows();
  const dishLines = rows.map((row) => `${row.dish.name} x ${row.quantity} = ${formatPrice(row.dish.price * row.quantity)}`);
  return [
    "Marshall Kitchen 新订单",
    "----------------------",
    `顾客姓名：${formData.get("customerName")}`,
    `联系电话：${formData.get("customerPhone")}`,
    `桌号/取餐方式：${formData.get("tableNumber")}`,
    `备注：${formData.get("orderNote") || "无"}`,
    "",
    "菜品：",
    ...dishLines,
    "",
    `合计：${formatPrice(getCartTotal())}`,
    `提交时间：${new Date().toLocaleString("zh-CN")}`,
  ].join("\n");
}

async function sendOrderEmail(orderText, formData) {
  const configured = EMAIL_CONFIG.publicKey && EMAIL_CONFIG.serviceId && EMAIL_CONFIG.templateId && window.emailjs;
  if (configured) {
    emailjs.init({ publicKey: EMAIL_CONFIG.publicKey });
    return emailjs.send(EMAIL_CONFIG.serviceId, EMAIL_CONFIG.templateId, {
      to_email: RESTAURANT_EMAIL,
      customer_name: formData.get("customerName"),
      customer_phone: formData.get("customerPhone"),
      table_number: formData.get("tableNumber"),
      order_note: formData.get("orderNote") || "无",
      order_detail: orderText,
      order_total: formatPrice(getCartTotal()),
    });
  }

  const subject = encodeURIComponent("Marshall Kitchen 新订单");
  const body = encodeURIComponent(orderText);
  window.location.href = `mailto:${RESTAURANT_EMAIL}?subject=${subject}&body=${body}`;
  return Promise.resolve();
}

async function submitOrder(event) {
  event.preventDefault();
  const status = $("#emailStatus");
  const rows = getCartRows();
  if (!rows.length) {
    status.className = "form-hint error";
    status.textContent = "购物车为空，无法提交订单。";
    return;
  }

  const formData = new FormData(event.currentTarget);
  const orderText = buildOrderText(formData);
  status.className = "form-hint";
  status.textContent = "正在准备邮件，请稍候……";

  try {
    await sendOrderEmail(orderText, formData);
    status.className = "form-hint success";
    status.textContent = "订单已生成。若已配置 EmailJS，邮件会自动发送；否则请在弹出的邮件窗口中点击发送。";
    state.cart = {};
    saveCart();
    renderCart();
    event.currentTarget.reset();
  } catch (error) {
    status.className = "form-hint error";
    status.textContent = "邮件发送失败，请检查 EmailJS 配置或网络后重试。";
    console.error(error);
  }
}

function bindEvents() {
  $("#searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderMenu();
  });
  $("#recommendForm").addEventListener("submit", renderRecommendation);
  $("#checkoutForm").addEventListener("submit", submitOrder);
}

function init() {
  $("#year").textContent = new Date().getFullYear();
  if (imageConfig.hero) {
    document.querySelector(".hero").style.backgroundImage = `radial-gradient(circle at 85% 12%, rgba(246, 179, 64, 0.45), transparent 28%), linear-gradient(135deg, rgba(184, 59, 27, 0.95), rgba(74, 29, 12, 0.94)), url("${imageBasePath}${imageConfig.hero}")`;
  }
  setFeaturedDish();
  renderCategories();
  renderMenu();
  renderCart();
  bindEvents();
}

init();
