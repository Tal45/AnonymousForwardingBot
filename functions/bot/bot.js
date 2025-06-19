const { Telegraf } = require('telegraf');
const { session } = require('telegraf');
const { message } = require('telegraf/filters');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

const TOPIC_ID = parseInt(process.env.TOPIC_ID);
const ADMINS = process.env.ADMINS.split(',').map(id => parseInt(id.trim()));
const FEEDBACK_CHANNEL_ID = process.env.FEEDBACK_CHANNEL_ID;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const SUPA_TABLE = process.env.SUPABASE_TABLE;
const SUPA_KEY = process.env.SUPABASE_KEY_NAME;

function getMainMenu() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✉️ Send Anonymous Message', callback_data: 'anon' }],
                [{ text: '🗣️ Send Feedback', callback_data: 'feedback' }],
                [{ text: '⚙️ Admin Panel', callback_data: 'admin' }]
            ]
        }
    };
}

function getAdminPanel() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 On', callback_data: 'admin_on' }, { text: '⛔ Off', callback_data: 'admin_off' }],
                [{ text: '📊 Status', callback_data: 'admin_status' }],
                [{ text: '📥 Fetch', callback_data: 'admin_fetch' }, { text: '🧹 Clean', callback_data: 'admin_clean' }],
                [{ text: '🚫 Ban user', callback_data: 'admin_ban' }],
                [{ text: '🔗 Links', callback_data: 'admin_links' }],
                [{ text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }]
            ]
        }
    };
}


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

bot.on('callback_query', async (ctx) => {
    const action = ctx.callbackQuery.data;

    if (action === 'anon' || action === 'feedback') {
        ctx.session = ctx.session || {};
        ctx.session.mode = action;
        const prompt = action === 'anon' ? '📝 Please type your anonymous message:\n\n⚠️ Warning: This bot is actively monitored. Misuse — including spam, offensive language, or abuse — will result in permanent removal and blocking of the user. Please use responsibly.' : '💬 Please leave your feedback:';
        return ctx.reply(prompt);
    }

    if (action === 'admin') {
        if (!ADMINS.includes(ctx.from.id)) return ctx.reply('❌ You are not authorized.');
        return ctx.reply('🔧 Admin Panel:', getAdminPanel());
    }
    if (action === 'back_to_main') {
        ctx.session = {};
        return ctx.reply('Please choose an option from the menu to proceed:', getMainMenu());
    }

    if (!ADMINS.includes(ctx.from.id)) return ctx.reply('❌ You are not authorized.');

    switch (action) {
        case 'admin_on':
            await setBotEnabled(true);
            return ctx.reply('✅ Bot is now *enabled*.', { parse_mode: 'Markdown' });
        case 'admin_off':
            await setBotEnabled(false);
            return ctx.reply('🛑 Bot is now *disabled*.', { parse_mode: 'Markdown' });
        case 'admin_status': {
            const enabled = await isBotEnabled();
            const status = enabled ? '🟢 Enabled' : '🔴 Disabled';
            return ctx.reply(`Current bot status: *${status}*`, { parse_mode: 'Markdown' });
        }
        case 'admin_fetch': {
            const { data, error } = await supabase
                .from('messages')
                .select('user_id, username, message, created_at')
                .order('created_at', { ascending: false })
                .limit(5);

            if (error || !data || data.length === 0) return ctx.reply('📭 No messages found.');

            const formatted = data.map((row, i) => 
                `#${i + 1} - ${row.username || 'Unknown'} (${row.user_id}):\n${row.message}`
            ).join('\n\n');

            return ctx.reply(`📝 Last 5 messages:\n\n${formatted}`);
        }
        case 'admin_clean': {
            const { data, error } = await supabase
                .from('messages')
                .delete()
                .not('id', 'is', null)
                .select();

            if (error) return ctx.reply('⚠️ Failed to clean the messages table.');

            const deletedCount = data?.length || 0;
            return ctx.reply(`🧹 Successfully deleted ${deletedCount} message(s).`);
        }
        case 'admin_ban': {
            ctx.session.mode = 'ban_waiting';
            return ctx.reply('🚫 Please enter the user ID to ban:');
        }
        case 'admin_links': {
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
            await ctx.telegram.sendMessage(parseInt(process.env.CHANNEL_ID), messageText, {
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
            return ctx.reply('✅ Links posted to the Blue Jay Aviation Channel!.');
        }
    }
});

bot.start(async ctx => {
    ctx.session = {}; // Reset mode
    return ctx.reply(
  '📋 Hi, this is *BJA Anonymous Messaging Bot*, which will anonymously forward your text to BJA.',
  { ...getMainMenu(), parse_mode: 'Markdown' });    
});

bot.on(message('text'), async (ctx) => {
    if (ctx.message.chat.type !== 'private') return;

    const enabled = await isBotEnabled();
    if (!enabled) return ctx.reply('🛑 Bot is currently *disabled*.', { parse_mode: 'Markdown' });

    const mode = ctx.session?.mode;
    const { id: user_id, username } = ctx.from;
    const text = ctx.message.text?.trim();

    const { data: bannedUser } = await supabase
        .from('blacklist')
        .select('user_id')
        .eq('user_id', user_id)
        .maybeSingle();

    if (bannedUser) return ctx.reply('🚫 You are banned from using this bot.');

    if (mode === 'anon') {
        await supabase.from('messages').insert([{ user_id, username, message: text }]);
        await ctx.telegram.sendMessage(process.env.GROUP_ID, text, {
            message_thread_id: TOPIC_ID
        });
        ctx.session.mode = null;
        return ctx.reply('✅ Your message has been sent anonymously.');
    }

    if (mode === 'feedback') {
        const now = new Date();
        const dateStr = now.toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem' });
        const escapeMarkdownV2 = (text) => {
            return text.replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, '\\$1');
        };

        const safeFeedback = escapeMarkdownV2(text);
        const safeName = escapeMarkdownV2(ctx.from.first_name || '');
        const safeUsername = escapeMarkdownV2(ctx.from.username || '');
        const safeDate = escapeMarkdownV2(dateStr);
        const user_id = ctx.from.id;

        const formattedFeedback = `📝 *New Feedback Received*\n\n👤 From: ${safeName} \\(@${safeUsername}\\)\n🆔 ID: ${user_id}\n🕒 Date: ${safeDate}\n\n💬 ${safeFeedback}`;

        await ctx.telegram.sendMessage(FEEDBACK_CHANNEL_ID, formattedFeedback, {
            parse_mode: 'MarkdownV2'
        });

        ctx.session.mode = null;
        return ctx.reply('✅ Thank you! Your feedback has been submitted.');
    }

    if (mode === 'ban_waiting' && ADMINS.includes(user_id)) {
        const targetId = parseInt(text);
        if (isNaN(targetId)) return ctx.reply('⚠️ Invalid ID. Please send a valid numeric user ID.');

        await supabase.from('blacklist').upsert([{ user_id: targetId }]);
        ctx.session.mode = null;
        return ctx.reply(`✅ User ${targetId} has been banned.`);
    }

    ctx.reply('Please choose an option from the menu to proceed:', getMainMenu());
});

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

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('Bot is running');

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
