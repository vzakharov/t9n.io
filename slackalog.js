const _ = require('lodash')

const {
    assign, has, remove, find, isString, isObject, isArray
} = _

require('dotenv').config()
const {
    slackToken, port, slackSigningSecret
} = process.env


const { WebClient } = require('@slack/web-api')
const slack = new WebClient(slackToken)

const { createEventAdapter } = require('@slack/events-api')
const slackListener = createEventAdapter(slackSigningSecret, { includeBody: true })

let slackalogs = {}
let botIdByTeamId = {}

with (slackListener) {
    on('message', processMessage)
    on('app_mention', processMessage)    
}

async function processMessage(event, body) {
    console.log(event)

    let {type, subtype, user, text, message, bot_id} = event
    if (!text)
        text = message.text
    text = text.replace(/\<mailto.*\|(.*)>/, '$1')
    
    let {team_id} = body

    if (type == 'message') {
        if (bot_id || subtype)
            return
        let botId = botIdByTeamId[team_id] 
        if (!botId) {
            botId = (await slack.auth.test()).user_id
            botIdByTeamId[team_id] = botId
        }
        if (user == botId)
            return
    } else if (type == 'app_mention') {
        text = text.match(/(?<=<@.*?> ).*/)[0]
    }

    let {channel, thread_ts, ts} = event
    if (!thread_ts) thread_ts = ts

    let userId = `${team_id}.${user}`
    let slackalogId = `${userId}.${thread_ts}`

    let slackalog = slackalogs[slackalogId]

    if (!slackalog) {
        slackalog = slackalogs[slackalogId] = new Slackalog()
        assign(slackalog, { channel, thread_ts, user })
        slackalog.script()
    } else {
        if (slackalog.resolve) slackalog.resolve({text})
    }
}

class Slackalog {

    includeMention(text) { 
        return text.replace('@@', `<@${this.user}>`) 
    }

    input() {
        return new Promise(resolve => assign(this, {resolve}))
    }

    say(text) {
        let { channel, thread_ts } = this
        slack.chat.postMessage({ channel, thread_ts, reply_broadcast: false, 
            text: this.includeMention(text)
        })
    }

}

slackListener.start(port).then(() => {
    console.log('Slackalog running on port %d', port)
})

module.exports = Slackalog