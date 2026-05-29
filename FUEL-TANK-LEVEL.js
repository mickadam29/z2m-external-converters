const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const exposes = zigbeeHerdsmanConverters['exposes'] || require("zigbee-herdsman-converters/lib/exposes");
const ea = exposes.access;
const fz = zigbeeHerdsmanConverters.fromZigbeeConverters || zigbeeHerdsmanConverters.fromZigbee;

fz.fuel_inputs = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.data.hasOwnProperty('onOff')) {
            const keyMap = {2: 'capteur_100', 3: 'capteur_75', 4: 'capteur_50', 5: 'capteur_25'};
            const key = keyMap[msg.endpoint.ID];
            if (!key) return;
            return {[key]: msg.data['onOff'] === 0 ? 'ON' : 'OFF'};
        }
    },
};

const device = {
    zigbeeModel: ['FUEL-TANK-LEVEL'],
    model: 'FUEL-TANK-LEVEL',
    vendor: 'ptvo.info',
    description: 'Capteur niveau carburant 4 entrées binaires',
    fromZigbee: [fz.fuel_inputs],
    toZigbee: [],
    exposes: [
        exposes.binary('capteur_100', ea.STATE, 'ON', 'OFF').withDescription('Capteur niveau 100%'),
        exposes.binary('capteur_75', ea.STATE, 'ON', 'OFF').withDescription('Capteur niveau 75%'),
        exposes.binary('capteur_50', ea.STATE, 'ON', 'OFF').withDescription('Capteur niveau 50%'),
        exposes.binary('capteur_25', ea.STATE, 'ON', 'OFF').withDescription('Capteur niveau 25%'),
    ],
    configure: async (device, coordinatorEndpoint, logger) => {
        const ep = device.getEndpoint(1);
        await ep.read('genBasic', ['modelId', 'swBuildId', 'powerSource']);
    },
};

module.exports = device;
