import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// Map is used for simplicity. For production use a database
const paidUsers = new Map();
const userBalances = new Map(); // Додано для зберігання балансів користувачів

bot.command("start", (ctx) => {
  const commandsMenu = `
/start - Перезапустити бота.
/pay - Надсилає дані для оплати зірок.
/paylink - Надсилає деталі для оплати зірок.
/status - Перевірте статус платежу.
/refund - Повертає зірки на ваш баланс (виконується за 1-5 хв).
/refundbyid [ID операции] - Повертає кошти за допомогою ID операции.
/sendstars [Ідентифікатор користувача] [Кількість зірок] - Відправляє зірки іншому користувачеві.`;

  ctx.reply(`Ласкаво просимо! Ось доступні команди:\n${commandsMenu}`);
});

bot.command("pay", (ctx) => {
  try {
    return ctx.replyWithInvoice(
      "Донат зірочками", // Назва продукту
      "Ви донатите на підтримку автора та його проєктів. Велике дякую за донат!", // Опис продукту
      "{}", // Необов'язкове поле payload
      "XTR", // Валюта Telegram Stars
      [{ amount: 25, label: "Payment of «Telegram stars»" }] // Варіанти продукту
    );
  } catch (error) {
    console.error("Error sending invoice:", error);
    ctx.reply("Не вдалося створити інвойс.");
  }
});

bot.command("paylink", async (ctx) => {
  try {
    const response = await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
      title: "Донат зірочками", // Назва продукту
      description: "Ви донатите на підтримку автора та його проєктів. Велике дякую за донат!", // Опис продукту
      payload: "{}", // Необов'язкове поле payload
      provider_token: process.env.PROVIDER_TOKEN, // Токен провайдера
      currency: "XTR", // Валюта Telegram Stars
      prices: [{ label: "Payment of «Telegram Stars»", amount: 25 }]
    });

    const invoiceLink = response.data.result;

    ctx.reply(`Ось посилання для оплати: ${invoiceLink}`);
  } catch (error) {
    console.error("Error creating invoice link:", error);
    ctx.reply("Не вдалося створити посилання на інвойс.");
  }
});

bot.on("pre_checkout_query", async (ctx) => {
  try {
    await ctx.answerPreCheckoutQuery(true);
  } catch (error) {
    console.error("Error answering pre_checkout_query:", error);
  }
});

bot.on("message:successful_payment", (ctx) => {
  if (!ctx.message || !ctx.message.successful_payment || !ctx.from) {
    return;
  }

  const amount = ctx.message.successful_payment.total_amount / 100; // Переводимо з копійок в основні одиниці

  if (!userBalances.has(ctx.from.id)) {
    userBalances.set(ctx.from.id, amount);
  } else {
    const currentBalance = userBalances.get(ctx.from.id);
    userBalances.set(ctx.from.id, currentBalance + amount);
  }

  console.log(`Користувач ${ctx.from.id} отримав ${amount} зірок.`);
});

bot.command("status", (ctx) => {
  const balance = userBalances.get(ctx.from.id) || 0;
  const message = `Ваш поточний баланс: ${balance} зірок`;
  return ctx.reply(message);
});

bot.command("refund", async (ctx) => {
  const userId = ctx.from.id;
  if (!paidUsers.has(userId)) {
    return ctx.reply("Ви ще не заплатили, повертати нічого");
  }

  try {
    await ctx.api.refundStarPayment(userId, paidUsers.get(userId));
    paidUsers.delete(userId);
    ctx.reply("Повернення коштів відбулося успішно");
  } catch (error) {
    console.error("Error refunding payment:", error);
    ctx.reply("Повернення коштів не відбулося");
  }
});

bot.command("refundbyid", async (ctx) => {
  const paymentId = ctx.message?.text.split(" ")[1]; // Отримуємо ID операції з тексту команди

  if (!paymentId) {
    return ctx.reply("Введіть ID операції для повернення коштів");
  }

  try {
    await ctx.api.refundStarPayment(ctx.from.id, paymentId);
    paidUsers.delete(ctx.from.id); // Видаляємо запис з картки оплати за ID користувача
    ctx.reply("Повернення коштів відбулося успішно");
  } catch (error) {
    console.error("Error refunding payment by ID:", error);
    ctx.reply("Повернення коштів не відбулося");
  }
});

bot.command("sendstars", async (ctx) => {
  const [userId, amountStr] = ctx.message?.text.split(" ").slice(1);

  if (!userId || !amountStr) {
    return ctx.reply("Введіть ідентифікатор користувача і кількість зірок для відправлення.");
  }

  const amount = parseInt(amountStr, 10);

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("Будь ласка, введіть коректну кількість зірок для відправлення.");
  }

  const senderId = ctx.from.id;

  if (!userBalances.has(senderId) || userBalances.get(senderId) < amount) {
    return ctx.reply("Недостатньо зірок на вашому балансі для відправлення.");
  }

  if (!userBalances.has(userId)) {
    userBalances.set(userId, amount);
  } else {
    const currentBalance = userBalances.get(userId);
    userBalances.set(userId, currentBalance + amount);
  }

  userBalances.set(senderId, userBalances.get(senderId) - amount);

  ctx.reply(`Ви відправили ${amount} зірок користувачу з ID ${userId}.`);
});

bot.start();
