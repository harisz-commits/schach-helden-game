import type { EventDefinition } from '../core/types';

/**
 * Random map events. Every choice resolves through EventResolver, which reads
 * the `outcome` data - no per-event code paths.
 */
export const EVENTS: EventDefinition[] = [
  {
    id: 'injured_knight',
    name: 'The Injured Knight',
    description:
      'A knight in shattered plate leans against a broken column. He offers nothing but a promise: help him, and he will not forget it.',
    minFloor: 1,
    weight: 100,
    choices: [
      {
        id: 'pay',
        label: 'Give 50 Gold',
        cost: 50,
        outcome: {
          type: 'RANDOM',
          options: [
            { weight: 55, text: 'He presses a relic into your hand.', outcome: { type: 'RELIC', relicRarity: 'COMMON' } },
            { weight: 45, text: 'He shares his field medicine.', outcome: { type: 'HEAL_ALL', value: 0.15 } },
          ],
        },
      },
      { id: 'leave', label: 'Walk on', outcome: { type: 'NOTHING', text: 'You leave him to the ruins.' } },
    ],
  },
  {
    id: 'cursed_chest',
    name: 'The Cursed Chest',
    description: 'Iron bound, sealed with wax that has never melted. Something inside is worth guarding this well.',
    minFloor: 1,
    weight: 100,
    choices: [
      {
        id: 'open',
        label: 'Break the seal',
        outcome: {
          type: 'RANDOM',
          options: [
            { weight: 45, text: 'Light spills out.', outcome: { type: 'BLESSING_CHOICE', blessingRarity: 'LEGENDARY' } },
            { weight: 30, text: 'Gold, and plenty of it.', outcome: { type: 'GOLD', value: 120 } },
            { weight: 25, text: 'Something was waiting inside.', outcome: { type: 'SPAWN_ELITE' } },
          ],
        },
      },
      { id: 'leave', label: 'Leave it sealed', outcome: { type: 'NOTHING', text: 'Some seals are seals for a reason.' } },
    ],
  },
  {
    id: 'blood_altar',
    name: 'The Blood Altar',
    description: 'A basin cut from black stone. The channels around it are dry, and very deliberately shaped.',
    minFloor: 2,
    weight: 90,
    choices: [
      {
        id: 'offer',
        label: 'Offer blood (-20% current HP)',
        hpCost: 0.2,
        outcome: { type: 'BLESSING_UPGRADED_CHOICE', blessingRarity: 'EPIC', text: 'The stone drinks, and gives back.' },
      },
      { id: 'leave', label: 'Refuse', outcome: { type: 'NOTHING', text: 'The basin stays dry.' } },
    ],
  },
  {
    id: 'lost_merchant',
    name: 'The Lost Merchant',
    description: 'Her cart lost a wheel three floors ago. She wants to lighten the load more than she wants a fair price.',
    minFloor: 2,
    weight: 90,
    choices: [
      { id: 'buy', label: 'Buy a relic (40 Gold)', cost: 40, outcome: { type: 'RELIC', relicRarity: 'RARE' } },
      { id: 'buy_cheap', label: 'Buy her cheapest (20 Gold)', cost: 20, outcome: { type: 'RELIC', relicRarity: 'COMMON' } },
      { id: 'leave', label: 'Decline', outcome: { type: 'NOTHING', text: 'She waves you on without malice.' } },
    ],
  },
  {
    id: 'ancient_library',
    name: 'The Ancient Library',
    description: 'Most of the shelves are ash. Two books survived, and you have time to read exactly one.',
    minFloor: 3,
    weight: 85,
    choices: [
      { id: 'map', label: 'The cartographer’s ledger', outcome: { type: 'REVEAL_MAP', value: 14, text: 'The floor unfolds in your mind.' } },
      { id: 'reroll', label: 'The book of second chances', outcome: { type: 'BLESSING_REROLL', value: 1, text: 'You gain a blessing reroll.' } },
    ],
  },
  {
    id: 'fallen_army',
    name: 'The Fallen Army',
    description: 'A company that never made it out. A handful of them are still standing, in a manner of speaking.',
    minFloor: 3,
    weight: 80,
    choices: [
      {
        id: 'recruit',
        label: 'Call them to the banner',
        requires: 'FREE_ARMY_SLOT',
        outcome: { type: 'MERCENARY', value: 1, text: 'They fall in behind you for this floor.' },
      },
      { id: 'loot', label: 'Take what they carried', outcome: { type: 'GOLD', value: 70 } },
    ],
  },
  {
    id: 'wishing_well',
    name: 'The Wishing Well',
    description: 'The water is far too clear for a well this old.',
    minFloor: 1,
    weight: 85,
    choices: [
      {
        id: 'toss',
        label: 'Throw in 30 Gold',
        cost: 30,
        outcome: {
          type: 'RANDOM',
          options: [
            { weight: 35, text: 'The well returns your coin, with interest.', outcome: { type: 'GOLD', value: 110 } },
            { weight: 30, text: 'The water rises to meet your wounded.', outcome: { type: 'HEAL_ALL', value: 0.2 } },
            { weight: 25, text: 'Something small and old floats up.', outcome: { type: 'RELIC', relicRarity: 'COMMON' } },
            { weight: 10, text: 'Nothing. Just a wet echo.', outcome: { type: 'NOTHING' } },
          ],
        },
      },
      { id: 'leave', label: 'Keep your gold', outcome: { type: 'NOTHING', text: 'You keep your coin.' } },
    ],
  },
  {
    id: 'duelist',
    name: 'The Duelist',
    description: 'He has been waiting a very long time for someone worth the trouble.',
    minFloor: 4,
    weight: 75,
    choices: [
      {
        id: 'accept',
        label: 'Accept the duel',
        outcome: { type: 'SPAWN_DUEL', text: 'Steel is drawn. Win, and the reward is guaranteed.' },
      },
      { id: 'decline', label: 'Decline', outcome: { type: 'NOTHING', text: 'He spits, and lets you pass.' } },
    ],
  },
  {
    id: 'cursed_crown',
    name: 'The Cursed Crown',
    description: 'A circlet of black gold, still warm. Wearing it would be a decision you cannot take back.',
    minFloor: 5,
    weight: 70,
    choices: [
      {
        id: 'wear',
        label: 'Wear the crown',
        outcome: {
          type: 'RUN_MODIFIER',
          text: '+30% Attack, -15% Max HP for the rest of the run.',
          modifiers: [
            { stat: 'attack', mode: 'PERCENT', value: 0.3, sourceId: 'cursed_crown' },
            { stat: 'maxHP', mode: 'PERCENT', value: -0.15, sourceId: 'cursed_crown' },
          ],
        },
      },
      { id: 'leave', label: 'Leave it', outcome: { type: 'NOTHING', text: 'It is still warm when you set it down.' } },
    ],
  },
  {
    id: 'royal_feast',
    name: 'The Royal Feast',
    description: 'A table set for forty, untouched, and impossibly still hot.',
    minFloor: 4,
    weight: 75,
    choices: [
      {
        id: 'eat',
        label: 'Eat your fill',
        outcome: { type: 'GUARDIAN_BUFF', value: 0.15, text: 'Your armies are restored - but this floor’s Guardian has noticed.' },
      },
      { id: 'leave', label: 'Do not touch it', outcome: { type: 'NOTHING', text: 'Nobody eats. Nobody says why.' } },
    ],
  },
  {
    id: 'shrine_of_names',
    name: 'The Shrine of Names',
    description: 'Thousands of names are carved here. Near the bottom, there is room for more.',
    minFloor: 6,
    weight: 65,
    requiresFeature: 'EXTENDED_EVENTS',
    choices: [
      {
        id: 'carve',
        label: 'Carve your own name (-10% current HP)',
        hpCost: 0.1,
        outcome: { type: 'BLESSING_CHOICE', blessingRarity: 'EPIC', text: 'The shrine accepts the entry.' },
      },
      { id: 'read', label: 'Read the names instead', outcome: { type: 'REVEAL_MAP', value: 8 } },
    ],
  },
  {
    id: 'gambler',
    name: 'The Gambler at the Gate',
    description: 'He deals two cards face down and does not explain the rules.',
    minFloor: 5,
    weight: 65,
    requiresFeature: 'EXTENDED_EVENTS',
    choices: [
      {
        id: 'play',
        label: 'Turn a card (60 Gold)',
        cost: 60,
        outcome: {
          type: 'RANDOM',
          options: [
            { weight: 30, text: 'A crown. He pays out generously.', outcome: { type: 'GOLD', value: 220 } },
            { weight: 30, text: 'A blade. He hands you something sharp.', outcome: { type: 'RELIC', relicRarity: 'EPIC' } },
            { weight: 40, text: 'A blank card. He shrugs.', outcome: { type: 'NOTHING' } },
          ],
        },
      },
      { id: 'leave', label: 'Walk away', outcome: { type: 'NOTHING', text: 'He was going to win anyway.' } },
    ],
  },
];

export const EVENTS_BY_ID: Record<string, EventDefinition> = Object.fromEntries(
  EVENTS.map((event) => [event.id, event]),
);

export function getEvent(id: string): EventDefinition {
  const event = EVENTS_BY_ID[id];
  if (!event) throw new Error(`Unknown event: ${id}`);
  return event;
}

export function eventPool(floor: number, features: string[]): EventDefinition[] {
  return EVENTS.filter(
    (event) => event.minFloor <= floor && (!event.requiresFeature || features.includes(event.requiresFeature)),
  );
}
