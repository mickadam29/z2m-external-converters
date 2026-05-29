const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const exposes = zigbeeHerdsmanConverters['exposes'] || require("zigbee-herdsman-converters/lib/exposes");
const ea = exposes.access;
const e = exposes.presets;
const fz = zigbeeHerdsmanConverters.fromZigbeeConverters || zigbeeHerdsmanConverters.fromZigbee;

fz.ptvo_on_off = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.data.hasOwnProperty('onOff')) {
            const channel = msg.endpoint.ID;
            return {[`state_input_${channel - 1}`]: msg.data['onOff'] === 0 ? 'ON' : 'OFF'};
        }
    },
};

const device = {
    zigbeeModel: ['FUEL-TANK-LEVEL'],
    model: 'FUEL-TANK-LEVEL',
    vendor: 'ptvo.info',
    description: 'Capteur niveau carburant 4 entrées binaires',
    fromZigbee: [fz.ptvo_on_off],
    toZigbee: [],
    exposes: [
        exposes.binary('state', ea.STATE, 'ON', 'OFF').withEndpoint('input_1').withDescription('Entrée 1'),
        exposes.binary('state', ea.STATE, 'ON', 'OFF').withEndpoint('input_2').withDescription('Entrée 2'),
        exposes.binary('state', ea.STATE, 'ON', 'OFF').withEndpoint('input_3').withDescription('Entrée 3'),
        exposes.binary('state', ea.STATE, 'ON', 'OFF').withEndpoint('input_4').withDescription('Entrée 4'),
    ],
    meta: { multiEndpoint: true },
    endpoint: (device) => ({ input_1: 2, input_2: 3, input_3: 4, input_4: 5 }),
    configure: async (device, coordinatorEndpoint, logger) => {
        const ep = device.getEndpoint(1);
        await ep.read('genBasic', ['modelId', 'swBuildId', 'powerSource']);
    },
};

module.exports = device;
