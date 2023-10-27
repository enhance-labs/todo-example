/* global window, Worker */
import Store from '@enhance/store'
// dependencies below are vendored at the bottom of this file but will be imported eventually.
// import { convertToNestedObject, formEncodingToSchema } from '@begin/validator'

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
      // const results = items.map(item => ({...item, key:item.key.toString()}))
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


////////////////////////////////////////////////////////////////////////////////////
// Code below is from @begin/validator.
// It will be packaged and imported so that it does not include other unnecessary
// Dependencies in that package.
////////////////////////////////////////////////////////////////////////////////////

// eslint-disable-next-line fp/no-class
class DuplicateKeyError extends Error {
  constructor (key) {
    super(`Duplicate key at path part ${key}`)
    this.key = key
  }
}
// eslint-disable-next-line fp/no-class
class MixedArrayError extends Error {
  constructor (key) {
    super(`Mixed array at path part ${key}`)
    this.key = key
  }
}

function isJsonObject (val) {
  return (
    typeof val === 'object' &&
    !Array.isArray(val) &&
    val !== null
  )
}

// removes trailing [] for objects where the array is already constructed
function fixArrayNotationForPlainObjects (entry, isIterable){
  if (Array.isArray(entry.value) && /\[]$/.test(entry.path) && !isIterable) {
    return { path: entry.path.replace(/\[]$/, ''), value: entry.value }
  }
  return entry
}

// for iterable objects like FormData this adds the [] indicator at the end of duplicate key
function allowDuplicatesInIterables (entry, isIterable, keys){
  const key = keys.find(k => k === entry.path)
  if (key && isIterable){
    return { path: `${key}[]`, value: entry.value }
  }
  return entry
}

function extractPathParts (path) {
  const re = /((\d*)\]|([^.[]+))([\[\.]|$)/g

  return Array.from(path.matchAll(re)).map(match => {
    const array = match[2]
    const pathPart = match[3]
    const nextType = match[4]
    const type = array === undefined ? 'object' : 'array'
    const nextDefault = nextType === '[' ? [] : {}
    return {
      path: array ?? pathPart,
      type,
      default: nextDefault,
      pathToPart: path.slice(0, match.index + match[1].length),
    }
  })
}


function handlePathPart (
  pathPart,
  currentPathObject,
  arraysWithOrder,
) {
  if (pathPart.type === 'object') {
    if (Array.isArray(currentPathObject)) {
      throw new DuplicateKeyError(pathPart.pathToPart)
    }
    const currentObject = currentPathObject
    return [
      currentObject[pathPart.path],
      val => (currentObject[pathPart.path] = val),
    ]
  }
  if (!Array.isArray(currentPathObject)) {
    throw new DuplicateKeyError(pathPart.pathToPart)
  }
  const currentArray = currentPathObject
  const isOrdered = pathPart.path !== ''

  const isOrderedArray = arraysWithOrder.has(currentArray)
  if (isOrdered) {
    arraysWithOrder.add(currentArray)
  }
  if (
    (!isOrdered && isOrderedArray) ||
    (isOrdered && !isOrderedArray && currentArray.length > 0)
  ) {
    throw new MixedArrayError(pathPart.pathToPart)
  }

  const order = isOrdered ? Number(pathPart.path) : currentArray.length
  return [ currentArray[order], val => (currentArray[order] = val) ]
}

function convertToNestedObject( formData, { removeEmptyString = false, transformEntry = false, duplicateKeys = [] } = {}){
  let result = {}

  // all arrays we need to squash (in place) later
  const arraysWithOrder = new Set()

  const isIterable = !!(typeof formData[Symbol.iterator] === 'function')

  const entries = isIterable ?  Array.from(formData) : Object.entries(formData)

  for (const entry of entries) {
    if (removeEmptyString && entry[1] === '') continue

    let entryOut
    if (transformEntry) {
      entryOut = transformEntry(entry, isIterable)
    }
    else {
      entryOut =  { path: entry[0], value: entry[1] }
    }
    entryOut = fixArrayNotationForPlainObjects( entryOut, isIterable)
    const { path, value } = allowDuplicatesInIterables(entryOut, isIterable, duplicateKeys)

    const pathParts = extractPathParts(path)

    let currentPathObject = result
    pathParts.forEach((pathPart, idx) => {
      const [ nextPathValue, setNextPathValue ] = handlePathPart(
        pathPart,
        currentPathObject,
        arraysWithOrder,
      )


      if (pathParts.length - 1 === idx) {
        if (nextPathValue !== undefined) {
          throw new DuplicateKeyError(pathPart.pathToPart)
        }
        setNextPathValue(value)
      }
      else {
        if (
          nextPathValue !== undefined &&
          !isJsonObject(nextPathValue) &&
          !Array.isArray(nextPathValue)
        ) {
          throw new DuplicateKeyError(pathPart.pathToPart)
        }

        const nextPathObject = nextPathValue ?? pathPart.default
        currentPathObject = nextPathObject
        setNextPathValue(nextPathObject)
      }
    })
  }

  for (const orderedArray of Array.from(arraysWithOrder)) {
    // replace array with a squashed array
    // array.flat(0) will remove all empty slots (e.g. [0, , 1] => [0, 1])
    orderedArray.splice(0, orderedArray.length, ...orderedArray.flat(0))
  }

  return result
}



function formEncodingToSchema (obj, schema) {
  Object.keys(schema.properties).forEach(prop => {
    let type = schema.properties[prop]?.type
    if (type === 'integer') {
      if (obj[prop]) {
        obj[prop] = parseInt(obj[prop])
      }
      else {
        delete obj[prop]
      }
    }
    else if (type === 'number') {
      if (obj[prop]) {
        obj[prop] = parseFloat(obj[prop])
      }
      else {
        delete obj[prop]
      }
    }
    else if (type === 'string') {
      let format = schema.properties[prop]?.format
      if ((format === 'time' || format === 'date-time')
        && obj[prop].match(/:/g).length === 1) {
        obj[prop] = `${obj[prop]}:00`
      }
    }
    else if (type === 'boolean') {
      obj[prop] = obj[prop] === 'on' || obj[prop] === true ? true : false
    }
    else if (type === 'object') {
      if (obj[prop]) {
        let temp = formEncodingToSchema(obj[prop], schema.properties[prop])
        if (temp) {
          obj[prop] = temp
        }
      }
    }
  })
  return obj
}
