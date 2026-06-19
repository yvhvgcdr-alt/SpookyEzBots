const mineflayer = require('mineflayer')
const readline = require('readline')
const https = require('https')
const http = require('http')
const Vec3 = require('vec3')

const PI = Math.PI
const TO_DEG = 180 / PI
const movementPackets = new Set([
  'position',
  'position_look',
  'look',
  'flying',
  'teleport_confirm'
])

function readArg (name) {
  const i = process.argv.indexOf('--' + name)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return process.env[name.toUpperCase()]
}

function stringArg (name, def) {
  const value = readArg(name)
  return value == null ? def : value
}

function numberArg (name, def) {
  const value = readArg(name)
  if (value == null || value === '') return def
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : def
}

function boolArg (name, def) {
  const value = readArg(name)
  if (value == null || value === '') return def
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return def
}

function viewDistanceArg (name, def) {
  const value = readArg(name)
  if (value == null || value === '') return def
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return value
}

function parseTraceFilter (value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )
}

function safeJson (value, maxLen) {
  let text
  try {
    text = JSON.stringify(value)
  } catch (err) {
    text = `<json error: ${err?.message || err}>`
  }

  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + `...(+${text.length - maxLen})`
}

function formatCounts (counts) {
  return JSON.stringify(
    Object.fromEntries(
      [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    )
  )
}

function toNotchianYaw (yawRadians) {
  return Math.fround(180 - (yawRadians * TO_DEG))
}

function toNotchianPitch (pitchRadians) {
  return Math.fround(-(pitchRadians * TO_DEG))
}

function isBrandPacket (name, params) {
  return name === 'custom_payload' && params?.channel === 'minecraft:brand'
}

function obfuscateMessage(message, botIndex) {
  if (!message || message.startsWith('/')) return message

  const replacementChars = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    '@', '#', '$', '%', '&', '*', '?', '+', '=', '~', '|', '^', '<', '>'
  ]

  let result = message.split('')
  const positionsToReplace = []

  const replaceCount = 1 + Math.floor(Math.random() * 3)

  for (let i = 0; i < replaceCount && i < message.length; i++) {
    let pos
    do {
      pos = Math.floor(Math.random() * message.length)
    } while (positionsToReplace.includes(pos) || message[pos] === '/' || message[pos] === '!')
    positionsToReplace.push(pos)
  }

  const lastPos = message.length - 1
  if (!positionsToReplace.includes(lastPos) && message[lastPos] !== '/' && message[lastPos] !== '!') {
    positionsToReplace.push(lastPos)
  }

  for (const pos of positionsToReplace) {
    const randomChar = replacementChars[Math.floor(Math.random() * replacementChars.length)]
    result[pos] = randomChar
  }

  const obfuscated = result.join('')
  if (obfuscated !== message) {
    console.log(`[obfuscate][bot${botIndex}] "${message}" -> "${obfuscated}"`)
  }

  return obfuscated
}

function fetchTextFromUrl(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const cacheBuster = Date.now()
    const separator = url.includes('?') ? '&' : '?'
    const finalUrl = `${url}${separator}_=${cacheBuster}`
    const client = finalUrl.startsWith('https') ? https : http
    const options = {
      timeout: timeoutMs,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
    const req = client.get(finalUrl, options, (response) => {
      let data = ''
      response.on('data', chunk => data += chunk)
      response.on('end', () => resolve(data.trim()))
    })
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('request timeout'))
    })
    req.on('error', reject)
  })
}

function generateRandomUsername() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let username = ''
  for (let i = 0; i < 15; i++) {
    username += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return username
}

const spamMessages = [
  "vk.com/spookytimenet",
  "ВКонтакте",
  "t.me",
  "/tg",
  "/vk",
  "> ❤ Игрок никскрыт купил 1 СУПЕР Кейс с Донатом",
  "> Покупай и ты на сайте shop.SpookyTime.net",
  "╔══════════════════════════════════",
  "╚══════════════════════════════════",
  "> Проверь свою удачу у нас!",
  "╠ Получите 2,000 Токенов за привязку к",
  "╠                  !!! ВАЖНО !!!",
  "╔",
  "╚",
  "╠ Смотри наши Донат услуги в /donate",
  "«Герцог» innerv",
  "⚡ Наш ТГ бот telegram.me/spookytimebot",
  "⚡ Наш ДС сервер discord.gg/spookytime",
  "╠ Подавай заявку и ты:",
  "⚡ Наш Сайт shop.SpookyTime.net",
  "╠ Открыт весенний набор в Команду Проекта",
  "⚡ Проблема/Вопрос? vk.com/kol_kola",
  "╠ Давай бороться с читерами вместе!",
  "╠       ! НАБОР В КОМАНДУ ПРОЕКТА !",
  " Наши сообщества и соц. сети /links",
  " Вы играете на SpookyTime!",
  "➥ Идёт проверка, пожалуйста, подождите...",
  "  ⚡ Наш Телеграм Канал telegram.me/spookytimenet",
  "[✾] Успешная регистрация! Приятной игры!",
  "╠    ! НОВАЯ МЕТА ХАЛЯВЫ !",
  "╠ Топовые ежедневные награды!",
  "╠ Подробная информация /daily",
  "╠ Конкурс с призами: Реальные деньги; Донаты;",
  "╠ Токены; Кейсы; Биржа баланс;",
  "╠ Который проходит каждый вайп:",
  "╠ Информация - /fortuna",
  "╠ У нас очень часто проходят конкурсы",
  "╠ Список актуальных конкурсов можно посмотреть:",
  "╠ Вводи команду /конкурсы",
  "╠ НАШЛИ БАГ ИЛИ ДЮП? - vk.com/kol_kola",
  "╠"
]

function shouldFilterMessage(text) {
  if (!text) return false
 for (const spam of spamMessages) {
    if (text.includes(spam)) {
      return true
    }
  }
  return false
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms) })
}

function extractItemDisplayName(item) {
  if (!item) return ''
  if (item.customName) {
    try {
      var parsed = JSON.parse(item.customName)
      if (typeof parsed === 'string') return parsed
      if (typeof parsed === 'object' && parsed !== null) {
        var result = ''
        if (typeof parsed.text === 'string') result += parsed.text
        if (Array.isArray(parsed.extra)) {
          for (var ei = 0; ei < parsed.extra.length; ei++) {
            var part = parsed.extra[ei]
            if (part && typeof part.text === 'string') result += part.text
          }
        }
        return result
      }
    } catch (parseErr) {
      return String(item.customName)
    }
  }
  if (item.displayName) return item.displayName
  return ''
}

function getItemTypeForFreeNumber(num) {
  if (num === 1) return 'chest_minecart'
  if (num === 2) return 'chest_minecart'
  if (num === 3) return 'furnace_minecart'
  if (num === 4) return 'furnace_minecart'
  if (num === 5) return 'tnt_minecart'
  return null
}

function waitForWindowOpenPromise(bot, timeoutMs) {
  return new Promise(function (resolve) {
    var timer = setTimeout(function () {
      bot.removeListener('windowOpen', handler)
      resolve(null)
    }, timeoutMs)
    function handler(window) {
      clearTimeout(timer)
      resolve(window)
    }
    bot.once('windowOpen', handler)
  })
}

const host = stringArg('host', 'SpookyTime.net')
const port = numberArg('port', 25565)
const botsCount = numberArg('bots', 100)
const version = stringArg('version', '1.18.2')
const brand = stringArg('brand', 'vanilla')
const locale = stringArg('locale', 'ru_ru')
const viewDistance = viewDistanceArg('viewDistance', 32)
const enableTextFiltering = boolArg('enableTextFiltering', false)
const enableServerListing = boolArg('enableServerListing', true)
const checkTimeoutInterval = numberArg('checkTimeoutInterval', 120000)
const physicsEnabled = boolArg('physicsEnabled', true)

const mimicEnabled = boolArg('mimic', true)
const initialTeleportSpoofEnabled = boolArg('initialTeleportSpoof', mimicEnabled)
const initialSpoofGroundY = numberArg('initialSpoofGroundY', 65)
const initialSpoofOffsetX = numberArg('initialSpoofOffsetX', 1)
const initialSpoofOffsetZ = numberArg('initialSpoofOffsetZ', 1)
const earlySwingEnabled = boolArg('earlySwing', mimicEnabled)
const mountMimicEnabled = boolArg('mountMimic', mimicEnabled)
const resendSettingsOnSync = boolArg('resendSettingsOnSync', true)
const mountTickMs = numberArg('mountTickMs', 50)

const tracePackets = boolArg('tracePackets', false)
const tracePayload = boolArg('tracePayload', true)
const traceMaxLen = numberArg('traceMaxLen', 700)
const traceFilter = parseTraceFilter(stringArg(
  'traceFilter',
  'settings,custom_payload,position,teleport_confirm,position_look,look,flying,arm_animation,keep_alive,ping,pong,held_item_slot,animation,entity_effect,remove_entity_effect,block_change,multi_block_change,spawn_entity,entity_metadata,set_passengers,game_state_change,chat,set_title_text,set_title_subtitle,set_title_time,steer_vehicle,advancements,window_items'
))

const botsList = []
let antiAFK = false
let roundRobinInterval = null
let currentSpamMessage = null
let currentSpamDelay = null
let currentSpamIndex = 0
let autoZhirnoInterval = null
let autoMoveInterval = null
let moveEnabled = false
let targetPlayerNick = 'gertw2134taew'

let freeActive = false
const botOpenState = new Map()

function stopRoundRobinSpam() {
  if (roundRobinInterval) {
    clearInterval(roundRobinInterval)
    roundRobinInterval = null
  }
  currentSpamMessage = null
  currentSpamDelay = null
  currentSpamIndex = 0
  console.log('[spam] round-robin spam stopped')
}

function startRoundRobinSpam(intervalMs, message) {
  stopRoundRobinSpam()
  currentSpamMessage = message
  currentSpamDelay = intervalMs

  const activeBots = []
  for (let i = 0; i < botsList.length; i++) {
    const bot = botsList[i]
    if (bot && bot.entity && bot.chat && !bot._client?.ended) {
      activeBots.push({ bot, index: i })
    }
  }

  if (activeBots.length === 0) {
    console.log('[spam] no active bots to spam')
    return
  }

  console.log(`[spam] starting round-robin spam: every ${intervalMs}ms, ${activeBots.length} bots`)

  const sendToNextBot = () => {
    const aliveBots = []
    for (let i = 0; i < botsList.length; i++) {
      const bot = botsList[i]
      if (bot && bot.entity && bot.chat && !bot._client?.ended) {
        aliveBots.push({ bot, index: i })
      }
    }

    if (aliveBots.length === 0) {
      console.log('[spam] no active bots left, stopping spam')
      stopRoundRobinSpam()
      return
    }

    if (currentSpamIndex >= aliveBots.length) {
      currentSpamIndex = 0
    }

    const { bot, index } = aliveBots[currentSpamIndex]
    currentSpamIndex++

    let finalMessage = currentSpamMessage
    if (!finalMessage.startsWith('/')) {
      finalMessage = obfuscateMessage(currentSpamMessage, index)
    }

    try {
      bot.chat(finalMessage)
      console.log(`[spam][bot${index}] sent: ${finalMessage.substring(0, 50)}...`)
    } catch (err) {
      console.log(`[spam][bot${index}] error: ${err.message}`)
    }
  }

  roundRobinInterval = setInterval(sendToNextBot, intervalMs)
}

async function startRoundRobinSpamFromUrl(intervalMs, url) {
  console.log(`[spam] loading text from ${url}...`)
  try {
    const text = await fetchTextFromUrl(url)
    if (!text) {
      console.log('[spam] failed to load text from URL')
      return
    }
    console.log(`[spam] loaded ${text.length} chars from URL`)
    startRoundRobinSpam(intervalMs, text)
  } catch (err) {
    console.log(`[spam] error loading URL: ${err.message}`)
  }
}

function reconnectBot(botIndex, reason) {
  console.log(`[bot${botIndex}] reconnecting with new username, reason: ${reason}`)
  if (reconnectTimeouts[botIndex]) {
    clearTimeout(reconnectTimeouts[botIndex])
  }
  reconnectTimeouts[botIndex] = setTimeout(() => {
    console.log(`[bot${botIndex}] reconnecting...`)
    const newBot = createBotInstance(botIndex, true)
    botsList[botIndex] = newBot
    delete reconnectTimeouts[botIndex]
  }, 5000)
}

function startSpam(bot, botId, intervalMs, message) {
  console.log(`[spam] please use !spamall for round-robin spam`)
}

function startSpamAll(intervalMs, message) {
  startRoundRobinSpam(intervalMs, message)
}

function startSpamAllFromUrl(intervalMs, url) {
  startRoundRobinSpamFromUrl(intervalMs, url)
}

function stopSpam(botId) {
  console.log(`[spam] use !stopallspam to stop round-robin spam`)
}

function stopAllSpam() {
  stopRoundRobinSpam()
}

function turnBotsToTarget() {
  let foundTarget = false
  let turned = 0
  for (let i = 0; i < botsList.length; i++) {
    const bot = botsList[i]
    if (!bot || !bot.entity || !bot.lookAt || bot._client?.ended) continue
    let targetEntity = null
    for (const entity of Object.values(bot.entities)) {
      if (entity.type === 'player' && entity.username === targetPlayerNick) {
        targetEntity = entity
        break
      }
    }
    if (!targetEntity) continue
    foundTarget = true
    const targetPos = targetEntity.position.offset(0, 1.62, 0)
    bot.lookAt(targetPos).catch(err => console.log(`[bot${i}] lookAt error: ${err.message}`))
    turned++
  }
  if (!foundTarget) {
    console.log(`[console] player ${targetPlayerNick} not found by any bot`)
  } else if (turned > 0) {
    console.log(`[console] turned ${turned} bots to ${targetPlayerNick}`)
  }
  return foundTarget
}

function startAutoZhirno() {
  if (autoZhirnoInterval) {
    console.log('[auto] !АвтоЖирно already running')
    return
  }
  console.log(`[auto] !АвтоЖирно started, turning to ${targetPlayerNick} every 2 seconds`)
  autoZhirnoInterval = setInterval(() => {
    turnBotsToTarget()
  }, 2000)
}

function stopAutoZhirno() {
  if (autoZhirnoInterval) {
    clearInterval(autoZhirnoInterval)
    autoZhirnoInterval = null
    console.log('[auto] !АвтоЖирно stopped')
  }
}

function stopAutoMove() {
  if (autoMoveInterval) {
    clearInterval(autoMoveInterval)
    autoMoveInterval = null
  }
  for (const bot of botsList) {
    if (bot && bot.setControlState) {
      try {
        bot.setControlState('forward', false)
      } catch (e) {}
    }
  }
  moveEnabled = false
  console.log('[move] auto movement stopped')
}

function stopAllOpenLoops() {
  var count = 0
  botOpenState.forEach(function (state) {
    state.active = false
    count++
  })
  botOpenState.clear()
  console.log('[open] stopped ' + count + ' open loops')
}

function executeFreeCommandForBot(bot, botIndex, itemType, hashTag) {
  if (!bot || !bot.entity || bot._client.ended) {
    console.log('[free][bot' + botIndex + '] bot not ready, skipping')
    return
  }
  try {
    bot.chat('/free')
    console.log('[free][bot' + botIndex + '] sent /free')
  } catch (sendErr) {
    console.log('[free][bot' + botIndex + '] error sending /free: ' + sendErr.message)
    return
  }
  waitForWindowOpenPromise(bot, 5000).then(function (window) {
    if (!window) {
      console.log('[free][bot' + botIndex + '] window did not open within 5s')
      return
    }
    if (!freeActive) {
      try { bot.closeWindow(window) } catch (e) {}
      return
    }
    console.log('[free][bot' + botIndex + '] window opened, searching ' + itemType + ' with ' + hashTag)
    var slots = window.slots
    var foundSlot = -1
    for (var slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      var item = slots[slotIndex]
      if (!item) continue
      if (item.name !== itemType) continue
      var itemName = extractItemDisplayName(item)
      if (itemName.includes(hashTag)) {
        foundSlot = slotIndex
        break
      }
    }
    if (foundSlot === -1) {
      console.log('[free][bot' + botIndex + '] item ' + itemType + ' with ' + hashTag + ' not found in window')
      try { bot.closeWindow(window) } catch (e) {}
      return
    }
    console.log('[free][bot' + botIndex + '] found at slot ' + foundSlot + ', clicking')
    bot.clickWindow(foundSlot, 0, 0, function (clickErr) {
      if (clickErr) {
        console.log('[free][bot' + botIndex + '] click error: ' + clickErr.message)
      } else {
        console.log('[free][bot' + botIndex + '] clicked slot ' + foundSlot)
      }
    })
  }).catch(function (err) {
    console.log('[free][bot' + botIndex + '] waitForWindow error: ' + err.message)
  })
}

function startOpenLoopForBot(bot, botIndex, x, y, z) {
  var existingState = botOpenState.get(botIndex)
  if (existingState) {
    existingState.active = false
  }
  var state = { active: true }
  botOpenState.set(botIndex, state)

  function runOpenIteration() {
    if (!state.active) {
      console.log('[open][bot' + botIndex + '] loop stopped')
      botOpenState.delete(botIndex)
      return
    }
    if (!bot || !bot.entity || bot._client.ended) {
      setTimeout(runOpenIteration, 2000)
      return
    }

    var block = null
    try {
      block = bot.blockAt(new Vec3(x, y, z))
    } catch (blockErr) {
      console.log('[open][bot' + botIndex + '] blockAt error: ' + blockErr.message)
      setTimeout(runOpenIteration, 1000)
      return
    }

    if (!block) {
      console.log('[open][bot' + botIndex + '] block not found at ' + x + ' ' + y + ' ' + z)
      setTimeout(runOpenIteration, 1000)
      return
    }

    bot.activateBlock(block).then(function () {
      console.log('[open][bot' + botIndex + '] activated block at ' + x + ' ' + y + ' ' + z)
      return waitForWindowOpenPromise(bot, 3000)
    }).then(function (window) {
      if (!window) {
        setTimeout(runOpenIteration, 500)
        return
      }
      if (!state.active) {
        try { bot.closeWindow(window) } catch (e) {}
        return
      }

      var slots = window.slots
      var foundSlot = -1
      for (var slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        var item = slots[slotIndex]
        if (!item) continue
        if (item.name !== 'player_head') continue
        var itemName = extractItemDisplayName(item)
        if (itemName.toLowerCase().includes('донат')) {
          foundSlot = slotIndex
          break
        }
      }

      if (foundSlot === -1) {
        console.log('[open][bot' + botIndex + '] player_head with "Донат" not found, closing and retrying')
        try { bot.closeWindow(window) } catch (e) {}
        setTimeout(runOpenIteration, 500)
        return
      }

      console.log('[open][bot' + botIndex + '] found player_head at slot ' + foundSlot + ', clicking')
      bot.clickWindow(foundSlot, 0, 0, function (clickErr) {
        if (clickErr) {
          console.log('[open][bot' + botIndex + '] click error: ' + clickErr.message)
        } else {
          console.log('[open][bot' + botIndex + '] clicked player_head at slot ' + foundSlot)
        }
        setTimeout(runOpenIteration, 500)
      })
    }).catch(function (activateErr) {
      console.log('[open][bot' + botIndex + '] activateBlock error: ' + activateErr.message)
      setTimeout(runOpenIteration, 1000)
    })
  }

  runOpenIteration()
}

function startAutoMoveToTarget(nick) {
  stopAutoMove()
  targetPlayerNick = nick
  console.log(`[move] target set to ${targetPlayerNick}`)
  moveEnabled = true

  autoMoveInterval = setInterval(() => {
    if (!moveEnabled) return
    for (let i = 0; i < botsList.length; i++) {
      const bot = botsList[i]
      if (!bot || !bot.entity || !bot.setControlState || bot._client?.ended) continue

      let targetEntity = null
      for (const entity of Object.values(bot.entities)) {
        if (entity.type === 'player' && entity.username === targetPlayerNick) {
          targetEntity = entity
          break
        }
      }
      if (!targetEntity) {
        bot.setControlState('forward', false)
        continue
      }

      const dx = targetEntity.position.x - bot.entity.position.x
      const dz = targetEntity.position.z - bot.entity.position.z
      const distance = Math.sqrt(dx*dx + dz*dz)

      if (distance < 2.0) {
        bot.setControlState('forward', false)
        continue
      }

      const targetPos = targetEntity.position.offset(0, 1.62, 0)
      bot.lookAt(targetPos).catch(() => {})
      bot.setControlState('forward', true)
    }
  }, 100)
}

const reconnectTimeouts = {}

function createBotInstance (index, isReconnect = false) {
  const botName = generateRandomUsername()

  const bot = mineflayer.createBot({
    host,
    port,
    username: botName,
    version,
    auth: 'offline',
    brand,
    viewDistance,
    enableTextFiltering,
    enableServerListing,
    checkTimeoutInterval,
    physicsEnabled
  })

  if (bot.settings) {
    bot.settings.locale = locale
    bot.settings.viewDistance = viewDistance
    bot.settings.enableTextFiltering = enableTextFiltering
  }

  console.log(`[bot${index}] connect ${host}:${port} user=${botName} version=${version} ${isReconnect ? '(reconnect)' : ''}`)

  const packetCounts = {
    incoming: new Map(),
    outgoing: new Map()
  }

  function bumpCount (counts, name) {
    counts.set(name, (counts.get(name) || 0) + 1)
  }

  function shouldTracePacket (name) {
    return traceFilter.size === 0 || traceFilter.has(name)
  }

  function logPacket (dir, name, payload) {
    if (!tracePackets || !shouldTracePacket(name)) return
    const suffix = tracePayload ? ` ${safeJson(payload, traceMaxLen)}` : ''
    console.log(`[pkt:${dir}] ${name}${suffix}`)
  }

  const behavior = {
    settingsSent: false,
    queuedBrandPacket: null,
    firstServerTeleport: null,
    queuedTeleportConfirm: null,
    suppressMovementUntilSpoofComplete: false,
    initialTeleportSpoofScheduled: false,
    initialTeleportSpoofDone: !initialTeleportSpoofEnabled,
    earlySwingScheduled: false,
    settingsReplaySent: false,
    loginCount: 0,
    mountTicker: null,
    serverAnimationCount: 0,
    reconnectAttempts: 0
  }

  const rawWrite = bot._client.write.bind(bot._client)

  function writeActual (name, params) {
    bumpCount(packetCounts.outgoing, name)
    logPacket('out', name, params)
    return rawWrite(name, params)
  }

  function getBrandChannelName () {
    if (bot.supportFeature('customChannelMCPrefixed')) return 'MC|Brand'
    if (bot.supportFeature('customChannelIdentifier')) return 'minecraft:brand'
    throw new Error('Unsupported brand channel name')
  }

  const brandChannel = getBrandChannelName()

  function sendBrandPacket () {
    bot._client.writeChannel(brandChannel, brand)
  }

  function replaySettingsAndBrand (reason) {
    if (
      !resendSettingsOnSync ||
      behavior.settingsReplaySent ||
      bot._client.ended ||
      behavior.loginCount > 1
    ) {
      return
    }

    behavior.settingsReplaySent = true

    setTimeout(() => {
      if (bot._client.ended) return
      try {
        console.log(`[bot${index}] replay settings+brand -> ${reason}`)
        bot.setSettings({
          locale,
          viewDistance,
          enableTextFiltering
        })
        sendBrandPacket()
      } catch (err) {
        console.log('[bot] replay settings+brand error', err)
      }
    }, 10)
  }

  function scheduleEarlySwing (reason) {
    if (!earlySwingEnabled || behavior.earlySwingScheduled || bot._client.ended) return
    behavior.earlySwingScheduled = true
    console.log(`[bot${index}] early swing -> ${reason}`)

    const send = (hand, delay) => {
      setTimeout(() => {
        if (bot._client.ended) return
        try {
          writeActual('arm_animation', { hand })
        } catch (err) {
          console.log('[bot] early swing error', err)
        }
      }, delay)
    }

    send(0, 40)
    send(1, 80)
  }

  function stopMountMimic () {
    if (behavior.mountTicker !== null) {
      clearInterval(behavior.mountTicker)
      behavior.mountTicker = null
    }
  }

  function startMountMimic () {
    if (!mountMimicEnabled || behavior.mountTicker !== null) return

    const tick = () => {
      if (bot._client.ended || !bot.vehicle) {
        stopMountMimic()
        return
      }

      const yaw = Number.isFinite(bot.entity?.yaw) ? toNotchianYaw(bot.entity.yaw) : 0
      const pitch = Number.isFinite(bot.entity?.pitch) ? toNotchianPitch(bot.entity.pitch) : 0
      const onGround = !!bot.entity?.onGround

      try {
        writeActual('look', { yaw, pitch, onGround })
        writeActual('steer_vehicle', { sideways: 0, forward: 0, jump: 0 })
      } catch (err) {
        console.log('[bot] mount mimic error', err)
        stopMountMimic()
      }
    }

    behavior.mountTicker = setInterval(tick, mountTickMs)
    tick()
  }

  function scheduleInitialTeleportSpoof () {
    if (
      !initialTeleportSpoofEnabled ||
      behavior.initialTeleportSpoofScheduled ||
      behavior.initialTeleportSpoofDone ||
      !behavior.firstServerTeleport ||
      !behavior.queuedTeleportConfirm
    ) {
      return
    }

    behavior.initialTeleportSpoofScheduled = true
    setTimeout(runInitialTeleportSpoof, 5)
  }

  function runInitialTeleportSpoof () {
    const actual = behavior.firstServerTeleport
    const confirm = behavior.queuedTeleportConfirm

    if (!actual || !confirm || bot._client.ended) {
      behavior.suppressMovementUntilSpoofComplete = false
      behavior.initialTeleportSpoofScheduled = false
      return
    }

    const spoof = {
      x: actual.x + initialSpoofOffsetX,
      y: initialSpoofGroundY,
      z: actual.z + initialSpoofOffsetZ,
      yaw: -180,
      pitch: 0,
      onGround: false
    }

    const fallOffsets = [
      0.0784000015258789,
      0.23363200604248047,
      0.4641593749554364,
      0.76847620241298
    ]

    try {
      writeActual('position_look', spoof)

      for (const offset of fallOffsets) {
        writeActual('position', {
          x: spoof.x,
          y: initialSpoofGroundY - offset,
          z: spoof.z,
          onGround: false
        })
      }

      writeActual('teleport_confirm', confirm)
      writeActual('position_look', {
        x: actual.x,
        y: actual.y,
        z: actual.z,
        yaw: actual.yaw,
        pitch: actual.pitch,
        onGround: false
      })
      writeActual('position_look', {
        x: actual.x,
        y: actual.y,
        z: actual.z,
        yaw: actual.yaw,
        pitch: actual.pitch,
        onGround: false
      })

      console.log(`[bot${index}] initial teleport spoof applied`)
    } catch (err) {
      console.log('[bot] initial teleport spoof error', err)
    } finally {
      behavior.queuedTeleportConfirm = null
      behavior.suppressMovementUntilSpoofComplete = false
      behavior.initialTeleportSpoofScheduled = false
      behavior.initialTeleportSpoofDone = true
    }
  }

  bot._client.write = (name, params) => {
    if (name === 'settings' && params) {
      params.locale = locale
      if (typeof viewDistance === 'number') params.viewDistance = viewDistance
      params.enableTextFiltering = enableTextFiltering
      params.enableServerListing = enableServerListing
    }

    if (isBrandPacket(name, params) && !behavior.settingsSent) {
      behavior.queuedBrandPacket = params
      return
    }

    if (!behavior.initialTeleportSpoofDone && name === 'held_item_slot' && params?.slotId === 0) {
      return
    }

    if (name === 'settings' && !behavior.settingsSent) {
      behavior.settingsSent = true
      const result = writeActual(name, params)
      if (behavior.queuedBrandPacket) {
        const packet = behavior.queuedBrandPacket
        behavior.queuedBrandPacket = null
        writeActual('custom_payload', packet)
      }
      return result
    }

    if (behavior.suppressMovementUntilSpoofComplete && !behavior.initialTeleportSpoofDone) {
      if (
        name === 'teleport_confirm' &&
        params?.teleportId === behavior.firstServerTeleport?.teleportId
      ) {
        behavior.queuedTeleportConfirm = params
        scheduleInitialTeleportSpoof()
        return
      }

      if (movementPackets.has(name)) {
        return
      }
    }

    return writeActual(name, params)
  }

  bot._client.on('packet', (data, meta) => {
    bumpCount(packetCounts.incoming, meta.name)
    logPacket('in', meta.name, data)

    if (
      meta.name === 'position' &&
      !behavior.firstServerTeleport &&
      initialTeleportSpoofEnabled &&
      typeof data?.teleportId !== 'undefined'
    ) {
      behavior.firstServerTeleport = {
        x: data.x,
        y: data.y,
        z: data.z,
        yaw: data.yaw,
        pitch: data.pitch,
        teleportId: data.teleportId
      }
      behavior.suppressMovementUntilSpoofComplete = true
    }

    if (meta.name === 'animation') {
      behavior.serverAnimationCount += 1
      if (behavior.serverAnimationCount === 2) {
        scheduleEarlySwing('server-animation')
      }
    }

    if (meta.name === 'respawn' || meta.name === 'window_items') {
      stopMountMimic()
    }

    if ((meta.name === 'advancements' || meta.name === 'window_items') && !behavior.settingsReplaySent) {
      replaySettingsAndBrand(meta.name)
    }
  })

  bot.on('forcedMove', () => {
    if (!tracePackets) return
    const pos = bot.entity?.position
    if (!pos) return
   console.log(
      `[event] forcedMove x=${pos.x.toFixed(3)} y=${pos.y.toFixed(3)} z=${pos.z.toFixed(3)} ` +
      `yaw=${bot.entity.yaw.toFixed(3)} pitch=${bot.entity.pitch.toFixed(3)}`
    )
  })

  function dumpPacketCounts () {
    if (!tracePackets) return
    console.log(`[pkt:counts:in] ${formatCounts(packetCounts.incoming)}`)
    console.log(`[pkt:counts:out] ${formatCounts(packetCounts.outgoing)}`)
  }

  bot.on('login', () => {
    behavior.loginCount += 1
    if (behavior.loginCount > 1) stopMountMimic()
    console.log(`[bot${index}] login ok`)
  })

  bot.on('spawn', () => {
    const pos = bot.entity?.position
    console.log(`[bot${index}] spawn${pos ? ` ${pos}` : ''}`)

    const antiAFKInterval = setInterval(() => {
      if (!antiAFK) return
      if (!bot.entity) return
      try {
        if (bot.setControlState) {
          bot.setControlState('jump', true)
          setTimeout(() => {
            try { if (bot.setControlState) bot.setControlState('jump', false) } catch {}
          }, 500)
        }
      } catch {}
    }, 5000)

    bot._antiAFKInterval = antiAFKInterval
  })

  bot.on('mount', () => {
    console.log(`[bot${index}] mount`)
    startMountMimic()
  })

  bot.on('dismount', () => {
    console.log(`[bot${index}] dismount`)
    stopMountMimic()
  })

  bot.on('message', (message) => {
    const text = message.toString()
    if (shouldFilterMessage(text)) return
    console.log(`[chat][bot${index}] ${text}`)

    if (text.includes('[✾] Зарегистрируйтесь ⇝ /reg <Пароль>')) {
      setTimeout(() => {
        if (bot && bot.chat) {
          try { bot.chat('/reg stbots') } catch(err) { console.log(`[bot${index}] reg error: ${err.message}`) }
          console.log(`[bot${index}] sent /reg stbots`)
        }
      }, 1000)
    }

    if (text.includes('[✾] Войдите в игру ⇝ /login <Пароль>')) {
      setTimeout(() => {
        if (bot && bot.chat) {
          try { bot.chat('/login stbots') } catch(err) { console.log(`[bot${index}] login error: ${err.message}`) }
          console.log(`[bot${index}] sent /login stbots`)
        }
      }, 1000)
    }

    // --- !Free #N ---
    var freeMatch = text.match(/!Free\s+(#(\d+))/)
    if (freeMatch) {
      var hashTag = freeMatch[1]
      var freeNum = parseInt(freeMatch[2], 10)
      var itemType = getItemTypeForFreeNumber(freeNum)
      if (itemType) {
        freeActive = true
        if (index === 0) {
          console.log('[free] !Free ' + hashTag + ' received, item type: ' + itemType)
        }
        executeFreeCommandForBot(bot, index, itemType, hashTag)
      } else {
        if (index === 0) {
          console.log('[free] unknown number ' + freeNum + ', supported: #1-#5')
        }
      }
    }

    // --- !StopFree ---
    if (text.includes('!StopFree')) {
      freeActive = false
      if (index === 0) {
        console.log('[free] !StopFree received, freeActive = false')
      }
    }

    // --- !Open x y z x y z ... ---
    var openIdx = text.indexOf('!Open ')
    if (openIdx !== -1) {
      var openArgs = text.slice(openIdx + 6).trim()
      var openParts = openArgs.split(/\s+/)
      var openNums = []
      for (var oi = 0; oi < openParts.length; oi++) {
        var parsedNum = parseInt(openParts[oi], 10)
        if (!isNaN(parsedNum)) {
          openNums.push(parsedNum)
        } else {
          break
        }
      }
      if (openNums.length >= 3 && openNums.length % 3 === 0) {
        var coords = []
        for (var ci = 0; ci < openNums.length; ci += 3) {
          coords.push({ x: openNums[ci], y: openNums[ci + 1], z: openNums[ci + 2] })
        }
        var coordIndex = index % coords.length
        var assignedCoord = coords[coordIndex]
        if (index === 0) {
          console.log('[open] !Open received, ' + coords.length + ' coords')
        }
        console.log('[open][bot' + index + '] assigned coord ' + assignedCoord.x + ' ' + assignedCoord.y + ' ' + assignedCoord.z)
        startOpenLoopForBot(bot, index, assignedCoord.x, assignedCoord.y, assignedCoord.z)
      } else {
        if (index === 0) {
          console.log('[open] invalid !Open args, need groups of 3 numbers')
        }
      }
    }

    // --- !StopOpen ---
    if (text.includes('!StopOpen')) {
      if (index === 0) {
        console.log('[open] !StopOpen received')
      }
      stopAllOpenLoops()
    }
  })

  bot.on('kicked', (reason) => {
    const reasonStr = String(reason)
    console.log(`[bot${index}] kicked: ${reasonStr.substring(0, 200)}`)
    stopMountMimic()
    dumpPacketCounts()
    if (bot._antiAFKInterval) {
      clearInterval(bot._antiAFKInterval)
    }
    reconnectBot(index, reasonStr.substring(0, 100))
  })

  bot.on('end', (reason) => {
    console.log(`[bot${index}] end: ${reason || 'connection closed'}`)
    stopMountMimic()
    dumpPacketCounts()
    if (bot._antiAFKInterval) {
      clearInterval(bot._antiAFKInterval)
    }
    if (reason !== 'manual disconnect') {
      reconnectBot(index, 'connection ended')
    }
  })

  bot.on('error', (err) => {
    console.log(`[bot${index}] error: ${err.message}`)
  })

  return bot
}

// -------------------------
// Централизованная обработка команд (консоль + удалённые)
// -------------------------
function processCommand(input) {
  const line = input.trim()
  if (!line) return

  if (line === '.AntiAFK true') { antiAFK = true; console.log('[AntiAFK] enabled'); return }
  if (line === '.AntiAFK false') { antiAFK = false; console.log('[AntiAFK] disabled'); return }

  if (line.startsWith('!spamall ')) {
    const parts = line.slice(9).split(' ')
    const intervalMs = parseInt(parts[0])
    const message = parts.slice(1).join(' ')
    if (isNaN(intervalMs) || !message) {
      console.log('[console] !spamall <interval_ms> <текст>')
      return
    }
    startRoundRobinSpam(intervalMs, message)
    return
  }

  if (line.startsWith('!spamallfromurl ') || line.startsWith('!safu ')) {
    const prefix = line.startsWith('!safu ') ? '!safu ' : '!spamallfromurl '
    const parts = line.slice(prefix.length).split(' ')
    const intervalMs = parseInt(parts[0])
    const url = parts.slice(1).join(' ')
    if (isNaN(intervalMs) || !url) {
      console.log('[console] !safu <interval_ms> <url>')
      return
    }
    startRoundRobinSpamFromUrl(intervalMs, url)
    return
  }

  if (line === '!stopallspam') { stopRoundRobinSpam(); return }

  if (line === '!Смирно') {
    let turned = 0
    for (let i = 0; i < botsList.length; i++) {
      const bot = botsList[i]
      if (bot && bot.entity && bot.look && !bot._client?.ended) {
        bot.look(bot.entity.yaw + Math.PI/2, bot.entity.pitch, true).catch(() => {})
        turned++
      }
    }
    console.log(`[console] повернуто направо: ${turned} ботов`)
    return
  }

  if (line === '!Налево') {
    let turned = 0
    for (let i = 0; i < botsList.length; i++) {
      const bot = botsList[i]
      if (bot && bot.entity && bot.look && !bot._client?.ended) {
        bot.look(bot.entity.yaw - Math.PI/2, bot.entity.pitch, true).catch(() => {})
        turned++
      }
    }
    console.log(`[console] повернуто налево: ${turned} ботов`)
    return
  }

  if (line === '!Жирно') { turnBotsToTarget(); return }
  if (line === '!АвтоЖирно') { startAutoZhirno(); return }
  if (line === '!СтопЖирно') { stopAutoZhirno(); return }
  if (line === '!СтопАв') { stopAutoMove(); return }

  if (line.toLowerCase().startsWith('!цель ')) {
    const nick = line.slice(6).trim()
    if (!nick) { console.log('[console] !Цель <никнейм>'); return }
    targetPlayerNick = nick
    console.log(`[console] цель изменена на ${targetPlayerNick}`)
    return
  }

  const lowerLine = line.toLowerCase()
  if (lowerLine.startsWith('!ав ') || lowerLine.startsWith('!av ')) {
    let nick = line.slice(line.indexOf(' ') + 1).trim()
    if (!nick) { console.log('[console] !Ав <никнейм>'); return }
    startAutoMoveToTarget(nick)
    return
  }

  if (line.startsWith('!Free ')) {
    var freeArg = line.slice(6).trim()
    var freeNumConsole = parseInt(freeArg.replace('#', ''), 10)
    var freeHashTag = '#' + freeNumConsole
    var freeItemType = getItemTypeForFreeNumber(freeNumConsole)
    if (!freeItemType) {
      console.log('[free] неизвестный номер, поддерживается #1-#5')
      return
    }
    freeActive = true
    console.log('[free] запуск !Free ' + freeHashTag + ' (' + freeItemType + ') для всех ботов')
    for (var freeI = 0; freeI < botsList.length; freeI++) {
      executeFreeCommandForBot(botsList[freeI], freeI, freeItemType, freeHashTag)
    }
    return
  }

  if (line === '!StopFree') {
    freeActive = false
    console.log('[free] !StopFree - остановлено')
    return
  }

  if (line.startsWith('!Open ')) {
    var openArgConsole = line.slice(6).trim()
    var openPartsConsole = openArgConsole.split(/\s+/)
    var openNumsConsole = []
    for (var oni = 0; oni < openPartsConsole.length; oni++) {
      var pn = parseInt(openPartsConsole[oni], 10)
      if (!isNaN(pn)) openNumsConsole.push(pn)
      else break
    }
    if (openNumsConsole.length < 3 || openNumsConsole.length % 3 !== 0) {
      console.log('[open] формат: !Open x y z x y z ...')
      return
    }
    var coordsConsole = []
    for (var cic = 0; cic < openNumsConsole.length; cic += 3) {
      coordsConsole.push({ x: openNumsConsole[cic], y: openNumsConsole[cic + 1], z: openNumsConsole[cic + 2] })
    }
    console.log('[open] запуск !Open, ' + coordsConsole.length + ' координат(ы), ' + botsList.length + ' ботов')
    for (var obi = 0; obi < botsList.length; obi++) {
      var assignedCons = coordsConsole[obi % coordsConsole.length]
      startOpenLoopForBot(botsList[obi], obi, assignedCons.x, assignedCons.y, assignedCons.z)
    }
    return
  }

  if (line === '!StopOpen') {
    stopAllOpenLoops()
    return
  }

  // Отправка обычного сообщения от первого бота
  if (botsList.length > 0 && botsList[0] && typeof botsList[0].chat === 'function') {
    try {
      botsList[0].chat(line)
    } catch(err) {
      console.log(`error: ${err.message}`)
    }
  } else {
    console.log('[console] первый бот ещё не готов или не имеет метода chat')
  }
}

// -------------------------
// Периодическая проверка удалённой команды (каждые 5 секунд) - всегда выполняем
// -------------------------
const REMOTE_COMMAND_URL = 'https://raw.githubusercontent.com/yvhvgcdr-alt/SpookySucksBots/refs/heads/main/EZ'

let remoteCheckInProgress = false

function checkRemoteCommand() {
  if (remoteCheckInProgress) return
  remoteCheckInProgress = true
  fetchTextFromUrl(REMOTE_COMMAND_URL, 10000)
    .then((command) => {
      remoteCheckInProgress = false
      if (!command || command.trim().length === 0) return
      console.log(`[remote] выполнение команды: ${command}`)
      processCommand(command)
    })
    .catch((err) => {
      remoteCheckInProgress = false
      console.log(`[remote] ошибка загрузки: ${err.message}`)
    })
}

// -------------------------
// Запуск ботов и таймера удалённых команд
// -------------------------
const joinDelayMs = 15000
for (let i = 0; i < botsCount; i++) {
  setTimeout(() => {
    console.log(`[bot] starting ${i + 1}/${botsCount}`)
    const bot = createBotInstance(i, false)
    botsList.push(bot)
  }, i * joinDelayMs)
}

// Таймер каждые 5 секунд
setInterval(checkRemoteCommand, 5000)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

console.log('\n[console] команды:')
console.log('.AntiAFK true/false - анти-афк')
console.log('!spamall <interval_ms> <текст> - круговой спам')
console.log('!safu <interval_ms> <url> - спам из URL')
console.log('!stopallspam - остановить спам')
console.log('!Смирно - повернуть направо')
console.log('!Налево - повернуть налево')
console.log('!Жирно - повернуться к цели')
console.log('!АвтоЖирно - авто-поворот к цели (2 сек)')
console.log('!СтопЖирно - выключить авто-поворот')
console.log('!Ав <ник> - идти к игроку (меняет цель)')
console.log('!СтопАв - остановить движение')
console.log('!Цель <ник> - сменить цель без движения')
console.log('Обычный текст - отправить первым ботом')

rl.on('line', (line) => {
  processCommand(line.trim())
})

process.on('SIGINT', () => {
  console.log('\n[console] shutting down...')
  stopRoundRobinSpam()
  stopAutoZhirno()
  stopAutoMove()
  stopAllOpenLoops()
  freeActive = false
  for (const bot of botsList) {
    if (bot && bot.end) bot.end('manual disconnect')
  }
  process.exit(0)
})
