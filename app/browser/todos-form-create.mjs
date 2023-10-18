/* globals customElements */
import CustomElement from '@enhance-labs/custom-element'
import API from './api.mjs'
const api = API()

export default class TodosFormCreate extends CustomElement {
  constructor() {
    super()
    this.api = api
    this.submit = this.submit.bind(this)
    this.resetForm = this.resetForm.bind(this)
    this.addEventListener('submit', this.submit)
    this.form = this.querySelector('form')
    this.textInput = this.querySelector('input[type="text"]')
  }

  render({ html }) {
    const borderClasses = `
border1
border-solid
border-current
radius0
overflow-hidden
`

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
    this.textInput.focus()
  }

  resetForm() {
    this.textInput.value = ''
    this.textInput.focus()
  }

  submit(e) {
    e.preventDefault()
    this.api.create(this.form)
    this.resetForm()
  }
}

export const render = TodosFormCreate.prototype.render;

customElements.define('todos-form-create', TodosFormCreate )
