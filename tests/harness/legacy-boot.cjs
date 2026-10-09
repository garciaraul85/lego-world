// Boots the assembled LEGO World page in a Node VM with DOM/WebGL stubs.
// Copied from tests/legacy/characters.cjs (the harness every legacy suite uses) and parameterized.
// Used by fixture scripts and TypeScript unit tests; legacy suites keep their own copy.
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert'),
  path = require('node:path');
const DEFAULT_HTML = path.join(__dirname, '../../dist/index.html');
function boot({ html = DEFAULT_HTML, saved = null } = {}) {
  const tools = new Map(),
    stored = new Map(saved ? [['lego-free-build-v1', saved]] : []),
    buffers = [];
  const gl = new Proxy(
    {
      getShaderParameter: () => true,
      getProgramParameter: () => true,
      getAttribLocation: (_, s) => s,
      getUniformLocation: (_, s) => s,
      createBuffer: () => ({}),
      createShader: () => ({}),
      createProgram: () => ({}),
      bufferData: (_, a) => {
        assert(a.length > 0);
        for (const v of a) assert(Number.isFinite(v));
        buffers.push(a.length);
      },
      drawArrays: (_, _start, count) => assert(count > 0),
    },
    { get: (o, k) => (k in o ? o[k] : k.toUpperCase() === k ? 1 : () => {}) },
  );
  const htmlText = fs.readFileSync(html, 'utf8');
  const elements = {};
  let doc;
  class Element {
    constructor(tag = 'DIV') {
      this.tagName = tag;
      this.dataset = {};
      this.value = '';
      this.checked = false;
      this.children = [];
      this.handlers = {};
      this.style = { setProperty() {} };
      this.textContent = '';
      this.hidden = false;
      this.disabled = false;
    }
    addEventListener(e, f) {
      this.handlers[e] = f;
    }
    setAttribute(k, v) {
      this[k] = v;
    }
    removeAttribute(k) {
      delete this[k];
    }
    appendChild(b) {
      this.children.push(b);
    }
    replaceChildren() {
      this.children = [];
    }
    getBoundingClientRect() {
      return { width: 780, height: 570, left: 0, top: 0 };
    }
    focus() {
      doc.activeElement = this;
    }
    select() {}
    click() {
      this.handlers.click?.({ target: this });
    }
    querySelector(s) {
      return this.children.find((c) => c.tagName === s.toUpperCase()) || new Element(s.toUpperCase());
    }
    querySelectorAll() {
      return this.children;
    }
    setPointerCapture() {}
  }
  const ids = [...htmlText.matchAll(/id="([^"]+)"/g)].map((x) => x[1]);
  for (const id of ids) elements[`#${id}`] = new Element();
  elements['#bb-canvas'].tagName = 'CANVAS';
  elements['#bb-canvas'].getContext = () => gl;
  elements['#bb-dialog'].hidden = true;
  elements['#bb-data'].tagName = 'TEXTAREA';
  const buttons = ['add', 'select', 'orbit'].map((name) => {
    const b = new Element('BUTTON');
    b.dataset.tool = name;
    return b;
  });
  const root = {
    dataset: {},
    querySelector: (s) => {
      assert(elements[s], s);
      return elements[s];
    },
    querySelectorAll: (s) => (s === '[data-tool]' ? buttons : []),
    addEventListener: (e, f) => elements['#brick-builder'].addEventListener(e, f),
  };
  doc = {
    addEventListener() {},
    activeElement: null,
    getElementById: () => root,
    createElement: (tag) => new Element(tag.toUpperCase()),
    modelContext: { registerTool: (t) => tools.set(t.name, t) },
  };
  const context = {
    document: doc,
    window: { devicePixelRatio: 1, addEventListener() {}, location: { reload() {} } },
    localStorage: { setItem: (k, v) => stored.set(k, v), getItem: (k) => stored.get(k) },
    ResizeObserver: class {
      observe() {}
    },
    requestAnimationFrame: () => {},
    AbortController,
    console,
    Blob,
    URL,
    setTimeout,
    navigator: {},
  };
  vm.runInNewContext(htmlText.split('<script>')[1].split('</script>')[0], context);
  return {
    tools,
    elements,
    buttons,
    buffers,
    stored,
    read: () => tools.get('read_brick_build').execute(),
    add: (a) => tools.get('place_bricks').execute({ pieces: a }),
    move: (p) => tools.get('move_brick').execute(p),
    fire: (id, event = 'click', value) =>
      elements[`#${id}`].handlers[event]?.({ target: elements[`#${id}`], ...value }),
  };
}

module.exports = { boot, DEFAULT_HTML };
