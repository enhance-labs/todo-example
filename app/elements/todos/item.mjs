export default function TodosItem({ html, state }) {
  const { attrs } = state
  const { completed='', created='', key='', title='' } = attrs
  const checked = completed === 'true' ? 'checked' : ''

  return html`
    <form
     action="/todos/${key}"
     class="
      flex
      flex-grow
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
      action="/todos/${key}/delete"
      method="POST"
    >
      <input type="hidden" name="key" value="${key}">
      <button class="p-2">❌</button>
    </form>
  `
}
