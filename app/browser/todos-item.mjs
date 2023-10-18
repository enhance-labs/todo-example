
/* globals customElements */
import CustomElement from '@enhance-labs/custom-element'
import API from './api.mjs'
const api = API()

export default class TodosItem extends CustomElement {
  constructor() {
    super()
    this.api = api
    this.update = this.update.bind(this)
    this.updateChecked = this.updateChecked.bind(this)
    this.destroy = this.destroy.bind(this)
    this.shouldCallAPI = this.shouldCallAPI.bind(this)

    this.updateForm = this.querySelector('.update-todo')
    this.deleteForm = this.querySelector('.delete-todo')
    this.updateForm.addEventListener('submit', this.update)
    this.deleteForm.addEventListener('submit', this.destroy)
    this.checkboxInput = this.querySelector('input[type="checkbox"]')
    this.checkboxInput.addEventListener('click', this.updateChecked)
    this.textInput = this.querySelector('input[type="text"]')
    this.textInput.addEventListener('focusout', this.shouldCallAPI)
  }

  static get observedAttributes() {
    return [
      'title',
      'completed',
      'key'
    ]
  }

  titleChanged(value) {
    if (this.textInput) {
      this.textInput.value = value
    }
  }

  keyChanged(value) {
    if (this.updateForm && this.deleteForm) {
      this.updateForm.action = `/todos/${value}`
      this.updateForm.querySelector('input[type=hidden][name=key]').value = value
      this.deleteForm.action = `/todos/${value}/delete`
      this.deleteForm.querySelector('input[type=hidden]').value = value
    }
  }

  completedChanged(value) {
    if (this.checkboxInput) {
      if (value === 'true') {
        this.checkboxInput.checked = true
      }
      else {
        this.checkboxInput.checked = false
      }
    }
  }

  shouldCallAPI(e) {
    // Cuts down on unnecessary API calls
    const title = this.getAttribute('title')
    const value = e.target.value
    if (title !== value) {
      this.update()
    }
  }

  update(e) {
    // Check for the existance of the event so we can call this method from other handlers
    e && e.preventDefault()
    this.api.update(this.updateForm)
  }

  updateChecked(e) {
    e && e.preventDefault()
    // Would be nice to be able to set the checked state _before_ making the api call.
    this.update()
  }

  destroy(e) {
    e.preventDefault()
    this.api.destroy(this.deleteForm)
  }

  render({ html, state }) {
    const { attrs ={} } = state
    const { completed='', created='', key='', title='' } = attrs
    const checked = completed === 'true' ? 'checked' : ''

    return html`
    <form
     action="/todos/${key}"
     class="
      flex
      flex-grow
      items-center
      update-todo
     "
     method="POST"
    >
      <input
        class="
         inline-block
         mr1
         radius1
        "
        name="completed"
        type="checkbox"
        ${checked}
      >
      <input
        type="text"
        name="title"
        value="${title}"
        class="
          flex-grow
          mr1
          p-2
        "
      >
      <input
        type="hidden"
        name="created"
        value="${created}"
      >
      <input type="hidden" name="key" value="${key}">
    </form>

    <form
      class="delete-todo"
      action="/todos/${key}/delete"
      method="POST"
    >
      <input type="hidden" name="key" value="${key}">
      <button class="p-2">❌</button>
    </form>
  `
  }
}

export const render = TodosItem.prototype.render;

customElements.define('todos-item', TodosItem)
