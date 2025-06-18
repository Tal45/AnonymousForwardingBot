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

bot.command('clean', async (ctx) => {
    if (!ADMINS.includes(ctx.from.id)) {
        return ctx.reply('❌ You are not authorized to use this command.');
    }

    const { data, error } = await supabase
        .from('messages')
        .delete()
        .not('id', 'is', null)
        .select();

    if (error) {
        console.error("Supabase delete error:", error.message);
        return ctx.reply('⚠️ Failed to clean the messages table.');
    }

    const deletedCount = data?.length || 0;
    ctx.reply(`🧹 Successfully deleted ${deletedCount} message(s) from the table.`);
});

bot.command('fetch', async (ctx) => {
    if (!ADMINS.includes(ctx.from.id)) {
        return ctx.reply('❌ You are not authorized to use this command.');
    }

    const { data, error } = await supabase
        .from('messages')
        .select('user_id, username, message, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Supabase fetch error:", error.message);
        return ctx.reply('⚠️ Failed to fetch messages.');
    }

    if (!data || data.length === 0) {
        return ctx.reply('📭 No messages found.');
    }

    const formatted = data.map((row, i) => 
        `#${i + 1} - ${row.username || 'Unknown'} (${row.user_id}):\n${row.message}`
    ).join('\n\n');

    ctx.reply(`📝 Last 5 messages:\n\n${formatted}`);
});


bot.command('ban', async (ctx) => {
    if (!ADMINS.includes(ctx.from.id)) {
        return ctx.reply('❌ You are not authorized to use this command.');
    }

    const parts = ctx.message.text.split(' ');
    const targetId = parseInt(parts[1]);

    if (isNaN(targetId)) {
        return ctx.reply('⚠️ Usage: /ban <user_id>');
    }

    const { error } = await supabase
        .from('blacklist')
        .upsert([{ user_id: targetId }]);

    if (error) {
        console.error("Supabase ban error:", error.message);
        return ctx.reply('❌ Failed to ban the user.');
    }

    ctx.reply(`✅ User ${targetId} has been banned.`);
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

    const CHANNEL_ID = parseInt(process.env.CHANNEL_ID);

    await ctx.telegram.sendMessage(CHANNEL_ID, messageText, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛋️ Lounge', url: 'https://t.me/+V2SBxQBz0Z9hOWQ0' }],
                [{ text: '✈️ Commercial Aviation', url: 'https://t.me/+OszqxsBH8vY0NjBk' }],
                [{ text: '🧑‍🏫 Flight Instructors', url: 'https://t.me/+swR-eigAntViN2I0' }],
                [{ text: '👨‍✈️ Cadet Pilots', url: 'https://t.me/+8ynMfyN0zzZlNDlk' }]
            ]
        }
});


    ctx.reply('✅ Links posted to the Blue Jay Aviation Channel!.');
});

// --- Feedback Functionality --- 
bot.command('feedback', async (ctx) => {
  const feedback = ctx.message.text.split(' ').slice(1).join(' ').trim();

  if (!feedback) {
    return ctx.reply('❗ Please provide feedback after the command. Example:\n/feedback This bot is awesome!');
  }

  try {
    const user = ctx.from;
    const now = new Date();
    const dateStr = now.toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem' });

    const formattedFeedback = `📝 *New Feedback Received*

👤 From: ${user.first_name} (${user.username ? '@' + user.username : 'No username'})
🆔 ID: ${user.id}
🕒 Date: ${dateStr}

💬 "${feedback}"`;

    await ctx.telegram.sendMessage(process.env.FEEDBACK_CHANNEL_ID, formattedFeedback, {
      parse_mode: 'Markdown',
    });

    ctx.reply('✅ Thank you! Your feedback has been submitted.');
  } catch (err) {
    console.error('Error sending feedback:', err);
    ctx.reply('⚠️ An error occurred while sending your feedback. Please try again later.');
  }
});

// --- Start/help/filters ---
bot.start(async ctx => {
    return ctx.reply("Hi, this is *BJA Anonymous Messaging Bot*, which will anonymously forward your text to BJA. \nSimply start typing...\n\n⚠️ Warning: This bot is actively monitored. Misuse — including spam, offensive language, or abuse — will result in permanent removal and blocking of the user. Please use responsibly.", {
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
    if (!enabled) {
        return ctx.reply('🛑 Bot is currently *disabled*.', { parse_mode: 'Markdown' });
    }

    const { id: user_id, username } = ctx.from;
    const message = ctx.message.text;

    // 🔒 Ban check BEFORE logging or forwarding
    const { data: bannedUser, error: banCheckError } = await supabase
        .from('blacklist')
        .select('user_id')
        .eq('user_id', user_id)
        .maybeSingle();

    if (banCheckError) {
        console.error("Ban check failed:", banCheckError.message);
        return ctx.reply('⚠️ Error checking access. Please try again later.');
    }

    if (bannedUser) {
        return ctx.reply('🚫 You are banned from using this bot.');
    }

    // 1. Log to Supabase
    const { error } = await supabase
        .from('messages')
        .insert([{ user_id, username, message }]);

    if (error) {
        console.error("Supabase insert error:", error.message);
        return ctx.reply('⚠️ Failed to log your message. Please try again later.');
    }

    // 2. Acknowledge + forward
    ctx.reply('Your message has been sent to BJA. Have a great day! 🙃\n\nWe’d love to hear your thoughts — feel free to send us feedback anytime using:\n/feedback <your message>');
    return ctx.telegram.sendMessage(process.env.GROUP_ID, message, {
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
