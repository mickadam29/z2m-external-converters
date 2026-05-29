const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

const exposes = zigbeeHerdsmanConverters['exposes']
    || require("zigbee-herdsman-converters/lib/exposes");

const ea = exposes.access;

const fz = zigbeeHerdsmanConverters.fromZigbeeConverters
    || zigbeeHerdsmanConverters.fromZigbee;

const tz = zigbeeHerdsmanConverters.toZigbeeConverters
    || zigbeeHerdsmanConverters.toZigbee;

/* =========================================================
   HELPER UART TX
   Envoie une string ASCII sur le port UART via genMultistateValue.
   Identique à ptvo_switch_uart : string directe, type 0x42,
   écriture sur le premier endpoint qui supporte le cluster.
   PTVO retire l'octet de longueur Zigbee avant de pousser sur UART.
========================================================= */
async function uartWrite(entity, str, meta) {
    if (!str.endsWith('\n')) str += '\n';
    const payload = { 14: { value: str, type: 0x42 } };
    for (const ep of meta.device.endpoints) {
        const cluster = 'genMultistateValue';
        if (ep.supportsInputCluster(cluster) || ep.supportsOutputCluster(cluster)) {
            await ep.write(cluster, payload);
            return;
        }
    }
    await entity.write('genMultistateValue', payload);
}

/* =========================================================
   UART TX — CODE_OK / CODE_KO
========================================================= */
tz.ptvo_uart_action = {
    key: ['action'],
    cluster: 'genMultistateValue',
    type: 'write',
    convertSet: async (entity, key, value, meta) => {
        if (value !== 'CODE_OK' && value !== 'CODE_KO') {
            throw new Error(`ptvo_uart_action: valeur non supportée: ${value}`);
        }
        await uartWrite(entity, value, meta);
    },
};

/* =========================================================
   UART TX — DELAY_LOCKOUT=X  (X en minutes, 1-255)
========================================================= */
tz.ptvo_delay_lockout = {
    key: ['delay_lockout'],
    cluster: 'genMultistateValue',
    type: 'write',
    convertSet: async (entity, key, value, meta) => {
        const v = parseInt(value, 10);
        if (isNaN(v) || v < 1 || v > 255) {
            throw new Error(`ptvo_delay_lockout: valeur invalide (1-255): ${value}`);
        }
        await uartWrite(entity, `DELAY_LOCKOUT=${v}`, meta);
    },
};

/* =========================================================
   UART TX — UNLOCK_CODE=XXXXXXXXXX  (10 chiffres)
   padStart restaure les zéros de tête perdus par intval PHP
========================================================= */
tz.ptvo_unlock_code = {
    key: ['unlock_code'],
    cluster: 'genMultistateValue',
    type: 'write',
    convertSet: async (entity, key, value, meta) => {
        const str = String(Math.round(value)).padStart(10, '0');
        if (!/^\d{10}$/.test(str)) {
            throw new Error(`ptvo_unlock_code: exactement 10 chiffres requis: ${value}`);
        }
        await uartWrite(entity, `UNLOCK_CODE=${str}`, meta);
    },
};

/* =========================================================
   UART TX — LOCK_STATUS
   lock       → LOCK       (timer via blockDelayMs)
   lock_until → LOCK_UNTIL (indéfini jusqu'à UNLOCK)
   unlock     → UNLOCK
========================================================= */
tz.ptvo_lock_status = {
    key: ['lock_status'],
    cluster: 'genMultistateValue',
    type: 'write',
    convertSet: async (entity, key, value, meta) => {
        if (value === 'lock') {
            await uartWrite(entity, 'LOCK', meta);
        } else if (value === 'lock_until') {
            await uartWrite(entity, 'LOCK_UNTIL', meta);
        } else if (value === 'unlock') {
            await uartWrite(entity, 'UNLOCK', meta);
        } else {
            throw new Error(`ptvo_lock_status: valeur non supportée: ${value}`);
        }
    },
};

/* =========================================================
   UART RX — BADGE / PIN / ABANDON / TAMPER
   Le CC2530 (PTVO) envoie du texte ASCII brut, terminé par \n.
   Format : "BADGE:<number>\n", "PIN:<number>\n", "ABANDON\n", "TAMPER\n"
   PTVO retire l'octet de longueur Zigbee : data[0] = premier char ASCII.
========================================================= */
fz.ptvo_uart_badge = {
    cluster: 'genMultistateValue',
    type: ['attributeReport', 'readResponse'],

    convert: (model, msg, publish, options, meta) => {
        if (msg.type === 'write') return;

        const raw = msg.data?.stateText ?? msg.data;
        if (!raw) return;

        let data;
        if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
            data = Array.from(raw);
        } else if (Array.isArray(raw)) {
            data = raw;
        } else if (typeof raw === 'object') {
            data = Object.values(raw);
        } else {
            return;
        }

        /* Décode les bytes ASCII en string (retire \r et \n de fin) */
        const str = data
            .map(b => String.fromCharCode(b))
            .join('')
            .replace(/[\r\n]+$/, '');

        const clearAfter = (payload) => {
            if (typeof publish === 'function') {
                setTimeout(() => publish(payload), 5000);
            }
        };

        const clear = { action: 'clear', pin_number: 0, badge_number: 0, event: 'none' };

        /* PIN:XXXXXX */
        if (str.startsWith('PIN:')) {
            const pin = str.slice(4);
            if (/^\d{6}$/.test(pin)) {
                clearAfter(clear);
                return { action: `PIN:${pin}`, pin_number: parseInt(pin, 10), event: 'pin' };
            }
        }

        /* BADGE:XXXXXXXX */
        if (str.startsWith('BADGE:')) {
            const badge = str.slice(6);
            if (/^\d+$/.test(badge) && badge.length >= 4) {
                const raw = parseInt(badge, 10);
                // Inversion des octets pour aligner avec l'ordre ISO 14443A (ACR122U)
                const n = raw <= 0xFFFFFFFF
                    ? (((raw & 0xFF) << 24) | (((raw >> 8) & 0xFF) << 16) | (((raw >> 16) & 0xFF) << 8) | ((raw >>> 24) & 0xFF)) >>> 0
                    : raw;
                clearAfter(clear);
                return { action: `BADGE:${n}`, badge_number: n, event: 'badge' };
            }
        }

        /* ABANDON */
        if (str === 'ABANDON') {
            clearAfter(clear);
            return { action: 'ABANDON', event: 'abandon' };
        }

        /* TAMPER_ON — clavier verrouillé après trop d'erreurs */
        if (str === 'TAMPER_ON') {
            clearAfter(clear);
            return { action: 'TAMPER_ON', event: 'tamper_on' };
        }

        /* TAMPER_OFF — clavier déverrouillé (délai expiré ou code admin) */
        if (str === 'TAMPER_OFF') {
            clearAfter(clear);
            return { action: 'TAMPER_OFF', event: 'tamper_off' };
        }
    },
};

/* =========================================================
   DEVICE
========================================================= */
const device = {
    zigbeeModel: ['ptvo_wiegand'],
    model: 'ptvo_wiegand',
    vendor: 'ptvo.info',
    description: 'UART Wiegand badge reader',

    fromZigbee: [fz.ptvo_uart_badge],

    toZigbee: [tz.ptvo_uart_action, tz.ptvo_delay_lockout, tz.ptvo_unlock_code, tz.ptvo_lock_status],

    exposes: [
        exposes.enum('action', ea.SET, ['CODE_OK', 'CODE_KO']),

        exposes.numeric('delay_lockout', ea.SET)
            .withValueMin(1).withValueMax(255).withUnit('min')
            .withDescription('Durée de blocage après trop d\'erreurs (1-255 min)'),
        exposes.numeric('unlock_code', ea.SET)
            .withValueMin(0).withValueMax(9999999999)
            .withDescription('Code de déblocage (10 chiffres, zéros de tête supportés)'),
        exposes.enum('lock_status', ea.SET, ['lock', 'lock_until', 'unlock'])
            .withDescription('Verrouillage du clavier (lock=LOCK timer, lock_until=LOCK_UNTIL indéfini, unlock=UNLOCK)'),

        exposes.numeric('pin_number', ea.STATE),
        exposes.numeric('badge_number', ea.STATE),
        exposes.enum('event', ea.STATE, ['none', 'pin', 'badge', 'abandon', 'tamper_on', 'tamper_off']),
    ],

    meta: { multiEndpoint: true },

    endpoint: () => ({
        l1: 1,
        l2: 2,
        l3: 3,
    }),
};

module.exports = device;
