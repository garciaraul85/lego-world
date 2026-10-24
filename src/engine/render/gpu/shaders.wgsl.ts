/**
 * Milestone 2b, 10c: the WebGPU renderer's shaders (WGSL), translated from the WebGL ones in ../shaders.ts so a
 * scene looks the same drawn either way: v68's brick shading, up to 8 point lights, darkness, fog and ground fog,
 * the floor grid, the sky.
 */

const FRAME = /* wgsl */ `
struct Frame {
  mvp: mat4x4f,
  eye: vec4f,
  light: vec4f,
  ambient: vec4f,
  fog: vec4f,
  fogRange: vec4f,
  misc: vec4f,
  pl: array<vec4f, 8>,
  pc: array<vec4f, 8>,
  // part 3: the shadow-casting lights (the first of pl): where and how far; misc2.x how many
  // part 4: misc2.y 1 while drawing the reflection under water (misc2.z the water's surface: nothing below it)
  shadowAt: array<vec4f, 4>,
  misc2: vec4f,
};
@group(0) @binding(1) var shadow0: texture_cube<f32>;
@group(0) @binding(2) var shadow1: texture_cube<f32>;
@group(0) @binding(3) var shadow2: texture_cube<f32>;
@group(0) @binding(4) var shadow3: texture_cube<f32>;
@group(0) @binding(5) var shadowSamp: sampler;
fn shadowIn(e: vec4f, d: vec3f, at: vec4f) -> f32 {
  let stored = (e.r + e.g / 255.0) * at.w;
  return select(1.0, 0.0, length(d) - 0.12 > stored);
}
// a point's shadow from light i (1: lit, 0: in shadow), as the WebGL shader works it out
fn shadowAt(i: i32, p: vec3f, n: vec3f) -> f32 {
  let q = p + n * 0.05;
  let at = F.shadowAt[i];
  let d = q - at.xyz;
  switch i {
    case 0: { return shadowIn(textureSampleLevel(shadow0, shadowSamp, d, 0.0), d, at); }
    case 1: { return shadowIn(textureSampleLevel(shadow1, shadowSamp, d, 0.0), d, at); }
    case 2: { return shadowIn(textureSampleLevel(shadow2, shadowSamp, d, 0.0), d, at); }
    case 3: { return shadowIn(textureSampleLevel(shadow3, shadowSamp, d, 0.0), d, at); }
    default: { return 1.0; }
  }
}
struct Draw {
  model: mat4x4f,
  flags: vec4f,
  color: vec4f,
};
@group(0) @binding(0) var<uniform> F: Frame;
@group(1) @binding(0) var<uniform> D: Draw;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) normal: vec3f,
  @location(1) world: vec3f,
  @location(2) color: vec3f,
};

// GL's clip space has z from -1 to 1; WebGPU's from 0 to 1
fn clip(p: vec3f) -> vec4f {
  var c = F.mvp * vec4f(p, 1.0);
  c.z = (c.z + c.w) * 0.5;
  return c;
}
`;

export const BRICK_WGSL = /* wgsl */ `${FRAME}
@vertex fn vs(@location(0) pos: vec3f, @location(1) normal: vec3f, @location(2) offset: vec3f, @location(3) color: vec3f) -> VOut {
  var o: VOut;
  let m = mat3x3f(D.model[0].xyz, D.model[1].xyz, D.model[2].xyz);
  o.normal = m * normal;
  o.world = (D.model * vec4f(pos + offset, 1.0)).xyz;
  o.color = color;
  o.pos = clip(o.world);
  return o;
}

@vertex fn vsLine(@location(0) pos: vec3f) -> VOut {
  var o: VOut;
  o.normal = vec3f(0.0, 1.0, 0.0);
  o.world = pos;
  o.color = D.color.rgb;
  o.pos = clip(pos);
  return o;
}

fn pointLights(n: vec3f, p: vec3f) -> vec3f {
  var sum = vec3f(0.0);
  let count = i32(F.misc.w);
  for (var i = 0; i < 8; i++) {
    if (i >= count) { break; }
    let L = F.pl[i].xyz - p;
    let dist = max(length(L), 0.001);
    var a = clamp(1.0 - dist / F.pl[i].w, 0.0, 1.0);
    a = a * a;
    if (a <= 0.0) { continue; }
    let diff = max(dot(n, L / dist), 0.0) * 0.8 + 0.2;
    var sh = 1.0;
    if (i < i32(F.misc2.x)) { sh = shadowAt(i, p, n); }
    sum += F.pc[i].rgb * a * diff * sh;
  }
  return sum;
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  // part 4: the reflection shows only what is above the water
  if (F.misc2.y > 0.5 && in.world.y < F.misc2.z - 0.02) { discard; }
  return shade(in);
}

// how a brick (part 5: or a model's part) looks in this frame's light
fn shade(in: VOut) -> vec4f {
  let alpha = D.flags.x;
  if (D.flags.y > 0.5) { return vec4f(in.color, alpha); }
  let snow = F.misc.x;
  let night = F.misc.y;
  let dark = F.misc.z;
  let pav = D.flags.w;
  let n = normalize(in.normal);
  let p = in.world;
  let v = normalize(F.eye.xyz - p);
  let l = normalize(F.light.xyz);
  let l2 = normalize(vec3f(5.0, 2.0, -4.0));
  let d = max(dot(n, l), 0.0);
  let d2 = max(dot(n, l2), 0.0);
  let spec = pow(max(dot(n, normalize(l + v)), 0.0), 65.0);
  let rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  let grain = fract(sin(dot(floor(p.xz * 19.0), vec2f(12.98, 78.23))) * 4375.8);
  let surface = mix(in.color, vec3f(0.075, 0.086, 0.10) + grain * 0.008, pav);
  let snowy = snow * smoothstep(0.55, 0.97, n.y) * 0.95;
  var base = mix(in.color, vec3f(0.93, 0.97, 1.0), snowy);
  if (pav > 0.5) { base = mix(surface, vec3f(0.93, 0.97, 1.0), snowy); }
  let lit = 1.0 - dark * 0.94;
  var c = base * ((F.ambient.rgb + d * mix(0.70, 0.24, night) + d2 * 0.15) * lit + pointLights(n, p))
    + (vec3f(0.9, 0.93, 1.0) * spec * 0.38 * (1.0 - pav) + vec3f(0.14, 0.20, 0.30) * rim * 0.12) * lit;
  let lamp = step(0.7, in.color.r) * step(0.5, in.color.g) * (1.0 - step(0.25, in.color.b));
  c += in.color * lamp * night * 0.6;
  if (D.flags.z > 0.5) {
    let f = fract(p.xz);
    let grid = max(1.0 - smoothstep(0.01, 0.035, min(f.x, 1.0 - f.x)), 1.0 - smoothstep(0.01, 0.035, min(f.y, 1.0 - f.y)));
    c = mix(vec3f(0.08, 0.12, 0.17), vec3f(0.15, 0.21, 0.29), grid);
  }
  let fdist = length(F.eye.xyz - p);
  var fog = smoothstep(F.fogRange.x, F.fogRange.y, fdist) * F.fog.w;
  fog = max(fog, F.fogRange.w * (1.0 - smoothstep(F.fogRange.z - 1.5, F.fogRange.z + 0.5, p.y)) * smoothstep(1.0, 12.0, fdist));
  c = mix(pow(max(c, vec3f(0.0)), vec3f(0.8)), F.fog.rgb, fog);
  return vec4f(c, alpha);
}
`;

/**
 * part 5: a model's part (an imported glTF mesh), lit as the bricks are: its colour (D.color, w 1 when it has a
 * picture) times its picture
 */
export const MESH_WGSL = /* wgsl */ `${BRICK_WGSL}
@group(2) @binding(0) var tex: texture_2d<f32>;
@group(2) @binding(1) var samp: sampler;
struct MOut { @builtin(position) pos: vec4f, @location(0) normal: vec3f, @location(1) world: vec3f, @location(2) uv: vec2f };
@vertex fn vsMesh(@location(0) pos: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> MOut {
  var o: MOut;
  let m = mat3x3f(D.model[0].xyz, D.model[1].xyz, D.model[2].xyz);
  o.normal = m * normal;
  o.world = (D.model * vec4f(pos, 1.0)).xyz;
  o.uv = uv;
  o.pos = clip(o.world);
  return o;
}
@fragment fn fsMesh(in: MOut) -> @location(0) vec4f {
  let t = textureSample(tex, samp, in.uv);
  if (F.misc2.y > 0.5 && in.world.y < F.misc2.z - 0.02) { discard; }
  var v: VOut;
  v.pos = in.pos;
  v.normal = in.normal;
  v.world = in.world;
  v.color = D.color.rgb * mix(vec3f(1.0), t.rgb, D.color.w);
  return shade(v);
}
`;

export const SKY_WGSL = /* wgsl */ `
struct Sky {
  zenith: vec4f,
  horizon: vec4f,
  right: vec4f,
  up: vec4f,
  forward: vec4f,
  sun: vec4f,
  moon: vec4f,
  // night, overcast, time, aspect
  a: vec4f,
  // tanHalfFov, seed, studio, dark
  b: vec4f,
};
@group(0) @binding(0) var<uniform> S: Sky;
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var q = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  var o: VOut;
  o.pos = vec4f(q[i], 0.999, 1.0);
  // WebGPU's framebuffer y runs down: the sky's uv is GL's (y up)
  o.uv = q[i] * 0.5 + 0.5;
  return o;
}
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7)) + S.b.y) * 43758.5453); }
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let uv = in.uv;
  let night = S.a.x;
  let overcast = S.a.y;
  let time = S.a.z;
  let aspect = S.a.w;
  let tanHalf = S.b.x;
  if (S.b.z > 0.5) { return vec4f(mix(S.horizon.rgb, S.zenith.rgb, smoothstep(0.0, 1.0, uv.y)), 1.0); }
  let ndc = uv * 2.0 - 1.0;
  let ray = normalize(S.forward.xyz + S.right.xyz * ndc.x * aspect * tanHalf + S.up.xyz * ndc.y * tanHalf);
  var c = mix(S.horizon.rgb, S.zenith.rgb, smoothstep(0.0, 0.85, ray.y));
  let sphere = vec2f(atan2(ray.z, ray.x) / 6.283185 + 0.5, asin(clamp(ray.y, -1.0, 1.0)) / 3.141593 + 0.5);
  let stars = step(0.991, hash(floor(sphere * vec2f(280.0, 160.0)))) * night * (1.0 - overcast) * smoothstep(0.05, 0.30, ray.y);
  c += vec3f(stars * 0.65);
  let sunD = normalize(S.sun.xyz);
  let moonD = normalize(S.moon.xyz);
  let sunDistance = length(ray - sunD);
  let moonDistance = length(ray - moonD);
  let sunDisk = (1.0 - smoothstep(0.034, 0.038, sunDistance)) * smoothstep(-0.025, 0.025, S.sun.y);
  let moonDisk = (1.0 - smoothstep(0.029, 0.033, moonDistance)) * smoothstep(-0.025, 0.025, S.moon.y);
  let sunColor = mix(vec3f(1.0, 0.45, 0.20), vec3f(1.0, 0.89, 0.60), smoothstep(0.05, 0.40, S.sun.y));
  c = mix(c, sunColor, sunDisk * (1.0 - overcast * 0.85));
  c = mix(c, vec3f(0.87, 0.94, 1.0), moonDisk * (1.0 - overcast * 0.85));
  c += sunColor * exp(-sunDistance * sunDistance * 160.0) * 0.12 * (1.0 - night) * (1.0 - overcast);
  let cell = floor(vec2f(fract(sphere.x + time * 0.00005), sphere.y) * vec2f(92.0, 48.0));
  let cloud = step(0.61 - overcast * 0.28, hash(vec2f(floor(cell.x / 4.0), floor(cell.y / 2.0)))) * step(0.2, hash(cell))
    * smoothstep(0.10, 0.22, ray.y) * (1.0 - smoothstep(0.75, 0.98, ray.y));
  let cloudColor = mix(vec3f(0.95, 0.97, 1.0), vec3f(0.16, 0.20, 0.31), night);
  c = mix(c, cloudColor, cloud * mix(0.42, 0.73, overcast));
  return vec4f(c * (1.0 - S.b.w * 0.9), 1.0);
}
`;

/**
 * part 2: v68's characters, from the model's own shader (the brick one with printed clothes and faces): each draw
 * brings its own view (a clip pose is placed by its matrix), eye, sky light and ambient; the frame brings the fog,
 * the point lights and the darkness.
 */
export const CHAR_WGSL = /* wgsl */ `
struct Frame {
  mvp: mat4x4f,
  eye: vec4f,
  light: vec4f,
  ambient: vec4f,
  fog: vec4f,
  fogRange: vec4f,
  misc: vec4f,
  pl: array<vec4f, 8>,
  pc: array<vec4f, 8>,
  // part 3: the shadow-casting lights (the first of pl): where and how far; misc2.x how many
  // part 4: misc2.y 1 while drawing the reflection under water (misc2.z the water's surface: nothing below it)
  shadowAt: array<vec4f, 4>,
  misc2: vec4f,
};
@group(0) @binding(1) var shadow0: texture_cube<f32>;
@group(0) @binding(2) var shadow1: texture_cube<f32>;
@group(0) @binding(3) var shadow2: texture_cube<f32>;
@group(0) @binding(4) var shadow3: texture_cube<f32>;
@group(0) @binding(5) var shadowSamp: sampler;
fn shadowIn(e: vec4f, d: vec3f, at: vec4f) -> f32 {
  let stored = (e.r + e.g / 255.0) * at.w;
  return select(1.0, 0.0, length(d) - 0.12 > stored);
}
// a point's shadow from light i (1: lit, 0: in shadow), as the WebGL shader works it out
fn shadowAt(i: i32, p: vec3f, n: vec3f) -> f32 {
  let q = p + n * 0.05;
  let at = F.shadowAt[i];
  let d = q - at.xyz;
  switch i {
    case 0: { return shadowIn(textureSampleLevel(shadow0, shadowSamp, d, 0.0), d, at); }
    case 1: { return shadowIn(textureSampleLevel(shadow1, shadowSamp, d, 0.0), d, at); }
    case 2: { return shadowIn(textureSampleLevel(shadow2, shadowSamp, d, 0.0), d, at); }
    case 3: { return shadowIn(textureSampleLevel(shadow3, shadowSamp, d, 0.0), d, at); }
    default: { return 1.0; }
  }
}
struct CharDraw {
  model: mat4x4f,
  // alpha, flat, paint, night
  flags: vec4f,
  color: vec4f,
  mvp: mat4x4f,
  eye: vec4f,
  light: vec4f,
  ambient: vec4f,
};
@group(0) @binding(0) var<uniform> F: Frame;
@group(1) @binding(0) var<uniform> D: CharDraw;
@group(2) @binding(0) var tex: texture_2d<f32>;
@group(2) @binding(1) var samp: sampler;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) normal: vec3f,
  @location(1) world: vec3f,
  @location(2) uv: vec2f,
};

@vertex fn vs(@location(0) pos: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> VOut {
  var o: VOut;
  o.world = (D.model * vec4f(pos, 1.0)).xyz;
  o.normal = mat3x3f(D.model[0].xyz, D.model[1].xyz, D.model[2].xyz) * normal;
  o.uv = uv;
  var c = D.mvp * vec4f(o.world, 1.0);
  c.z = (c.z + c.w) * 0.5;
  o.pos = c;
  return o;
}

fn pointLights(n: vec3f, p: vec3f) -> vec3f {
  var sum = vec3f(0.0);
  let count = i32(F.misc.w);
  for (var i = 0; i < 8; i++) {
    if (i >= count) { break; }
    let L = F.pl[i].xyz - p;
    let dist = max(length(L), 0.001);
    var a = clamp(1.0 - dist / F.pl[i].w, 0.0, 1.0);
    a = a * a;
    if (a <= 0.0) { continue; }
    let diff = max(dot(n, L / dist), 0.0) * 0.8 + 0.2;
    var sh = 1.0;
    if (i < i32(F.misc2.x)) { sh = shadowAt(i, p, n); }
    sum += F.pc[i].rgb * a * diff * sh;
  }
  return sum;
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  if (F.misc2.y > 0.5 && in.world.y < F.misc2.z - 0.02) { discard; }
  let alpha = D.flags.x;
  let color = D.color.rgb;
  if (D.flags.y > 0.5) { return vec4f(color, alpha); }
  let paint = D.flags.z;
  let night = D.flags.w;
  let snow = F.misc.x;
  let dark = F.misc.z;
  let n = normalize(in.normal);
  let p = in.world;
  let v = normalize(D.eye.xyz - p);
  let l = normalize(D.light.xyz);
  let l2 = normalize(vec3f(5.0, 2.0, -4.0));
  let d = max(dot(n, l), 0.0);
  let d2 = max(dot(n, l2), 0.0);
  let spec = pow(max(dot(n, normalize(l + v)), 0.0), 48.0);
  let rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  let decal = textureSample(tex, samp, in.uv);
  let material = mix(color, pow(decal.rgb, vec3f(1.5)), decal.a * paint);
  let base = mix(material, vec3f(0.93, 0.97, 1.0), snow * smoothstep(0.55, 0.97, n.y) * 0.95);
  let lit = 1.0 - dark * 0.94;
  var c = base * ((D.ambient.rgb + d * mix(0.70, 0.24, night) + d2 * 0.20) * lit + pointLights(n, p))
    + (vec3f(0.9, 0.93, 1.0) * spec * 0.23 * (1.0 - decal.a * paint * 0.55) + vec3f(0.14, 0.20, 0.30) * rim * 0.12) * lit;
  let lamp = step(0.7, color.r) * step(0.5, color.g) * (1.0 - step(0.25, color.b));
  c += color * lamp * night * 0.6;
  let fdist = length(D.eye.xyz - p);
  var fog = smoothstep(F.fogRange.x, F.fogRange.y, fdist) * F.fog.w;
  fog = max(fog, F.fogRange.w * (1.0 - smoothstep(F.fogRange.z - 1.5, F.fogRange.z + 0.5, p.y)) * smoothstep(1.0, 12.0, fdist));
  c = mix(pow(max(c, vec3f(0.0)), vec3f(0.8)), F.fog.rgb, fog);
  return vec4f(c, alpha);
}
`;

/** part 3: a shadow map face: each brick's (and character's) distance from the light, in two bytes as WebGL keeps it */
export const SHADOW_WGSL = /* wgsl */ `
struct Face { mvp: mat4x4f, at: vec4f, model: mat4x4f };
@group(0) @binding(0) var<uniform> S: Face;
struct VOut { @builtin(position) pos: vec4f, @location(0) world: vec3f };
fn place(world: vec3f) -> VOut {
  var o: VOut;
  o.world = world;
  var c = S.mvp * vec4f(world, 1.0);
  c.z = (c.z + c.w) * 0.5;
  // a texture's first row is its top here (WebGL's is its bottom): drawn upside down, so the map reads the same
  c.y = -c.y;
  o.pos = c;
  return o;
}
@vertex fn vs(@location(0) pos: vec3f, @location(1) normal: vec3f, @location(2) offset: vec3f, @location(3) color: vec3f) -> VOut {
  return place(pos + offset);
}
@vertex fn vsChar(@location(0) pos: vec3f, @location(1) normal: vec3f) -> VOut {
  return place((S.model * vec4f(pos, 1.0)).xyz);
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let t = clamp(length(in.world - S.at.xyz) / S.at.w, 0.0, 1.0) * 255.0;
  return vec4f(floor(t) / 255.0, fract(t), 0.0, 1.0);
}
`;

/**
 * part 4: a water surface. Ripples move with the water's current; the surface mirrors what is above it (WebGPU
 * draws the world upside down under the water first; without that, the sky's colours), more so seen flat on,
 * with the sun glinting on it.
 */
export const WATER_WGSL = /* wgsl */ `${BRICK_WGSL}
struct Water {
  // rgb: the water's colour; a: how see-through
  color: vec4f,
  // xy: current (across, deep); z: time; w: 1 when the reflection picture is for this surface
  flow: vec4f,
  // xy: the picture's size in pixels
  view: vec4f,
  zenith: vec4f,
  horizon: vec4f,
};
@group(2) @binding(0) var<uniform> W: Water;
@group(2) @binding(1) var refl: texture_2d<f32>;
@group(2) @binding(2) var reflSamp: sampler;

struct WOut { @builtin(position) pos: vec4f, @location(0) world: vec3f };
@vertex fn vsWater(@location(0) pos: vec3f) -> WOut {
  var o: WOut;
  o.world = pos;
  o.pos = clip(pos);
  return o;
}

fn ripple(p: vec2f, t: f32, c: vec2f) -> vec3f {
  let q = p - c * t * 0.6;
  let dx = 0.07 * cos(q.x * 1.3 + t * 1.1) + 0.04 * cos((q.x + q.y) * 2.1 + t * 1.7) + 0.02 * cos(q.x * 4.3 - t * 2.3);
  let dz = 0.07 * cos(q.y * 1.5 - t * 0.9) + 0.04 * cos((q.x - q.y) * 1.9 - t * 1.3) + 0.02 * cos(q.y * 3.7 + t * 2.1);
  return normalize(vec3f(-dx, 1.0, -dz));
}

@fragment fn fsWater(in: WOut) -> @location(0) vec4f {
  let p = in.world;
  let t = W.flow.z;
  let n = ripple(p.xz, t, W.flow.xy);
  let v = normalize(F.eye.xyz - p);
  let l = normalize(F.light.xyz);
  let night = F.misc.y;
  let dark = F.misc.z;
  let lit = 1.0 - dark * 0.94;
  let fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  var mirror: vec3f;
  if (W.flow.w > 0.5) {
    let uv = in.pos.xy / W.view.xy + n.xz * 0.03;
    mirror = textureSampleLevel(refl, reflSamp, clamp(uv, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  } else {
    let r = reflect(-v, n);
    mirror = mix(W.horizon.rgb, W.zenith.rgb, smoothstep(0.0, 0.85, r.y)) * (1.0 - dark * 0.9);
  }
  let d = max(dot(n, l), 0.0);
  let base = W.color.rgb * ((F.ambient.rgb + d * mix(0.6, 0.2, night)) * lit + pointLights(n, p));
  let spec = pow(max(dot(n, normalize(l + v)), 0.0), 120.0) * 0.8 * (1.0 - night) * lit;
  var c = mix(base, mirror, clamp(0.25 + fres * 0.75, 0.0, 1.0)) + vec3f(spec);
  let fdist = length(F.eye.xyz - p);
  var fog = smoothstep(F.fogRange.x, F.fogRange.y, fdist) * F.fog.w;
  fog = max(fog, F.fogRange.w * (1.0 - smoothstep(F.fogRange.z - 1.5, F.fogRange.z + 0.5, p.y)) * smoothstep(1.0, 12.0, fdist));
  c = mix(c, F.fog.rgb, fog);
  return vec4f(c, W.color.a);
}
`;
