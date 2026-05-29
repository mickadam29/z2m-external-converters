const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const exposes = zigbeeHerdsmanConverters['exposes'] || require('zigbee-herdsman-converters/lib/exposes');
const ea = exposes.access;
const fz = zigbeeHerdsmanConverters.fromZigbeeConverters || zigbeeHerdsmanConverters.fromZigbee;

fz.ptvo_on_off = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.data.hasOwnProperty('onOff') && msg.endpoint.ID === 2) {
            return { input2: msg.data['onOff'] === 1 ? 1 : 0 };
        }
    },
};

const device = {
    zigbeeModel: ['MAINS-FAULT'],
    model: 'MAINS-FAULT',
    vendor: 'Custom devices (DiY)',
    description: 'Détecteur coupure secteur — entrée 2 (1=secteur présent, 0=absent)',
    fromZigbee: [fz.ptvo_on_off],
    toZigbee: [],
    exposes: [
        exposes.binary('input2', ea.STATE, 1, 0)
            .withDescription('Présence secteur : 1=présent, 0=absent'),
    ],
    meta: { multiEndpoint: true },
    endpoint: (device) => ({ l2: 2 }),
    configure: async (device, coordinatorEndpoint, logger) => {
        const endpoint = device.getEndpoint(2);
        await endpoint.read('genBasic', ['modelId', 'swBuildId', 'powerSource']);
    },
};

module.exports = device;
