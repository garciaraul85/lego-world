import sys, json, pathlib
root = pathlib.Path(__file__).parent
head = (root / 'head.txt').read_text()
UNDO = '<button type="button" class="btn ico" aria-label="Undo" onClick="{{undo}}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"></path></svg></button>'

MENU = ('<sc-if value="{{menu.show}}" hint-placeholder-val="{{ false }}"><div class="menu" style="{{menu.style}}">'
        '<span style="padding: 6px 12px 8px; font-size: 12px; font-weight: 700; color: #9ea3ad">{{menu.title}}</span>'
        '<sc-for list="{{menu.items}}" as="i" hint-placeholder-count="4"><button type="button" class="mi" onClick="{{i.run}}">'
        '<span>{{i.label}}</span><span style="color: #9ea3ad; font-size: 12px">{{i.key}}</span></button></sc-for></div></sc-if>')
TOAST = ('<sc-if value="{{toast.show}}" hint-placeholder-val="{{ false }}"><div class="toast">{{toast.text}}'
         '<button type="button" class="btn" style="min-height: 34px" onClick="{{undo}}">Undo</button></div></sc-if>')
# Shared helpers: menu placement, menu/toast vals, toggle/segment styles
HELPERS = r'''
const H = {
  at: (e) => { const r = e.currentTarget.closest('[data-stage]').getBoundingClientRect(); return [Math.min(e.clientX - r.left, r.width - 250), Math.min(e.clientY - r.top, r.height - 260)]; },
  menu: (m, title, items) => (m ? { show: true, title, style: 'left: ' + m.x + 'px; top: ' + m.y + 'px', items } : { show: false, title: '', items: [] }),
  toast: (t) => (t ? { show: true, text: t } : { show: false, text: '' }),
  pick: (on) => 'min-height: 38px; padding: 0 14px; border-radius: 10px; border: none; cursor: pointer; font: 600 14px Figtree, sans-serif; text-align: left; color: ' + (on ? '#141519' : '#f2f2f4') + '; background: ' + (on ? '#ffcc00' : '#24262d'),
  card: (on) => 'display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px; border-radius: 14px; border: none; cursor: pointer; font: 600 14px Figtree, sans-serif; text-align: left; color: #f2f2f4; background: ' + (on ? '#3a3420' : '#24262d') + '; box-shadow: ' + (on ? 'inset 0 0 0 2px #ffcc00' : 'none'),
  track: (on) => 'flex: 0 0 auto; width: 46px; height: 28px; border-radius: 14px; position: relative; background: ' + (on ? '#ffcc00' : '#33363e'),
  knob: (on) => 'position: absolute; top: 3px; left: ' + (on ? 21 : 3) + 'px; width: 22px; height: 22px; border-radius: 50%; background: #fff',
  tab: (on) => (on ? 'ltab lon' : 'ltab'),
  sw: (c, on, size) => 'width: ' + (size || 30) + 'px; height: ' + (size || 30) + 'px; border-radius: 8px; border: none; cursor: pointer; background: ' + c + '; box-shadow: ' + (on ? '0 0 0 3px #141519, 0 0 0 5px #fff' : 'none')
};
'''
TOGGLE = ''

def framed(meta, content):
    close = ' onClick="{{closeMenu}}"' if meta.get('close') else ''
    sub = ('\n    <dc-import name="Sub" group="%s" active="%s" hint-size="900px,46px"></dc-import>' % (meta['group'], meta['sub'])) if meta.get('group') else ''
    right = meta.get('right', '')
    btns = (UNDO if meta.get('undo', True) else '') + '\n      <a class="btn" href="Brix.dc.html">Ask Brix</a>\n      ' + meta.get('primary', '<a class="btn pri" href="Play.dc.html">Play</a>')
    return ('<div style="display: flex; min-height: 900px; background: #141519; color: #f2f2f4; font-family: \'Figtree\', system-ui, sans-serif"%s>\n'
            '  <dc-import name="Nav" active="%s" hint-size="96px,900px"></dc-import>\n'
            '  <main style="flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column">\n'
            '    <header style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 14px 20px">\n'
            '      <div style="display: flex; flex-direction: column"><span style="font-size: 18px; font-weight: 700">%s</span><span style="font-size: 13px; color: #9ea3ad">%s</span></div>\n'
            '      %s\n      <span style="flex: 1 1 auto"></span>\n      %s\n    </header>%s\n'
            '    <div data-stage="1" style="position: relative; display: flex; flex-wrap: wrap; gap: 14px; padding: 0 20px 20px; flex: 1 1 auto">\n%s\n'
            '    </div>\n  </main>\n</div>') % (close, meta['nav'], meta['h'], meta['s'], right, btns, sub, content)

for name in sys.argv[1:]:
    src = (root / 'src' / (name + '.html')).read_text()
    title, rest = src.split('\n', 1)
    if rest.startswith('{'):
        metaline, rest = rest.split('\n', 1)
        markup, script = rest.split('<!--SCRIPT-->', 1)
        markup = framed(json.loads(metaline), markup.rstrip())
    else:
        markup, script = rest.split('<!--SCRIPT-->', 1)
    markup = markup.replace('<!--MENU-->', MENU).replace('<!--TOAST-->', TOAST)
    script = script.replace('/*HELPERS*/', HELPERS)
    out = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + title.strip() +
           '</title>\n<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n' + head + markup.strip() +
           '\n</x-dc>\n<script type="text/x-dc" data-dc-script data-props=\'{"$preview":{"width":1440,"height":900}}\'>\n' +
           script.strip() + '\n</script>\n</body>\n</html>\n')
    (root / 'screens' / (name + '.dc.html')).write_text(out)
    print('built', name)
