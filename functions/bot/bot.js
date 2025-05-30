const { Telegraf } = require('telegraf')
const { message } = require('telegraf/filters')
const dotenv = require('dotenv')
const fs = require('fs')

dotenv.config()

const bot = new Telegraf(process.env.BOT_TOKEN)
const TOPIC_ID = parseInt(process.env.TOPIC_ID)
const ADMINS = process.env.ADMINS.split(',').map(id => parseInt(id.trim()))
const STATUS_FILE = './status.json'

// --- Bot toggle logic ---
function isBotEnabled() {
    try {
        const data = fs.readFileSync(STATUS_FILE)
        return JSON.parse(data).enabled
    } catch (e) {
        return false
    }
}

function setBotEnabled(state) {
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ enabled: state }, null, 2))
}

// --- Commands ---
bot.command('on', (ctx) => {
    if (!ADMINS.includes(ctx.from.id)) return ctx.reply('❌ You are not authorized.')
    setBotEnabled(true)
    ctx.reply('✅ Bot is now *enabled*.', { parse_mode: 'Markdown' })
})

bot.command('off', (ctx) => {
    if (!ADMINS.includes(ctx.from.id)) return ctx.reply('❌ You are not authorized.')
    setBotEnabled(false)
    ctx.reply('🛑 Bot is now *disabled*.', { parse_mode: 'Markdown' })
})

bot.command('status', (ctx) => {
    const status = isBotEnabled() ? '🟢 Enabled' : '🔴 Disabled'
    ctx.reply(`Current bot status: *${status}*`, { parse_mode: 'Markdown' })
})

// --- Start/help/filters ---
bot.start(async ctx => {
    return ctx.reply("Hi, this is *Wingtip Anonymous Messaging Bot*, which will anonymously forward your text to BJA. \nSimply start typing...", {
        parse_mode: "Markdown",
        reply_to_message_id: ctx.message?.message_id,
        allow_sending_without_reply: true,
        reply_markup: { force_reply: true, selective: true }
    })
})

bot.help((ctx) => ctx.reply('Send me any *textual* messages to forward 🙃.', { parse_mode: 'Markdown' }))
bot.on(message('sticker'), (ctx) => {
    if (ctx.message.chat.type !== 'private') return
    ctx.reply('Please use emoji 🙃')
})

// --- Core message forwarding ---
bot.on(message('text'), async (ctx) => {
    if (ctx.message.chat.type !== 'private') return
    if (!isBotEnabled()) return ctx.reply('🛑 Bot is currently *disabled*.', { parse_mode: 'Markdown' })
    ctx.reply('Your message has been sent to BJA. Have a great day! 🙃')
    return ctx.telegram.sendMessage(process.env.GROUP_ID, ctx.message.text, {
        message_thread_id: TOPIC_ID
    })
})

// --- Reject non-text messages ---
const rejectMedia = async (ctx) => {
    if (ctx.message.chat.type !== 'private') return
    ctx.reply('Please send textual messages only!')
}

bot.on(message('photo'), rejectMedia)
bot.on(message('video'), rejectMedia)
bot.on(message('voice'), rejectMedia)
bot.on(message('audio'), rejectMedia)
bot.on(message('document'), rejectMedia)
bot.on(message('animation'), rejectMedia)
bot.on(message('contact'), rejectMedia)
bot.on(message('location'), rejectMedia)

// --- Graceful stop ---
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

console.log('Bot is running')

// --- AWS Lambda handler ---
exports.bot = bot
exports.handler = async event => {
    try {
        await bot.handleUpdate(JSON.parse(event.body))
        return { statusCode: 200, body: "" }
    } catch (e) {
        console.error("error in handler:", e)
        return { statusCode: 400, body: "This endpoint is meant for bot and telegram communication" }
    }
}
