const tuya = require('zigbee-herdsman-converters/lib/tuya');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const e = exposes.presets;
const ea = exposes.access;

function localISOString() {
    const now = new Date();
    const off = -now.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const pad = (n) => String(Math.abs(n)).padStart(2, '0');
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .replace('Z', `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`);
}

// DAEWOO WKE502Z — Zigbee keypad (TS0601 / _TZE200_rt5dklro)
// Confirmed DP map via serial (MCU UART) + Zigbee capture:
//   DP 3  (u32)  — battery %
//   DP 23 (bool) — arm state; hub must write 1 to ack arm_away/arm_home (keypad retries until ack)
//   DP 24 (bool) — tamper
//   DP 25 (enum) — arm mode at STARTUP ONLY: 0=disarmed, 2=armed. NOT real-time.
//   DP 26        — disarm action; keypad self-reports dp:23=0
//   DP 27        — arm_away action; keypad retries until hub writes dp:23=1
//   DP 28        — arm_home action; keypad retries until hub writes dp:23=1
//   DP 29        — sos action (unconditional)
//   DP 101(bool) — hub mode flag: MUST be 1 for dp:27/dp:28 to fire; resets on power cycle
//   DP 112       — user_id (accompanies all actions: RFID badge slot or PIN user index)
//
// Note: tuyaFz.datapoints uses Array.find (first match per dp id). Entries that need to publish
// multiple properties use null key so the from() return value is Object.assign'd into the result.
// getDataValue() returns a JS boolean for bool datatype, not a number — use === true || === 1.

const definition = {
    fingerprint: tuya.fingerprint('TS0601', ['_TZE200_rt5dklro']),
    model: 'WKE502Z',
    vendor: 'DAEWOO',
    description: 'Smart Zigbee keypad with RFID badge reader',
    extend: [tuya.modernExtend.tuyaBase({dp: true})],
    exposes: [
        e.action(['disarm', 'arm_away', 'arm_home', 'sos']),
        e.numeric('arm_mode', ea.STATE)
            .withDescription('Arm mode reported at startup only: 0=disarmed, 2=armed. NOT updated in real-time.'),
        e.binary('armed', ea.STATE_SET, true, false)
            .withDescription('Arm state — write true to confirm arm_away/arm_home to the keypad'),
        e.binary('sos_alarm', ea.STATE, true, false)
            .withDescription('SOS alarm active — set true by SOS keypress, cleared false by disarm'),
        e.battery(),
        e.tamper(),
        e.text('user_id', ea.STATE)
            .withDescription('User ID (RFID badge slot or PIN index) that triggered the last action'),
        e.text('user_last_seen', ea.STATE)
            .withDescription('ISO timestamp of last user authentication — changes on every badge/code event'),
        e.text('last_added_user_code', ea.STATE)
            .withDescription('Last code entered by a user'),
        e.text('admin_code', ea.STATE_SET)
            .withDescription('Admin code (change with caution)'),
        e.numeric('arm_delay_time', ea.STATE_SET)
            .withValueMin(0).withValueMax(180).withUnit('s')
            .withDescription('Delay before arming (0-180 s)'),
        e.binary('beep_sound_enabled', ea.STATE_SET, 'ON', 'OFF')
            .withDescription('Enable keypad beep on key press'),
        e.binary('arm_delay_beep_sound', ea.STATE_SET, 'ON', 'OFF')
            .withDescription('Beep during arm delay countdown'),
        e.binary('quick_home_enabled', ea.STATE_SET, 'ON', 'OFF')
            .withDescription('Allow arm-home without entering a code'),
        e.binary('quick_arm_enabled', ea.STATE_SET, 'ON', 'OFF')
            .withDescription('Allow arm-away without entering a code'),
        e.binary('quick_disarm_enabled', ea.STATE_SET, 'ON', 'OFF')
            .withDescription('Allow disarm without entering a code'),
        e.binary('quick_sos_enabled', ea.STATE_SET, 'ON', 'OFF')
            .withDescription('Allow SOS without entering a code'),
    ],
    meta: {
        tuyaDatapoints: [
            // dp:23 from: null key → Object.assign into result (armed only, no action — avoid
            // spurious 'arm' events when hub ack or SOS follow-up dp:23=1 arrive)
            [23, null,    {from: (v) => ({armed: v === true || v === 1})}],
            // dp:23 to: write armed=true/false → dp:23=1/0 (hub ack for arm_away/arm_home)
            [23, 'armed', {to: (v) => v ? 1 : 0}],

            [3,  'battery', tuya.valueConverter.raw],

            [24, 'tamper', {
                from: (v) => v === true || v === 1,
                to:   (v) => v ? 1 : 0,
            }],

            [25, 'arm_mode', tuya.valueConverter.raw],

            // dp:26/27/28/29: include user_last_seen on every action so it always refreshes,
            // even when dp:112 does not accompany the action (e.g. arm_away/arm_home)
            [26, null, {from: () => ({action: 'disarm',   sos_alarm: false, user_last_seen: localISOString()})}],
            [27, null, {from: () => ({action: 'arm_away', armed: true,       user_last_seen: localISOString()})}],
            [28, null, {from: () => ({action: 'arm_home', armed: true,       user_last_seen: localISOString()})}],
            [29, null, {from: () => ({action: 'sos',      sos_alarm: true,   user_last_seen: localISOString()})}],

            [103, 'arm_delay_time',      tuya.valueConverter.raw],
            [104, 'beep_sound_enabled',  tuya.valueConverter.onOff],
            [105, 'quick_home_enabled',  {from: tuya.valueConverter.onOff.from, to: (v) => v === 'ON' ? true : false}],
            [106, 'quick_disarm_enabled',tuya.valueConverter.onOff],
            [107, 'quick_arm_enabled',   tuya.valueConverter.onOff],
            [108, 'admin_code',          tuya.valueConverter.raw],
            [109, 'last_added_user_code',tuya.valueConverter.raw],
            [110, 'quick_sos_enabled',   {from: tuya.valueConverter.onOff.from, to: (v) => v === 'ON' ? true : false}],
            [111, 'arm_delay_beep_sound',tuya.valueConverter.onOff],
            // dp:112: user_id + user_last_seen timestamp → forces re-publish even when same badge used twice
            [112, null, {from: (v) => ({user_id: String(v), user_last_seen: localISOString()})}],
            [101, null, {from: () => undefined}], // hub mode echo — suppress "not defined" warning
        ],
    },
    configure: async (device, coordinatorEndpoint) => {
        await tuya.configureMagicPacket(device, coordinatorEndpoint);
        await tuya.sendDataPointBool(device.getEndpoint(1), 101, true, 'dataRequest', 1);
    },
    onEvent: async (type, data, device) => {
        const endpoint = device.getEndpoint(1);
        if (type === 'deviceAnnounce') {
            // Re-enable hub mode — mandatory after every power cycle
            await tuya.sendDataPointBool(endpoint, 101, true, 'dataRequest', 1);
            // DP 104/105/106/107/110 are volatile: reset to firmware defaults on power cycle.
            // Restore from Z2M cached state so user settings survive reboots.
            const s = (data && data.state) ? data.state : {};
            const volatileBoolDps = [
                [104, 'beep_sound_enabled'],
                [105, 'quick_home_enabled'],
                [106, 'quick_disarm_enabled'],
                [107, 'quick_arm_enabled'],
                [110, 'quick_sos_enabled'],
            ];
            for (const [dp, key] of volatileBoolDps) {
                if (s[key] !== undefined) {
                    await tuya.sendDataPointBool(endpoint, dp, s[key] === 'ON' || s[key] === true, 'dataRequest', 1);
                }
            }
        }
        if (type === 'message' && data.cluster === 'manuSpecificTuya' && data.type === 'commandDataReport') {
            // Ack arm_away (dp:27) and arm_home (dp:28) with dp:23=1 so keypad stops retrying.
            // Code validation is done by the keypad hardware before sending these DPs.
            if (data.data.dpValues.some((d) => d.dp === 27 || d.dp === 28)) {
                await tuya.sendDataPointBool(endpoint, 23, true, 'dataRequest', 1);
            }
        }
    },
};

module.exports = definition;
