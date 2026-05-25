const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');

const exposes = zigbeeHerdsmanConverters['exposes'] || require("zigbee-herdsman-converters/lib/exposes");
const ea = exposes.access;
const e = exposes.presets;

const fz = zigbeeHerdsmanConverters.fromZigbeeConverters || zigbeeHerdsmanConverters.fromZigbee;
const tz = zigbeeHerdsmanConverters.toZigbeeConverters || zigbeeHerdsmanConverters.toZigbee;

fz.ptvo_on_off = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.data.hasOwnProperty('onOff')) {
            const channel = msg.endpoint.ID;
            const endpointName = `l${channel}`;
            const property = `state_${endpointName}`;
            return {[property]: msg.data['onOff'] === 1 ? 'ON' : 'OFF'};
        }
    },
};

// Déclenche L1 ou L2 pendant 3 minutes puis auto-OFF via onWithTimedOff (genOnOff standard).
// z2m strip le suffixe d'endpoint (_l1/_l2) avant de chercher la clé ; entity est déjà le bon endpoint.
// Un OFF explicite (state_l1/state_l2: OFF) coupe immédiatement avant la fin du timer.
tz.siren_pni_declenchement = {
    key: ['declenchement'],
    convertSet: async (entity, key, value, meta) => {
        await entity.command('genOnOff', 'onWithTimedOff', {
            ctrlbits: 0x00,
            ontime: 1800,        // 3 min × 60s × 10 = 1800 (unité : 1/10s)
            offwaittime: 0x0000,
        });
    },
};

const device = {
    zigbeeModel: ['SIREN-PNI-S002'],
    model: 'SIREN-PNI-S002',
    vendor: 'Custom devices (DiY)',
    description: '[Configurable firmware](https://ptvo.info/zigbee-configurable-firmware-features/)',
    fromZigbee: [fz.ptvo_on_off],
    toZigbee: [tz.on_off, tz.siren_pni_declenchement],
    exposes: [
        e.switch().withEndpoint('l1'),
        e.switch().withEndpoint('l2'),
        exposes.enum('declenchement', ea.SET, ['start']).withEndpoint('l1').withDescription('Déclencher sirène L1 — 3 min auto-stop (OFF coupe immédiatement)'),
        exposes.enum('declenchement', ea.SET, ['start']).withEndpoint('l2').withDescription('Déclencher sirène L2 — 3 min auto-stop (OFF coupe immédiatement)'),
    ],
    meta: {
        multiEndpoint: true,
    },
    endpoint: (device) => {
        return {l1: 1, l2: 2};
    },
    configure: async (device, coordinatorEndpoint, logger) => {
        const endpoint = device.getEndpoint(1);
        await endpoint.read('genBasic', ['modelId', 'swBuildId', 'powerSource']);
    },
};

module.exports = device;
