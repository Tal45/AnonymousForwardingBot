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
