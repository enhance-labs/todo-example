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

/* globals customElements */

class LayoutContainer extends CustomElement {
  constructor() {
    super();
  }

  render({ html, state }) {
    return html`
    <style>
      :host {
        display: block;
        margin: 0 auto;
        min-width: 15rem;
        max-width: 50rem;
      }

      .btn-primary {
        background-color: var(--primary-500);
      }
      .btn-primary:hover {
        background-color: var(--primary-400);
      }
      .btn-primary:active {
        background-color: var(--primary-600);
      }
      .btn-primary,
      .clr-light {
        color: var(--light);
      }
    </style>
    <section>
      <slot></slot>
    </section>
    `
  }

}

const render = LayoutContainer.prototype.render;

customElements.define('layout-container', LayoutContainer);

export { LayoutContainer as default, render };
