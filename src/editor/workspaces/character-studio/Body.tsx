import {
  BODY_FAMILIES,
  BONE_ROLES,
  type Body,
  type BodyBrick,
  type BodyFamily,
  type BodyPlan,
  type Bone,
  checkPlan,
  MOVE_INFO,
  MOVE_KINDS,
  PARAM_INFO,
  type ParamKey,
  ROLE_INFO,
} from '../../../core/character/body';
import { FAMILY_INFO, FAMILY_PRESETS, makeFamily } from '../../../core/character/families';
import { type ResolvedBody, resolveBody } from '../../../core/character/resolve';
import { newId } from '../../../core/ids';
import type { Asset, Character } from '../../../core/schema';
import { FieldHelp } from '../../components/fields';
import { NumField, type Props, SHEET_HELP } from './Sheet';

/**
 * P22 part 3: the Body tab — the minifig or a body family shaped with sliders, its colours, a brick build
 * worn on the skeleton (each brick follows the nearest bone; painting fixes the rest), and the Skeleton
 * editor for a body plan of the game's own. Each edit is one character.update or bodyplan.put, one undo step.
 */
export const BODY_HELP = {
  body: SHEET_HELP.body,
  bricks:
    'Build a creature in the Asset studio, then wear it here: each brick follows the bone it is nearest to. To fix one, pick a bone in “Paint onto” and click its bricks in the preview.',
  skeleton:
    'The bones inside the body. Each bone hangs from another and has a role that says how it moves (a leg steps, a wing flaps, a tail sways). Edit the skeleton to add, remove, move and rename bones, set how far each one swings, and give it bricks.',
} as const;

const SLOT_LABEL = { main: 'Main', accent: 'Accent', belly: 'Belly', eye: 'Eyes' } as const;

/** the body of the character as drawn now (or null: the minifig) */
const resolved = new Map<string, ResolvedBody | null>();
export function bodyOfChr(chr: Pick<Character, 'body'>, get: (p: string) => unknown): ResolvedBody | null {
  if (!chr.body) return null;
  // the same body (and the same plan and build) is the same object, so the preview keeps its camera
  const b = chr.body;
  const key = JSON.stringify([
    b,
    b.plan ? get(`bodyplans/${b.plan}.json`) : 0,
    b.asset ? get(`assets/${b.asset}.json`) : 0,
  ]);
  if (!resolved.has(key)) {
    let r: ResolvedBody | null = null;
    try {
      r = resolveBody(b, get);
    } catch {
      r = null;
    }
    if (resolved.size > 60) resolved.delete(resolved.keys().next().value!);
    resolved.set(key, r);
  }
  return resolved.get(key)!;
}

export function BodyTab({ c, chr, save, inProject }: Props & { inProject: boolean }) {
  const ed = c.ed;
  const body: Body = chr.body ?? {};
  const own = body.plan ? (ed.store.get(`bodyplans/${body.plan}.json`) as BodyPlan | undefined) : undefined;
  const family: BodyFamily = own ? 'minifig' : (body.family ?? 'minifig');
  const isMinifig = !own && family === 'minifig';
  const plans = ed.store
    .list('bodyplans/')
    .map((p) => ed.store.get(p) as BodyPlan)
    .filter(Boolean);
  const setBody = (next: Body | undefined, label: string) => {
    const { body: _b, ...rest } = chr;
    save((next ? { ...rest, body: next } : rest) as Character, label);
  };
  const pickFamily = (f: BodyFamily) => {
    if (f === 'minifig') {
      ed.bodyPaint.value = null;
      setBody(undefined, 'Body: Minifig');
      return;
    }
    const { plan: _p, ...keep } = body;
    setBody({ ...keep, family: f }, `Body: ${FAMILY_INFO[f].label}`);
  };
  const pickPlan = (p: BodyPlan) => {
    const { family: _f, ...keep } = body;
    setBody({ ...keep, plan: p.id }, `Body: ${p.name}`);
  };
  const params = own ? (['size'] as ParamKey[]) : FAMILY_INFO[family].params;
  const resolved = bodyOfChr(chr, (p) => ed.store.get(p));
  const colors = { ...FAMILY_INFO[family === 'minifig' ? 'fourLegs' : family].colors, ...(body.colors ?? {}) };

  return (
    <>
      <div class="sec" data-tour="char-body" data-help="characters.body">
        <div class="sech">
          <span>
            Body
            <FieldHelp label="Body" text={BODY_HELP.body} />
          </span>
        </div>
        <div class="body-grid" role="radiogroup" aria-label="Body family">
          {BODY_FAMILIES.map((f) => (
            <button
              type="button"
              role="radio"
              aria-checked={!own && family === f}
              class={`chip body-card ${!own && family === f ? 'on' : ''}`}
              data-tour={`body-family-${f}`}
              title={FAMILY_INFO[f].about}
              disabled={!inProject && f !== 'minifig'}
              onClick={() => pickFamily(f)}
            >
              <span aria-hidden="true">{FAMILY_INFO[f].icon}</span> {FAMILY_INFO[f].label}
            </button>
          ))}
          {plans.map((p) => (
            <button
              type="button"
              role="radio"
              aria-checked={own?.id === p.id}
              class={`chip body-card ${own?.id === p.id ? 'on' : ''}`}
              data-tour={`body-plan-${p.id}`}
              title={`${p.name}: a body plan of this game (${MOVE_INFO[p.move]})`}
              onClick={() => pickPlan(p)}
            >
              <span aria-hidden="true">🦴</span> {p.name}
            </button>
          ))}
        </div>
        {!inProject && (
          <p class="muted small">A preset keeps the minifig: change anything (like its name) to make it yours first.</p>
        )}
        {isMinifig ? (
          <p class="muted small">
            A minifig: its look is in the Look tab, its outfits and clips in theirs. Pick a family above for an animal
            or a monster.
          </p>
        ) : (
          <>
            <p class="muted small">
              {own ? own.name : FAMILY_INFO[family].label}:{' '}
              {FAMILY_INFO[family]?.about && !own ? FAMILY_INFO[family].about : MOVE_INFO[own!.move]}.
            </p>
            {!own && family !== 'minifig' && (
              <div class="body-presets" role="group" aria-label="Presets">
                {FAMILY_PRESETS[family].map((p, i) => (
                  <button
                    type="button"
                    class="chip"
                    data-tour={`body-preset-${i}`}
                    title={`${p.name}: its sliders and colours`}
                    onClick={() =>
                      setBody(
                        { ...body, params: { ...(p.params ?? {}) }, colors: { ...p.colors } },
                        `Preset: ${p.name}`,
                      )
                    }
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            {params.map((k) => (
              <label class="field" key={k}>
                <span>
                  {PARAM_INFO[k].label}{' '}
                  <span class="mono muted">{(body.params?.[k] ?? PARAM_INFO[k].def).toFixed(2)}</span>
                </span>
                <input
                  type="range"
                  aria-label={PARAM_INFO[k].label}
                  data-tour={`body-param-${k}`}
                  min={PARAM_INFO[k].lo}
                  max={PARAM_INFO[k].hi}
                  step={0.05}
                  value={body.params?.[k] ?? PARAM_INFO[k].def}
                  onChange={(e) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    setBody({ ...body, params: { ...(body.params ?? {}), [k]: v } }, `${PARAM_INFO[k].label}: ${v}`);
                  }}
                />
              </label>
            ))}
            <div class="grid2">
              {(Object.keys(SLOT_LABEL) as (keyof typeof SLOT_LABEL)[]).map((k) => (
                <label class="field" key={k}>
                  {SLOT_LABEL[k]} colour
                  <input
                    type="color"
                    aria-label={`${SLOT_LABEL[k]} colour`}
                    data-tour={`body-color-${k}`}
                    value={colors[k]}
                    onChange={(e) =>
                      setBody(
                        { ...body, colors: { ...(body.colors ?? {}), [k]: (e.target as HTMLInputElement).value } },
                        `${SLOT_LABEL[k]} colour`,
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <div class="row" style={{ gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                class={`btn ${ed.bodyWalk.value ? 'on' : ''}`}
                aria-pressed={ed.bodyWalk.value}
                data-tour="body-walk"
                onClick={() => (ed.bodyWalk.value = !ed.bodyWalk.value)}
              >
                {ed.bodyWalk.value
                  ? '■ Stand'
                  : `▶ ${resolved?.move === 'fly' ? 'Fly' : resolved?.move === 'swim' ? 'Swim' : resolved?.move === 'slither' ? 'Slither' : resolved?.move === 'hop' ? 'Hop' : 'Walk'}`}
              </button>
              <label class="lbl">
                <input
                  type="checkbox"
                  data-tour="body-bones"
                  checked={ed.bodyBones.value}
                  onChange={() => (ed.bodyBones.value = !ed.bodyBones.value)}
                />{' '}
                Show the skeleton
              </label>
            </div>
          </>
        )}
      </div>
      {!isMinifig && <BrickBuild c={c} chr={chr} save={save} body={body} resolved={resolved} setBody={setBody} />}
      {!isMinifig && <Skeleton c={c} chr={chr} save={save} body={body} own={own} setBody={setBody} />}
    </>
  );
}

type Sub = Props & { body: Body; setBody: (b: Body | undefined, label: string) => void };

function BrickBuild({ c, body, resolved, setBody }: Sub & { resolved: ResolvedBody | null }) {
  const ed = c.ed;
  const assets = ed.store
    .list('assets/')
    .map((p) => ed.store.get(p) as Asset)
    .filter(Boolean);
  const counts = new Map<string, number>();
  if (resolved?.fromAsset) for (const b of resolved.bricks) counts.set(b.bone, (counts.get(b.bone) ?? 0) + 1);
  return (
    <div class="sec" data-tour="char-body-bricks" data-help="characters.bodyBricks">
      <div class="sech">
        <span>
          Built from bricks
          <FieldHelp label="Built from bricks" text={BODY_HELP.bricks} />
        </span>
      </div>
      <label class="field">
        Brick build
        <select
          class="inp"
          aria-label="Brick build"
          data-tour="body-asset"
          value={body.asset ?? ''}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            const { asset: _a, attach: _t, ...rest } = body;
            ed.bodyPaint.value = null;
            setBody(v ? { ...rest, asset: v } : rest, v ? 'Wear a brick build' : 'Body’s own bricks');
          }}
        >
          <option value="">None: the body’s own bricks</option>
          {assets.map((a) => (
            <option value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
      {!assets.length && (
        <p class="muted small">Build one in the Asset studio first (it shows here once it is in your game).</p>
      )}
      {body.asset && resolved && (
        <>
          <p class="muted small">
            {resolved.bricks.length} bricks on {[...counts].map(([b, n]) => `${b} (${n})`).join(', ')}.
          </p>
          <label class="field">
            Paint onto
            <select
              class="inp"
              aria-label="Paint bricks onto"
              data-tour="body-paint"
              value={ed.bodyPaint.value ?? ''}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                ed.bodyPaint.value = v || null;
                if (v) ed.bodyBones.value = true;
              }}
            >
              <option value="">Off</option>
              {resolved.bones.map((b) => (
                <option value={b.name}>{b.name}</option>
              ))}
            </select>
          </label>
          {ed.bodyPaint.value && (
            <p class="muted small" role="status">
              Click bricks in the preview: each one you click follows “{ed.bodyPaint.value}”.
            </p>
          )}
          <button
            type="button"
            class="btn"
            data-tour="body-autoattach"
            disabled={!body.attach || !Object.keys(body.attach).length}
            onClick={() => {
              const { attach: _t, ...rest } = body;
              setBody(rest, 'Attach every brick to its nearest bone');
            }}
          >
            Auto-attach (nearest bones)
          </button>
        </>
      )}
    </div>
  );
}

const coordOk = (v: number) => Math.max(-30, Math.min(30, v));

function Skeleton({ c, chr, body, own, setBody }: Sub & { own: BodyPlan | undefined }) {
  const ed = c.ed;
  const put = (plan: BodyPlan, label: string) => {
    const bad = checkPlan(plan);
    if (bad.length) {
      ed.notify(bad[0]!, true);
      return false;
    }
    return ed.exec({ type: 'bodyplan.put', payload: { plan } }, { label }).ok;
  };
  if (!own) {
    return (
      <div class="sec" data-tour="char-skeleton" data-help="characters.skeleton">
        <div class="sech">
          <span>
            Skeleton
            <FieldHelp label="Skeleton" text={BODY_HELP.skeleton} />
          </span>
        </div>
        <p class="muted small">
          The {FAMILY_INFO[body.family ?? 'fourLegs'].label.toLowerCase()} skeleton follows the sliders. To add bones,
          move them or change how they swing, make it a body plan of your own.
        </p>
        <button
          type="button"
          class="btn"
          data-tour="skeleton-edit"
          onClick={() => {
            const fam = body.family ?? 'fourLegs';
            const made = makeFamily(fam, body.params);
            if (!made) return;
            const plan: BodyPlan = {
              id: newId('bodyplan'),
              name: `${chr.name || 'My'} body`.slice(0, 40),
              family: fam,
              ...made,
            };
            const { family: _f, ...keep } = body;
            const { body: _b, ...rest } = chr;
            const r = ed.exec(
              [
                { type: 'bodyplan.put', payload: { plan } },
                { type: 'character.update', payload: { character: { ...rest, body: { ...keep, plan: plan.id } } } },
              ],
              { label: 'Edit the skeleton' },
            );
            if (r.ok) ed.bodyBones.value = true;
          }}
        >
          ✏️ Edit the skeleton
        </button>
      </div>
    );
  }
  const sel = own.bones.find((b) => b.name === ed.bodyBone.value) ?? own.bones[0]!;
  const setBone = (next: Bone, label: string) => {
    const renamed = next.name !== sel.name;
    if (renamed && own.bones.some((b) => b.name === next.name)) {
      ed.notify(`There is already a bone called “${next.name}”.`, true);
      return;
    }
    const plan: BodyPlan = {
      ...own,
      bones: own.bones.map((b) =>
        b.name === sel.name ? next : renamed && b.parent === sel.name ? { ...b, parent: next.name } : b,
      ),
      bricks: renamed ? own.bricks.map((k) => (k.bone === sel.name ? { ...k, bone: next.name } : k)) : own.bricks,
    };
    if (put(plan, label) && renamed) {
      ed.bodyBone.value = next.name;
      // this character's painted bricks follow the new name
      if (body.attach && Object.values(body.attach).includes(sel.name))
        setBody(
          {
            ...body,
            attach: Object.fromEntries(
              Object.entries(body.attach).map(([k, v]) => [k, v === sel.name ? next.name : v]),
            ),
          },
          'Rename bone',
        );
    }
  };
  const bricks = own.bricks.map((k, i) => [k, i] as const).filter(([k]) => k.bone === sel.name);
  const setBrick = (i: number, next: BodyBrick | null, label: string) =>
    put(
      { ...own, bricks: next ? own.bricks.map((k, j) => (j === i ? next : k)) : own.bricks.filter((_, j) => j !== i) },
      label,
    );
  const isRoot = !sel.parent;
  return (
    <div class="sec" data-tour="char-skeleton" data-help="characters.skeleton">
      <div class="sech">
        <span>
          Skeleton: {own.name}
          <FieldHelp label="Skeleton" text={BODY_HELP.skeleton} />
        </span>
      </div>
      <label class="field">
        Body plan name
        <input
          class="inp"
          aria-label="Body plan name"
          value={own.name}
          onChange={(e) => {
            const name = (e.target as HTMLInputElement).value.trim().slice(0, 40);
            if (name) put({ ...own, name }, 'Rename body plan');
          }}
        />
      </label>
      <div class="grid2">
        <label class="field">
          Moves by
          <select
            class="inp"
            aria-label="Moves by"
            data-tour="skeleton-move"
            value={own.move}
            onChange={(e) =>
              put({ ...own, move: (e.target as HTMLSelectElement).value as BodyPlan['move'] }, 'Move kind')
            }
          >
            {MOVE_KINDS.map((m) => (
              <option value={m} title={MOVE_INFO[m]}>
                {m[0]!.toUpperCase() + m.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <NumField
          label="Stride"
          value={own.stride}
          lo={0.3}
          hi={12}
          step={0.1}
          onCommit={(v) => put({ ...own, stride: v }, 'Stride')}
        />
        <NumField
          label="Hover"
          value={own.hover}
          lo={0}
          hi={8}
          step={0.1}
          onCommit={(v) => put({ ...own, hover: v }, 'Hover')}
        />
      </div>
      <div class="bone-list" role="listbox" aria-label="Bones">
        {own.bones.map((b) => {
          let depth = 0;
          for (let p = b.parent; p && depth < 12; depth++) p = own.bones.find((x) => x.name === p)?.parent;
          return (
            <button
              type="button"
              role="option"
              aria-selected={b.name === sel.name}
              class={`bone-row ${b.name === sel.name ? 'on' : ''}`}
              style={{ paddingLeft: `${6 + depth * 12}px` }}
              data-name={b.name}
              onClick={() => (ed.bodyBone.value = b.name)}
            >
              {b.name} <span class="muted small">{b.role}</span>
            </button>
          );
        })}
      </div>
      <div class="row" style={{ gap: '6px' }}>
        <button
          type="button"
          class="btn"
          data-tour="skeleton-add"
          disabled={own.bones.length >= 48}
          onClick={() => {
            let n = own.bones.length + 1;
            while (own.bones.some((b) => b.name === `bone ${n}`)) n++;
            const name = `bone ${n}`;
            if (
              put(
                {
                  ...own,
                  bones: [...own.bones, { name, parent: sel.name, at: [0, 1.2, 0], role: 'other', swing: 20 }],
                },
                `Add ${name}`,
              )
            )
              ed.bodyBone.value = name;
          }}
        >
          + Bone on {sel.name}
        </button>
        <button
          type="button"
          class="btn danger"
          data-tour="skeleton-remove"
          disabled={isRoot}
          title={isRoot ? 'The root bone holds the others' : 'Its bones and bricks move to its parent'}
          onClick={() => {
            const parent = sel.parent!;
            const offset = sel.at;
            const plan: BodyPlan = {
              ...own,
              bones: own.bones
                .filter((b) => b.name !== sel.name)
                .map((b) =>
                  b.parent === sel.name
                    ? {
                        ...b,
                        parent,
                        at: [
                          coordOk(b.at[0] + offset[0]),
                          coordOk(b.at[1] + offset[1]),
                          coordOk(b.at[2] + offset[2]),
                        ] as Bone['at'],
                      }
                    : b,
                ),
              bricks: own.bricks.map((k) =>
                k.bone === sel.name
                  ? { ...k, bone: parent, x: k.x + offset[0], y: k.y + offset[1] / 0.4, z: k.z + offset[2] }
                  : k,
              ),
            };
            if (put(plan, `Remove ${sel.name}`)) ed.bodyBone.value = parent;
          }}
        >
          Remove
        </button>
      </div>
      <div class="bone-edit" data-tour="skeleton-bone" aria-label={`Bone ${sel.name}`} role="group">
        <label class="field">
          Bone name
          <input
            class="inp"
            aria-label="Bone name"
            value={sel.name}
            onChange={(e) => {
              const name = (e.target as HTMLInputElement).value.trim();
              if (/^[A-Za-z][A-Za-z0-9 _-]{0,23}$/.test(name)) setBone({ ...sel, name }, 'Rename bone');
              else ed.notify('A bone name starts with a letter: letters, digits, spaces, _ and -.', true);
            }}
          />
        </label>
        {!isRoot && (
          <label class="field">
            Hangs from
            <select
              class="inp"
              aria-label="Hangs from"
              value={sel.parent}
              onChange={(e) => setBone({ ...sel, parent: (e.target as HTMLSelectElement).value }, 'Bone parent')}
            >
              {own.bones
                .filter((b) => b.name !== sel.name)
                .map((b) => (
                  <option value={b.name}>{b.name}</option>
                ))}
            </select>
          </label>
        )}
        <label class="field">
          Role
          <select
            class="inp"
            aria-label="Role"
            data-tour="skeleton-role"
            value={sel.role}
            onChange={(e) =>
              setBone({ ...sel, role: (e.target as HTMLSelectElement).value as Bone['role'] }, 'Bone role')
            }
          >
            {BONE_ROLES.map((r) => (
              <option value={r} title={ROLE_INFO[r]}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <p class="muted small">{ROLE_INFO[sel.role]}.</p>
        <div class="grid3">
          {(['x', 'y', 'z'] as const).map((k, i) => (
            <NumField
              label={`Joint ${k}`}
              value={sel.at[i]!}
              lo={-30}
              hi={30}
              step={0.1}
              onCommit={(v) => {
                const at = [...sel.at] as Bone['at'];
                at[i] = v;
                setBone({ ...sel, at }, `Move ${sel.name}`);
              }}
            />
          ))}
        </div>
        <div class="grid3">
          <NumField
            label="Swing°"
            value={sel.swing}
            lo={0}
            hi={90}
            onCommit={(v) => setBone({ ...sel, swing: v }, 'Bone swing')}
          />
          <NumField
            label="Phase"
            value={sel.phase ?? 0}
            lo={0}
            hi={1}
            step={0.05}
            onCommit={(v) => setBone({ ...sel, phase: v }, 'Bone phase')}
          />
          <label class="field">
            Side
            <select
              class="inp"
              aria-label="Side"
              value={String(sel.side ?? 0)}
              onChange={(e) => {
                const v = Number((e.target as HTMLSelectElement).value) as -1 | 0 | 1;
                const { side: _s, ...rest } = sel;
                setBone(v ? { ...rest, side: v } : rest, 'Bone side');
              }}
            >
              <option value="-1">Left</option>
              <option value="0">Middle</option>
              <option value="1">Right</option>
            </select>
          </label>
        </div>
      </div>
      <div class="sech" style={{ marginTop: '8px' }}>
        <span>Bricks on {sel.name}</span>
      </div>
      {bricks.map(([k, i]) => (
        <div class="brick-row row" role="group" aria-label={`Brick ${i + 1}`}>
          <select
            class="inp"
            aria-label="Brick kind"
            value={k.kind}
            onChange={(e) =>
              setBrick(i, { ...k, kind: (e.target as HTMLSelectElement).value as BodyBrick['kind'] }, 'Brick kind')
            }
          >
            <option value="brick">Brick</option>
            <option value="plate">Plate</option>
            <option value="tile">Tile</option>
          </select>
          {(['w', 'd'] as const).map((f) => (
            <input
              class="inp mono"
              type="number"
              aria-label={f === 'w' ? 'Brick width' : 'Brick depth'}
              min={1}
              max={8}
              value={k[f]}
              onChange={(e) => {
                const v = Math.max(1, Math.min(8, Math.round(Number((e.target as HTMLInputElement).value) || 1)));
                setBrick(i, { ...k, [f]: v }, 'Brick size');
              }}
            />
          ))}
          {(['x', 'y', 'z'] as const).map((f) => (
            <input
              class="inp mono"
              type="number"
              step={f === 'y' ? 1 : 0.5}
              aria-label={`Brick ${f}`}
              value={k[f]}
              onChange={(e) => {
                const n = Number((e.target as HTMLInputElement).value);
                if (Number.isFinite(n))
                  setBrick(i, { ...k, [f]: f === 'y' ? Math.max(-75, Math.min(75, n)) : coordOk(n) }, 'Move brick');
              }}
            />
          ))}
          <select
            class="inp"
            aria-label="Brick colour"
            value={k.color.startsWith('#') ? 'own' : k.color}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              setBrick(i, { ...k, color: v === 'own' ? '#ffffff' : (v as BodyBrick['color']) }, 'Brick colour');
            }}
          >
            {(['main', 'accent', 'belly', 'eye', 'dark'] as const).map((s) => (
              <option value={s}>{s}</option>
            ))}
            <option value="own">its own…</option>
          </select>
          <button
            type="button"
            class="link danger"
            aria-label={`Remove brick ${i + 1}`}
            onClick={() => setBrick(i, null, 'Remove brick')}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        class="btn"
        data-tour="skeleton-brick"
        disabled={own.bricks.length >= 400}
        onClick={() =>
          put(
            {
              ...own,
              bricks: [
                ...own.bricks,
                { bone: sel.name, w: 1, d: 1, kind: 'brick', x: -0.5, y: 0, z: -0.5, color: 'main' },
              ],
            },
            `Brick on ${sel.name}`,
          )
        }
      >
        + Brick on {sel.name}
      </button>
      <div class="row" style={{ marginTop: '8px' }}>
        <button
          type="button"
          class="link"
          title="Go back to a family made from sliders (this body plan stays in the game)"
          onClick={() => {
            const { plan: _p, ...keep } = body;
            setBody(
              { ...keep, family: (FAMILY_INFO[own.family as BodyFamily] ? own.family : 'fourLegs') as BodyFamily },
              'Body: back to the family',
            );
          }}
        >
          Use the {FAMILY_INFO[own.family as BodyFamily]?.label ?? 'Four legs'} sliders again
        </button>
      </div>
    </div>
  );
}
