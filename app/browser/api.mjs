/* global window, Worker */
import Store from '@enhance/store'
const store = Store()

const CREATE  = 'create'
const UPDATE  = 'update'
const DESTROY = 'destroy'
const LIST    = 'list'

let worker
export default function API() {
  if (!worker) {
    worker = makeWorker(stateMachine)
    worker.onmessage = mutate
  }

  initialize()

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
  list()
}

function mutate(e) {
  const { data } = e
  const { result, type } = data
  switch (type) {
  case CREATE:
    createMutation(result)
    break
  case UPDATE:
    updateMutation(result)
    break
  case DESTROY:
    destroyMutation(result)
    break
  case LIST:
    listMutation(result)
    break
  }
}

function createMutation({ todo={}, problems={} }) {
  const copy = store?.todos?.slice() || []
  copy.push(todo)
  store.todos = copy
  store.problems = problems
}

function updateMutation({ todo={}, problems={} }) {
  const copy = store?.todos?.slice() || []
  copy.splice(copy.findIndex(i => i.key === todo.key), 1, todo)
  store.todos = copy
  store.problems = problems
}

function destroyMutation({ todo={}, problems={} }) {
  let copy = store?.todos?.slice() || []
  copy.splice(copy.findIndex(i => i.key === todo.key), 1)
  store.todos = copy
  store.problems = problems
}

function listMutation({ todos=[], problems={} }) {
  // For SSR we use initialize to avoid calling subscribed callbacks
  // which would cause an unnecessary rerender
  // store.initialize({ todos, problems })
  // For CSR we directly set the store so that callbacks are called 
  // to rerender with data
  store.todos = todos
  store.problems = problems
}

function processForm(form) {
  return JSON.stringify(
    Object.fromEntries(
      new FormData(form)
    )
  )
}

function create(form) {
  const todo = processForm(form)
  worker.postMessage({
    type: CREATE,
    data: todo
  })
}

function destroy (form) {
  const todo = processForm(form)
  worker.postMessage({
    type: DESTROY,
    data: todo
  })
}

function list () {
  worker.postMessage({
    type: LIST
  })
}

function update (form) {
  const todo = processForm(form)
  worker.postMessage({
    type: UPDATE,
    data: todo
  })
}

// Web Worker for IndexedDB 
 
function makeWorker(fn) {
  var blob = new Blob(['self.onmessage = ', fn.toString()], { type: 'text/javascript' });
  var url = URL.createObjectURL(blob);
  return new Worker(url);
}

async function stateMachine ({ data }) {

  await importScripts('https://cdn.jsdelivr.net/npm/idb@7/build/umd.js')
  const db = await idb.openDB('Todos', 1, {
    upgrade(db) {
      const store = db.createObjectStore('todos', {
        keyPath: 'key',
        autoIncrement: true,
      });
    },
  });

  /* global self */
  const CREATE  = 'create'
  const UPDATE  = 'update'
  const DESTROY = 'destroy'
  const LIST    = 'list'

  const { data: payload, type } = data
  switch (type) {
  case CREATE:
    try {
      const parsed = JSON.parse(payload)
      const newItem = {...parsed, completed:false}
      const resultKey = await db.put('todos', newItem)
      const result = {...newItem, key:resultKey.toString()}
      self.postMessage({
        type: CREATE,
        result:{todo:result}
      })
    }
    catch (err) {
      // RESPOND WITH ERROR
      console.error(err)
    }
    break
  case UPDATE:
    try {
      const parsed = JSON.parse(payload)
      const newItem = {...parsed, completed:!!parsed.completed}
      await db.put('todos', {...newItem, key:parseInt(newItem.key)})
      self.postMessage({
        type: UPDATE,
        result:{todo:newItem}
      })
    }
    catch (err) {
      console.error(err)
    }
    break
  case DESTROY:
    try {
      const stringKey = JSON.parse(payload).key
      const intKey = parseInt(stringKey)
      await db.delete('todos',intKey)
      self.postMessage({
        type: DESTROY,
        result:stringKey
      })
    }
    catch (err) {
      // RESPOND WITH ERROR
      console.error(err)
    }
    break
  case LIST:
    try {
      const Items = await db.getAll('todos')
      const result = Items.map(item=>{return{...item,key:item.key.toString()}})
      self.postMessage({
        type: LIST,
        result:{todos:result}
      })
    }
    catch (err) {
      // RESPOND WITH ERROR
      console.error(err)
    }
    break
  }
}
