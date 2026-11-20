/* Verdance — a small template runtime: renders the <template> markup, binds {{holes}}, sc-for / sc-if, refs and events. */
class DCLogic {
  constructor() { this.props = {}; }
  setState(o) { this.state = Object.assign({}, this.state, o); if (window.__patch) window.__patch(); }
  forceUpdate() { if (window.__patch) window.__patch(); }
}

(function () {
  let V = {};
  const bindings = [];
  const HOLE = /\{\{([^}]*)\}\}/g;

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d/.test(path)) return +path;
    const parts = path.split('.');
    let v = scope(parts[0]);
    for (let i = 1; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function interp(tpl, scope) {
    return tpl.replace(HOLE, (_, p) => { const v = lookup(p, scope); return v == null ? '' : String(v); });
  }
  const baseScope = (name) => V[name];

  function render(node, scope, parent, before) {
    const put = (n) => (before ? parent.insertBefore(n, before) : parent.appendChild(n));
    if (node.nodeType === 3) {
      const t = node.data;
      if (!t.trim() && node.parentNode && /^sc-/.test(node.parentNode.localName || '')) return [];
      const tn = document.createTextNode(t.includes('{{') ? interp(t, scope) : t);
      if (t.includes('{{')) bindings.push({ type: 'text', node: tn, tpl: t, scope, last: tn.data });
      put(tn); return [tn];
    }
    if (node.nodeType !== 1) return [];
    const tag = node.localName;
    if (tag === 'sc-for') {
      const m = /\{\{([^}]*)\}\}/.exec(node.getAttribute('list'));
      const listExpr = m[1], as = node.getAttribute('as');
      const list = lookup(listExpr, scope) || [];
      const out = [];
      list.forEach((_, i) => {
        const s = (name) => (name === as ? (lookup(listExpr, scope) || [])[i] : name === '$index' ? i : scope(name));
        node.childNodes.forEach((c) => out.push(...render(c, s, parent, before)));
      });
      return out;
    }
    if (tag === 'sc-if') {
      const marker = document.createComment('if');
      put(marker);
      const b = { type: 'if', marker, expr: /\{\{([^}]*)\}\}/.exec(node.getAttribute('value'))[1], scope, tpl: node, nodes: [], on: false };
      bindings.push(b);
      updateIf(b);
      return [marker];
    }
    const el = document.createElementNS(node.namespaceURI, tag);
    for (const a of Array.from(node.attributes)) {
      const name = a.name, val = a.value;
      if (name.startsWith('hint-')) continue;
      const whole = /^\{\{([^}]*)\}\}$/.exec(val.trim());
      if (name === 'ref' && whole) { const fn = lookup(whole[1], scope); if (typeof fn === 'function') fn(el); continue; }
      if (name.startsWith('on') && whole) {
        const ev = name.slice(2).toLowerCase();
        el.addEventListener(ev, (e) => { const fn = lookup(whole[1], scope); if (typeof fn === 'function') fn(e); });
        continue;
      }
      if (val.includes('{{')) {
        const v = interp(val, scope);
        el.setAttribute(name, v);
        bindings.push({ type: 'attr', el, name, tpl: val, scope, last: v });
      } else el.setAttribute(name, val);
    }
    node.childNodes.forEach((c) => render(c, scope, el));
    put(el);
    return [el];
  }
  function updateIf(b) {
    const on = !!lookup(b.expr, b.scope);
    if (on === b.on) return;
    b.on = on;
    if (on) {
      const next = b.marker.nextSibling;
      b.tpl.childNodes.forEach((c) => b.nodes.push(...render(c, b.scope, b.marker.parentNode, next)));
    } else { b.nodes.forEach((n) => n.remove()); b.nodes = []; }
  }

  window.__mount = function (inst, tplEl, root) {
    window.__inst = inst;
    V = inst.renderVals();
    tplEl.content.childNodes.forEach((c) => render(c, baseScope, root));
    window.__patch = function () {
      V = inst.renderVals();
      for (const b of bindings.slice()) {
        if (b.type === 'text') { const v = interp(b.tpl, b.scope); if (v !== b.last) { b.node.data = v; b.last = v; } }
        else if (b.type === 'attr') { const v = interp(b.tpl, b.scope); if (v !== b.last) { b.el.setAttribute(b.name, v); b.last = v; } }
        else if (b.type === 'if') updateIf(b);
      }
    };
    inst.componentDidMount && inst.componentDidMount();
  };
})();
