# z2m-external-converters

Convertisseurs externes Zigbee2MQTT pour des appareils non intégrés nativement.

## Installation

Copier le fichier `.js` du convertisseur souhaité dans le répertoire `data/external_converters/` de Zigbee2MQTT, puis redémarrer Z2M.

Avec le plugin Jeedom Z2M, le chemin est :
```
/var/www/html/plugins/z2m/data/external_converters/
```

---

## Convertisseurs disponibles

### DAEWOO WKE502Z — Clavier Zigbee avec lecteur RFID

**Fichier :** [`daewoo/daewoo_WKE502Z.js`](daewoo/daewoo_WKE502Z.js)  
**Source TypeScript :** [`daewoo/daewoo_WKE502Z.ts`](daewoo/daewoo_WKE502Z.ts)  
**Fingerprint :** `TS0601` / `_TZE200_rt5dklro` (protocole Tuya MCU)

Clavier Zigbee DAEWOO WKE502Z avec pavé numérique et lecteur de badges RFID (jusqu'à 10 badges WRF501).
Conçu comme panneau de contrôle d'alarme, compatible avec le plugin Jeedom [ArmManager](https://github.com/mickadam29/ArmManager).

#### Actions exposées

| Action | Description |
|--------|-------------|
| `disarm` | Désarmement |
| `arm_away` | Armement total |
| `arm_home` | Armement partiel (mode présence) |
| `sos` | Alarme SOS |

#### Propriétés principales

| Propriété | Accès | Description |
|-----------|-------|-------------|
| `action` | R | Dernière action déclenchée |
| `armed` | R/W | État armé — écrire `true` pour acquitter arm_away/arm_home |
| `sos_alarm` | R | `true` tant que le SOS est actif |
| `battery` | R | Batterie % |
| `tamper` | R | Détection de sabotage |
| `user_id` | R | Slot badge / index utilisateur |
| `user_last_seen` | R | Horodatage ISO de la dernière authentification |
| `arm_delay_time` | R/W | Délai avant armement (0–180 s) |
| `beep_sound_enabled` | R/W | Bip sur pression touche |
| `quick_arm_enabled` | R/W | Armement Away sans code |
| `quick_home_enabled` | R/W | Armement Home sans code |
| `quick_disarm_enabled` | R/W | Désarmement sans code |
| `quick_sos_enabled` | R/W | SOS sans code |

#### Points techniques clés

- **Flag dp:101 "mode hub"** : doit être `true` après chaque power cycle pour que arm_away/arm_home émettent des trames Zigbee. Le convertisseur gère ça automatiquement via `onEvent('deviceAnnounce')`.
- **Protocole ACK dp:23** : après arm_away/arm_home, le clavier réessaie jusqu'à recevoir dp:23=true. Le convertisseur envoie l'ACK automatiquement.
- **DPs volatiles** : les quick modes et les bips sont remis aux valeurs par défaut au power cycle. Le convertisseur les restaure depuis le cache Z2M.

#### Source TypeScript

`daewoo/daewoo_WKE502Z.ts` — source pour PR vers [`Koenkk/zigbee-herdsman-converters`](https://github.com/Koenkk/zigbee-herdsman-converters) (`src/devices/daewoo.ts`), format moderne `DefinitionWithExtend` avec `tuya.modernExtend.tuyaBase({dp: true})`.

---

*D'autres convertisseurs seront ajoutés.*
