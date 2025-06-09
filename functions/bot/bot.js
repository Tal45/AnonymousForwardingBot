const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const TOPIC_ID = parseInt(process.env.TOPIC_ID);
const ADMINS = process.env.ADMINS.split(',').map(id => parseInt(id.trim()));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const SUPA_TABLE = process.env.SUPABASE_TABLE;
const SUPA_KEY = process.env.SUPABASE_KEY_NAME;

// --- Supabase-based toggle ---
async function isBotEnabled() {
    const { data, error } = await supabase
        .from(SUPA_TABLE)
        .select('value')
        .eq('key', SUPA_KEY)
        .single();

    if (error) {
        console.error("Supabase read error:", error.message);
        return false;
    }

    return data?.value === 'true';
}

async function setBotEnabled(state) {
    const { error } = await supabase
        .from(SUPA_TABLE)
        .update({ value: String(state) })
        .eq('key', SUPA_KEY);

    if (error) {
        console.error("Supabase write error:", error.message);
    }
}

// --- Admin commands ---
bot.command('on', async (ctx) => {
    if (!ADMINS.includes(ctx.from.id)) return ctx.reply('❌ You are not authorized.');
    await setBotEnabled(true);
    ctx.reply('✅ Bot is now *enabled*.', { parse_mode: 'Markdown' });
});

bot.command('off', async (ctx) => {
    if (!ADMINS.includes(ctx.from.id)) return ctx.reply('❌ You are not authorized.');
    await setBotEnabled(false);
    ctx.reply('🛑 Bot is now *disabled*.', { parse_mode: 'Markdown' });
});

bot.command('status', async (ctx) => {
    const enabled = await isBotEnabled();
    const status = enabled ? '🟢 Enabled' : '🔴 Disabled';
    ctx.reply(`Current bot status: *${status}*`, { parse_mode: 'Markdown' });
});

bot.command('links', async (ctx) => {
    if (!ADMINS.includes(ctx.from.id)) {
        return ctx.reply('❌ You are not authorized to use this command.');
    }

    const messageText = `
ברוכים הבאים לערוץ *Blue Jay Aviation* - קורת הגג של הטייסים הישראלים! ✈️

בערוץ תוכלו לצפות בהודעות בצורה מסודרת ומרוכזת, כמו כן גם להיכנס לשאר הקבוצות הרלוונטיות.

⚠️ *שימו לב!*  
לכל קבוצה יצטרך להתבצע אישור ע״י אחד מהאדמינים *(נעמי / מאור)* אשר יכלול שאלון כדי לוודא שאינכם בוט, שפרטיותכם נשמרת ושהקבוצה תשאר מקצועית.

📌 *הקבוצות שלנו:*

🔹 *Lounge*  
כאן הכל קורה - טיפים מקצועיים, נושאים חמים בתעופה ודיונים פתוחים.

🔹 *Commercial Aviation*  
דיונים מקצועיים עבור טייסי איירליין, קרגו וביזנס ג'ט.

🔹 *Flight Instructors*  
קבוצה למדריכי טיס וחניכי הדרכה.

🔹 *Cadet Pilots*  
קבוצה לטייסים אשר התחילו את דרכם המקצועית, מהלימודים ועד סיום ליין טריינינג.

📌 *בחרו קבוצה להצטרפות מהכפתורים למטה:*
`;

    const LINKS_TOPIC_ID = parseInt(process.env.LINKS_TOPIC_ID);

    await ctx.telegram.sendMessage(process.env.GROUP_ID, messageText, {
        parse_mode: 'Markdown',
        message_thread_id: LINKS_TOPIC_ID,
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🛋️ Lounge', url: 'https://t.me/+V2SBxQBz0Z9hOWQ0' }
                ],
                [
                    { text: '✈️ Commercial Aviation', url: 'https://t.me/+OszqxsBH8vY0NjBk' }
                ],
                [
                    { text: '🧑‍🏫 Flight Instructors', url: 'https://t.me/+swR-eigAntViN2I0' }
                ],
                [
                    { text: '👨‍✈️ Cadet Pilots', url: 'https://t.me/+8ynMfyN0zzZlNDlk' }
                ]
            ]
        }
    });

    ctx.reply('✅ Links posted to the group.');
});


// --- Start/help/filters ---
bot.start(async ctx => {
    return ctx.reply("Hi, this is *BJA Anonymous Messaging Bot*, which will anonymously forward your text to BJA. \nSimply start typing...", {
        parse_mode: "Markdown",
        reply_to_message_id: ctx.message?.message_id,
        allow_sending_without_reply: true,
        reply_markup: { force_reply: true, selective: true }
    });
});

bot.help((ctx) => ctx.reply('Send me any *textual* messages to forward 🙃.', { parse_mode: 'Markdown' }));
bot.on(message('sticker'), (ctx) => {
    if (ctx.message.chat.type !== 'private') return;
    ctx.reply('Please use emoji 🙃');
});

// --- Message forwarding ---
bot.on(message('text'), async (ctx) => {
    if (ctx.message.chat.type !== 'private') return;
    const enabled = await isBotEnabled();
    if (!enabled) return ctx.reply('🛑 Bot is currently *disabled*.', { parse_mode: 'Markdown' });

    ctx.reply('Your message has been sent to BJA. Have a great day! 🙃');
    return ctx.telegram.sendMessage(process.env.GROUP_ID, ctx.message.text, {
        message_thread_id: TOPIC_ID
    });
});

// --- Reject non-text messages ---
const rejectMedia = async (ctx) => {
    if (ctx.message.chat.type !== 'private') return;
    ctx.reply('Please send textual messages only!');
};

bot.on(message('photo'), rejectMedia);
bot.on(message('video'), rejectMedia);
bot.on(message('voice'), rejectMedia);
bot.on(message('audio'), rejectMedia);
bot.on(message('document'), rejectMedia);
bot.on(message('animation'), rejectMedia);
bot.on(message('contact'), rejectMedia);
bot.on(message('location'), rejectMedia);

// --- Graceful stop ---
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('Bot is running');

// --- Netlify or Render function handler ---
exports.bot = bot;
exports.handler = async event => {
    try {
        await bot.handleUpdate(JSON.parse(event.body));
        return { statusCode: 200, body: "" };
    } catch (e) {
        console.error("error in handler:", e);
        return { statusCode: 400, body: "This endpoint is meant for bot and telegram communication" };
    }
};
