import enhance from '@enhance/element'
import TodosFormCreate from '../elements/todos/form-create.mjs'
import TodosList from '../elements/todos/list.mjs'
import TodosItem from '../elements/todos/item.mjs'
import API from './api.mjs'
const api = API()

enhance('todos-form-create', {
  api,
  keys: [ 'problems' ],
  init() {
    this.submit = this.submit.bind(this)
    this.addEventListener('submit', this.submit)
    this.form = this.querySelector('form')
  },
  render: TodosFormCreate,
  submit(e) {
    e && e.preventDefault()
    this.api.create(this.form)
  }
})

enhance('todos-list', {
  api,
  keys: [ 'todos' ],
  render: TodosList
})

enhance('todos-item', {
  api,
  init() {
    this.update = this.update.bind(this)
    this.delete = this.delete.bind(this)
    const key = this.getAttribute('key')
    this.updateForm = this.querySelector(`#update-form-${key}`)
    this.deleteForm = this.querySelector(`#delete-form-${key}`)
    this.updateForm.addEventListener('submit', this.update)
    this.deleteForm.addEventListener('submit', this.delete)
  },
  update(e) {
    e.preventDefault()
    this.api.update(this.updateForm)
  },
  delete(e) {
    e.preventDefault()
    this.api.destroy(this.deleteForm)
  },
  render: TodosItem
})
