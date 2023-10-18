if (typeof process !== 'undefined') {
  global.HTMLElement = function() { return {} };
  global.customElements = { define: function() { } };
  global.Worker = function() { return { postMessage: function() { } } };
}

class BaseElement extends HTMLElement {
  constructor() {
    super();
    this.store = {};
    this.context = {};
    this.instanceID = this.getAttribute('id') ||
      self.crypto.randomUUID();
  }

  get state() {
    const attrs = this.attributes.length
      ? this.attrsToObject(this.attributes)
      : {};

    return {
      attrs,
      context: this.context,
      instanceID: this.instanceID,
      store: this.store
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      const fun = `${name}Changed`;
      if (this[fun]) {
        this[fun](newValue);
      }
    }
  }

  attrsToObject(attrs = []) {
    const attrsObj = {};
    for (let d = attrs.length - 1; d >= 0; d--) {
      let attr = attrs[d];
      attrsObj[attr.nodeName] = attr.nodeValue;
    }
    return attrsObj
  }

  html(strings, ...values) {
    return String.raw({ raw: strings }, ...values)
  }
}

const TemplateMixin = (superclass) => class extends superclass {
  constructor() {
    super();
    if (!this.render || !this.html) {
      throw new Error('TemplateMixin must extend Enhance BaseElement')
    }
    const templateName = `${this.tagName.toLowerCase()}-template`;
    const template = document.getElementById(templateName);
    const html = this.html;
    const state = {};
    if (template) {
      this.template = template;
    }
    else {
      this.template = document.createElement('template');
      this.template.innerHTML = this.render({ html, state });
      this.template.setAttribute('id', templateName);
      document.body.appendChild(this.template);
    }
  }
};

// Mixin specifically for reusing SFCs as Custom Elements in the browser
const CustomElementMixin = (superclass) => class extends superclass {
  constructor() {
    super();

    // Has this element been server side rendered
    const enhanced = this.hasAttribute('enhanced');

    // Handle style tags
    if (enhanced) {
      // Removes style tags as they are already inserted into the head by SSR
      this.template.content.querySelectorAll('style')
        .forEach((tag) => { this.template.content.removeChild(tag); });
    } else {
      let tagName = customElements.getName ? customElements.getName(this.constructor) : this.toKebabCase(this.constructor.name);
      this.template.content.querySelectorAll('style')
        .forEach((tag) => {
          let sheet = this.styleTransform({ tag, tagName, scope: tag.getAttribute('scope') });
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
          this.template.content.removeChild(tag);
        });
    }

    // Removes script tags as they are already appended to the body by SSR
    // TODO: If only added dynamically in the browser we need to insert the script tag after running the script transform on it. As well as handle deduplication.
    this.template.content.querySelectorAll('script')
      .forEach((tag) => { this.template.content.removeChild(tag); });

    // Expands the Custom Element with the template content
    const hasSlots = this.template.content.querySelectorAll('slot')?.length;

    // If the Custom Element was already expanded by SSR it will have the "enhanced" attribute so do not replaceChildren
    // If this Custom Element was added dynamically with JavaScript then use the template contents to expand the element
    if (!enhanced && !hasSlots) {
      this.replaceChildren(this.template.content.cloneNode(true));
    } else if (!enhanced && hasSlots) {
      this.innerHTML = this.expandSlots(this);
    }
  }

  toKebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()
  }

  styleTransform({ tag, tagName, scope }) {
    const styles = this.parseCSS(tag.textContent);

    if (scope === 'global') {
      return styles
    }

    const rules = styles.cssRules;
    const sheet = new CSSStyleSheet();
    for (let rule of rules) {
      if (rule.conditionText) {
        let selectorText = '';
        for (let innerRule of rule.cssRules) {
          let selectors = innerRule.selectorText.split(',');
          selectorText = selectors.map(selector => {
            return innerRule.cssText.replace(innerRule.selectorText, this.#transform(selector, tagName))
          }).join(',');
        }
        let type = null;
        if (rule instanceof CSSContainerRule) {
          type = '@container';
        } else if (rule instanceof CSSMediaRule) {
          type = '@media';
        } else if (rule instanceof CSSSupportsRule) {
          type = '@supports';
        }
        sheet.insertRule(`${type} ${rule.conditionText} { ${selectorText}}`, sheet.cssRules.length);
      } else {
        let selectors = rule.selectorText.split(',');
        let selectorText = selectors.map(selector => {
          return this.#transform(selector, tagName)
        }).join(',');
        sheet.insertRule(rule.cssText.replace(rule.selectorText, selectorText), sheet.cssRules.length);
      }
    }
    return sheet
  }

  #transform(input, tagName) {
    let out = input;
    out = out.replace(/(::slotted)\(\s*(.+)\s*\)/, '$2')
      .replace(/(:host-context)\(\s*(.+)\s*\)/, '$2 __TAGNAME__')
      .replace(/(:host)\(\s*(.+)\s*\)/, '__TAGNAME__$2')
      .replace(
        /([[a-zA-Z0-9_-]*)(::part)\(\s*(.+)\s*\)/,
        '$1 [part*="$3"][part*="$1"]')
      .replace(':host', '__TAGNAME__');
    out = /__TAGNAME__/.test(out) ? out.replace(/(.*)__TAGNAME__(.*)/, `$1${tagName}$2`) : `${tagName} ${out}`;
    return out
  }

  parseCSS(styleContent) {
    const doc = document.implementation.createHTMLDocument("");
    const styleElement = document.createElement("style");

    styleElement.textContent = styleContent;
    doc.body.appendChild(styleElement);

    return styleElement.sheet
  }


  expandSlots(here) {
    const fragment = document.createElement('div');
    fragment.innerHTML = here.innerHTML;
    fragment.attachShadow({ mode: 'open' }).appendChild(
      here.template.content.cloneNode(true)
    );

    const children = Array.from(fragment.childNodes);
    let unnamedSlot = {};
    let namedSlots = {};

    children.forEach(child => {
      const slot = child.assignedSlot;
      if (slot) {
        if (slot.name) {
          if (!namedSlots[slot.name]) namedSlots[slot.name] = { slotNode: slot, contentToSlot: [] };
          namedSlots[slot.name].contentToSlot.push(child);
        } else {
          if (!unnamedSlot["slotNode"]) unnamedSlot = { slotNode: slot, contentToSlot: [] };
          unnamedSlot.contentToSlot.push(child);
        }
      }
    });

    // Named Slots
    Object.entries(namedSlots).forEach(([name, slot]) => {
      slot.slotNode.after(...namedSlots[name].contentToSlot);
      slot.slotNode.remove();
    });

    // Unnamed Slot
    unnamedSlot.slotNode?.after(...unnamedSlot.contentToSlot);
    unnamedSlot.slotNode?.remove();

    // Unused slots and default content
    const unfilledUnnamedSlots = Array.from(fragment.shadowRoot.querySelectorAll('slot:not([name])'));
    unfilledUnnamedSlots.forEach(slot => slot.remove());
    const unfilledSlots = Array.from(fragment.shadowRoot.querySelectorAll('slot[name]'));
    unfilledSlots.forEach(slot => {
      const as = slot.getAttribute('as') || 'span';
      const asElement = document.createElement(as);
      while (slot.childNodes.length > 0) {
        asElement.appendChild(slot.childNodes[0]);
      }
      slot.after(asElement);
      slot.remove();
    });

    return fragment.shadowRoot.innerHTML
  }

};

class CustomElement extends CustomElementMixin(TemplateMixin(BaseElement)) {}

const _state = {};
const dirtyProps = [];
const listeners = [];
const inWindow = typeof window != 'undefined';
const set = inWindow
  ? window.requestAnimationFrame
  : setTimeout;
const cancel = inWindow
  ? window.cancelAnimationFrame
  : clearTimeout;
let timeout;
const handler = {
  set: function (obj, prop, value) {
    if (prop === 'initialize' ||
        prop === 'subscribe' ||
        prop === 'unsubscribe') {
      return false
    }
    let oldValue = obj[prop];
    if (oldValue !== value) {
      obj[prop] = value;
      dirtyProps.push(prop);
      timeout && cancel(timeout);
      timeout = set(notify);
    }

    return true
  }
};

_state.initialize = initialize$1;
_state.subscribe = subscribe;
_state.unsubscribe = unsubscribe;
const store$1 = new Proxy(_state, handler);

function Store(initialState) {
  if (initialState) {
    initialize$1(initialState);
  }
  return store$1
}

function merge (o, n) {
  for (let prop in n) {
    o[prop] = n[prop];
  }
}

/**
 * Function for initializing store with existing data
 * @param {object} initialState - object to be merged with internal state
 */
function initialize$1(initialState) {
  if (initialState) {
    merge(_state, initialState);
  }
}

/**
 * Function for subscribing to state updates.
 * @param {function} fn - function to be called when state changes
 * @param {array} props - list props to listen to for changes
 * @return {number} returns current number of listeners
 */
function subscribe(fn, props=[]) {
  return listeners.push({ fn, props })
}

/**
 * Function for unsubscribing from state updates.
 * @param {function} fn - function to unsubscribe from state updates
 *
 */
function unsubscribe(fn) {
  return listeners.splice(listeners.findIndex(l => l.fn === fn), 1)
}

function notify() {
  listeners.forEach(l => {
    const fn = l.fn;
    const props = l.props;
    const payload = props.length
      ? dirtyProps
        .filter(key => props.includes(key))
        .reduce((obj, key) => {
          return {
            ...obj,
            [key]: _state[key]
          }
        }, {})
      : { ..._state };
    fn(payload);
  });
  dirtyProps.length = 0;
}

/* global window, Worker */
const store = Store();

const CREATE  = 'create';
const UPDATE  = 'update';
const DESTROY = 'destroy';
const LIST    = 'list';

let worker;
function API() {
  if (!worker) {
    worker = new Worker('./_public/browser/worker.mjs');
    worker.onmessage = mutate;
  }

  initialize();

  return {
    create,
    update,
    destroy,
    list,
    store,
    subscribe: store.subscribe,
    unsubscribe: store.unsubscribe
  }
}

function initialize() {
  list();
}

function mutate(e) {
  const { data } = e;
  const { result, type } = data;
  switch (type) {
  case CREATE:
    createMutation(result);
    break
  case UPDATE:
    updateMutation(result);
    break
  case DESTROY:
    destroyMutation(result);
    break
  case LIST:
    listMutation(result);
    break
  }
}

function createMutation({ todo={}, problems={} }) {
  const copy = store?.todos?.slice() || [];
  copy.push(todo);
  store.todos = copy;
  store.problems = problems;
}

function updateMutation({ todo={}, problems={} }) {
  const copy = store?.todos?.slice() || [];
  copy.splice(copy.findIndex(i => i.key === todo.key), 1, todo);
  store.todos = copy;
  store.problems = problems;
}

function destroyMutation({ todo={}, problems={} }) {
  let copy = store?.todos?.slice() || [];
  copy.splice(copy.findIndex(i => i.key === todo.key), 1);
  store.todos = copy;
  store.problems = problems;
}

function listMutation({ todos=[], problems={} }) {
  store.initialize({ todos, problems });
}

function processForm(form) {
  return JSON.stringify(
    Object.fromEntries(
      new FormData(form)
    )
  )
}

function create(form) {
  const todo = processForm(form);
  worker.postMessage({
    type: CREATE,
    data: todo
  });
}

function destroy (form) {
  const todo = processForm(form);
  worker.postMessage({
    type: DESTROY,
    data: todo
  });
}

function list () {
  worker.postMessage({
    type: LIST
  });
}

function update (form) {
  const todo = processForm(form);
  worker.postMessage({
    type: UPDATE,
    data: todo
  });
}

/* globals customElements */
const api = API();

class TodosFormCreate extends CustomElement {
  constructor() {
    super();
    this.api = api;
    this.submit = this.submit.bind(this);
    this.resetForm = this.resetForm.bind(this);
    this.addEventListener('submit', this.submit);
    this.form = this.querySelector('form');
    this.textInput = this.querySelector('input[type="text"]');
  }

  render({ html }) {
    const borderClasses = `
border1
border-solid
border-current
radius0
overflow-hidden
`;

    return html`
<fieldset
  class="
   grid
   gap0
   border-none
 "
>
  <legend class="text2 mb1">
    Todos
  </legend>
  <form
    action="/todos"
    class="
     grid
     gap-1
    "
    method="POST"
  >
    <div
      class="
        flex
        flex-col
      "
    >
      <label
        style="color:white"
        class="mb-4"
        for="title"
      >
        Title
      </label>
      <input
        class="
         flex-grow
         p-4
         text1
         ${borderClasses}
        "
        name="title"
        type="text"
        placeholder="Add a title ⏎"
        autofocus
        required
      >
    </div>
<!--
    <footer class="text-right">
      <button
       class="
        pt-1
        pr2
        pb-1
        pl2
        font-bold
        btn-primary
        ${borderClasses}
       "
      >
        Save
      </button>
    </footer>
      -->

  </form>

</fieldset>
  `
  }

  connectedCallback() {
    this.textInput.focus();
  }

  resetForm() {
    this.textInput.value = '';
    this.textInput.focus();
  }

  submit(e) {
    e.preventDefault();
    this.api.create(this.form);
    this.resetForm();
  }
}

const render = TodosFormCreate.prototype.render;

customElements.define('todos-form-create', TodosFormCreate );

export { TodosFormCreate as default, render };
