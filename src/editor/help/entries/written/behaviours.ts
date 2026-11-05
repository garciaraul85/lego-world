import type { HelpEntry } from '../types';

const LIB = '[aria-label="Logic graphs, variables and nodes"]';

/** Milestone 3b (B1): behaviours — scripts with fields that you attach to things (Unity's components). */
export const BEHAVIOURS: HelpEntry[] = [
  {
    id: 'logic.behaviour',
    also: [
      'behaviour',
      'behavior',
      'component',
      'monobehaviour',
      'script component',
      'fields',
      'public variables',
      'this',
      'own variables',
      'update',
      'class',
    ],
    screen: 'logic',
    kind: 'area',
    name: 'Behaviours',
    purpose:
      'A behaviour is a script you attach to things, like a component in Unity: to an asset (every copy of it runs it), a character, or one placed copy. Each copy runs its own: **this** is that copy, its **fields** are its settings (the Inspector shows them wherever it is attached, and each asset or copy can set its own values), and its **own variables** belong to each copy. Its events run for the copy they are about (used, hit, smashed…), **On start** runs for each copy when play starts and **On update** runs every game step. In Code it reads as a class: `class Collector extends Behaviour { needs = field.number(3, { label: "Gems needed" }); interact(e) { … } }` — fields are `name = field.type(default, { label, min, max })`, own variables `name = value`, each method one event, and `this.name` reads or changes a field or own variable.',
    options: [
      [
        'Fields',
        'its settings: a name, a type (number, yes/no, text, item, placed object, asset, character, sound…), a label, a default and, for numbers, a range',
      ],
      [
        'Own variables',
        'values each copy keeps for itself (how often it was used, a timer); they start again every play',
      ],
      ['Used on', 'the assets, characters and placed copies it is attached to'],
    ],
    steps: [
      'In Logic, under **Behaviours**, press **+ New**. It starts with an On start card.',
      'Under **Fields**, type a name (gemsNeeded), pick a type and press **Add field**; give it a label and a default.',
      'Add cards: Get field / Set field / Add to field (This object) read and change this copy’s fields and own variables. Or write it in Code.',
      'In the Scene, select a placed object and press **+ Script** in the Inspector, for every copy of its asset or only this copy. Set its fields there.',
    ],
    commands: ['logic.create', 'logic.replace', 'script.attach'],
    match: [
      { in: '[data-tour="behaviour-fields"]' },
      { in: LIB, name: /^(New behaviour|What is “Behaviours”\?)$/ },
      { sel: '[data-tour="behaviour-note"]' },
    ],
    related: ['scene.behaviours', 'logic.vars', 'scene.script'],
  },
  {
    id: 'scene.behaviours',
    also: ['behaviour', 'behaviours', 'component', 'add component', '+ script', 'attach', 'fields'],
    screen: 'scene',
    kind: 'area',
    name: 'Behaviours (Inspector)',
    purpose:
      'The behaviours this placed object runs, each with its fields. Its asset’s behaviours run on **every copy**; one attached **only to this copy** runs here alone. For an asset’s behaviour, **Values for** chooses whose values you change: every copy’s (the asset’s) or this copy’s own, which win (↺ puts a field back to the asset’s value). **Off here** stops an asset’s behaviour on this copy; × removes it.',
    steps: [
      'Select a placed object in the Scene.',
      'Under **Behaviours**, pick one, choose **Every …** or **Only this copy**, and press **+ Script**.',
      'Set its fields. Press its name to open its cards and code in Logic.',
      'Press Play: each copy runs it with its own values.',
    ],
    commands: ['script.attach', 'script.detach', 'script.setField'],
    match: [{ in: '[data-tour="object-behaviours"]' }],
    related: ['logic.behaviour', 'scene.script'],
  },
  {
    id: 'characters.behaviours',
    also: ['behaviour', 'behaviours', 'component', 'script on a character'],
    screen: 'characters',
    kind: 'area',
    name: 'Behaviours (a character’s)',
    purpose:
      'Behaviours every copy of this character placed on a map runs, with their field values. + Script attaches one; × removes it; its name opens it in Logic.',
    commands: ['script.attach', 'script.detach', 'script.setField'],
    match: [{ in: '[data-tour="char-behaviours"]' }],
    related: ['logic.behaviour', 'scene.behaviours'],
  },
];
