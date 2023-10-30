/* global window, Worker */
import Store from '@enhance/store'
import convertToNestedObject from '@begin/validator/src/convert-to-nested-object.js'
import formEncodingToSchema from '@begin/validator/src/form-encoding-to-schema.js'

const notifyOnInitialize = true // false SSR because markup has initial data

// JSON Schema for DB/CRUD Object
const Schema = {
  id: 'todo',
  type: 'object',
  properties: {
    key: { 'type': 'integer' },
    completed: { 'type': 'boolean' },
    title: { 'type': 'string' },
  }
}


// API actions
const  CREATE  = 'create'
const  UPDATE  = 'update'
const  DESTROY = 'destroy'
const  LIST    = 'list'

// DB/CRUD Object Type
const  ITEM = Schema.id 
const  ITEMS = `${Schema.id}s`

const store = Store()
 
let worker
export default function API() {

  // Create and setup Worker for Backend or Database interaction
  if (!worker) {
    const workerConstants = `
      const CREATE = '${CREATE}'
      const UPDATE = '${UPDATE}'
      const DESTROY = '${DESTROY}'
      const LIST = '${LIST}'
      const ITEM = '${ITEM}'
      const ITEMS = '${ITEMS}'  ` 
    const blob = new Blob([workerConstants, '\n', 'self.onmessage = ', stateMachine.toString()], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    worker =  new Worker(url);
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

function createMutation({ problems={}, ...rest }) {
  const item = rest[ITEM] || {}
  const copy = store?.[ITEMS]?.slice() || []
  copy.push(item)
  store[ITEMS] = copy
  store.problems = problems
}

function updateMutation({ problems={}, ...rest }) {
  const item = rest[ITEM] || {}
  const copy = store?.[ITEMS]?.slice() || []
  copy.splice(copy.findIndex(i => i.key === item.key), 1, item)
  store[ITEMS] = copy
  store.problems = problems
}

function destroyMutation({ problems={}, ...rest }) {
  const item = rest[ITEM] || {}
  let copy = store?.[ITEMS]?.slice() || []
  copy.splice(copy.findIndex(i => i.key === item.key), 1)
  store[ITEMS] = copy
  store.problems = problems
}

function listMutation({  problems={}, ...rest }) {
  const items = rest[ITEMS] || []
  if (notifyOnInitialize) {
    // For CSR we directly set the store so that callbacks are called 
    // to rerender with data
    store[ITEMS] = items
    store.problems = problems
  } else {
    // For SSR we use initialize to avoid calling subscribed callbacks
    // which would cause an unnecessary rerender
    store.initialize({ [ITEMS]:items, problems }) 
  }
}

function processForm(form) {
  return JSON.stringify(
    formEncodingToSchema( convertToNestedObject(new FormData(form)), Schema)
  )
}

function create(form) {
  const item = processForm(form)
  worker.postMessage({
    type: CREATE,
    data: item
  })
}

function destroy (form) {
  const item = processForm(form)
  worker.postMessage({
    type: DESTROY,
    data: item
  })
}

function list () {
  worker.postMessage({
    type: LIST
  })
}

function update (form) {
  const item = processForm(form)
  worker.postMessage({
    type: UPDATE,
    data: item
  })
}

// Web Worker for IndexedDB 
 
async function stateMachine ({ data }) {

  await importScripts('https://cdn.jsdelivr.net/npm/idb@7/build/umd.js')
  const dbName = `${ITEMS}DB`
  const dbStoreName = `${ITEMS}Store`
  const db = await idb.openDB(dbName, 1, {
    upgrade(db) {
      const store = db.createObjectStore(dbStoreName, {
        keyPath: 'key',
        autoIncrement: true,
      });
    },
  });


  const { data: payload, type } = data
  switch (type) {
  case CREATE:
    try {
      const item = JSON.parse(payload)
      const resultKey = await db.put(dbStoreName, item)
      const result = {...item, key:resultKey}
      self.postMessage({
        type: CREATE,
        result:{[ITEM]:result}
      })
    }
    catch (err) {
      // RESPOND WITH ERROR
      console.error(err)
    }
    break
  case UPDATE:
    try {
      const item = JSON.parse(payload)
      await db.put(dbStoreName, item)
      self.postMessage({
        type: UPDATE,
        result:{[ITEM]:item}
      })
    }
    catch (err) {
      console.error(err)
    }
    break
  case DESTROY:
    try {
      const key = JSON.parse(payload).key
      await db.delete(dbStoreName,key)
      self.postMessage({
        type: DESTROY,
        result:key
      })
    }
    catch (err) {
      // RESPOND WITH ERROR
      console.error(err)
    }
    break
  case LIST:
    try {
      const items = await db.getAll(dbStoreName)
      self.postMessage({
        type: LIST,
        result:{[ITEMS]:items}
      })
    }
    catch (err) {
      // RESPOND WITH ERROR
      console.error(err)
    }
    break
  }
}


