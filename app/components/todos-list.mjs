/* globals customElements */
import CustomElement from '@enhance-labs/custom-element'
import API from '../browser/api.mjs'
const api = API()

function nodeFromString(str) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(str, "text/html")
  return doc.body.firstElementChild
}

function li(state) {
  const { completed=false, created='', key='', title='' } = state
  return `
        <li
          id="${key}"
          class="flex"
        >
          <todos-item
            class="
             flex
             flex-grow
            "
            completed="${completed}"
            created="${created}"
            key="${key}"
            title="${title}"
          ></todos-item>
        </li>
    `
}
export default class TodosList extends CustomElement {
  keys = ['todos']
  constructor() {
    super()
    this.api = api
    this.storeChangedCallback = this.storeChangedCallback.bind(this)
    this.api.subscribe(this.storeChangedCallback, this.keys)
    this.list = this.querySelector('ul')
  }

  render({ html, state }) {
    const { store = {} } = state
    const { todos = [{ title: 'Edit this Todo.' }] } = store
    const todoItems = todos
      .map(t => li(t))
      .join('\n')


    return html`
    <style>
      :host input:checked + input[type="text"] {
        text-decoration: line-through;
      }
      :host input[type="checkbox"] {
        width: 1rem;
      }
    </style>
    <ul
      class="
        grid
        gap-1
        p0
        list-none
      "
    >
      ${todoItems}
    </ul>
  `
  }

  static get observedAttributes() {
    return [
      'title',
      'completed'
    ]
  }

  storeChangedCallback(store={}) {
    const { todos=[] } = store
    // Surgical updates to maintain focus etc.
    // Update existing items
    todos.forEach(t=> {
      const existingItem = this.querySelector(`todos-item[key="${t.key}"]`)
      if (existingItem) {
        const itemTitle = existingItem.getAttribute('title')
        const itemCompleted = existingItem.getAttribute('completed')
        if (itemTitle != t.title) {
          existingItem.setAttribute('title', t.title)
        }
        if (itemCompleted != t.completed) {
          existingItem.setAttribute('completed', t.completed)
        }
      }
      else {
        // Add new items last
        this.list.append(nodeFromString(li(t)))
      }
    })

    // Remove deleted items
    const items = this.querySelectorAll('li')
    const deletions = []
    items.forEach(item=> {
      const itemKey = item.getAttribute('id')
      const found = todos.find(t => t.key.toString() === itemKey)
      if (!found) {
        deletions.push(item)
      }
    })

    deletions.forEach(item => this.list.removeChild(item))
    deletions.length = 0
  }
}

customElements.define('todos-list', TodosList)
