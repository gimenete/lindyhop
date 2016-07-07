/* global describe it */
var express = require('express')
var bodyParser = require('body-parser')
var request = require('supertest')
var assert = require('assert')
var path = require('path')

var app = express()
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.set('view engine', 'pug')
app.set('views', path.join(__dirname, 'views'))

var lindyhop = require('../')
var { rejects } = lindyhop

class EntityValidator extends lindyhop.AbstractValidator {
  model (clazz) {
    this.clazz = clazz
    return this
  }

  validate (value) {
    return this.clazz.findById(value)
      .then((obj) => {
        if (!obj && !this.isOptional) {
          return this.validationError(`User with id '${value}' not found`)
        }
        return obj
      })
  }
}

lindyhop.validator('entity', EntityValidator)
lindyhop.middleware('pagination', (req, res, options, params) => {
  params.offset = +req.query.offset || 0
  params.limit = (options && options.limit) || 50
})
lindyhop.middleware('promise', (req, res, options, params) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      params.future = true
      resolve()
    }, 10)
  })
})

var lindy = lindyhop.hop(app, {
  'title': 'Swagger Sample App',
  'description': 'This is a sample server Petstore server.',
  'termsOfService': 'http://swagger.io/terms/',
  'contact': {
    'name': 'API Support',
    'url': 'http://www.swagger.io/support',
    'email': 'support@swagger.io'
  },
  'license': {
    'name': 'Apache 2.0',
    'url': 'http://www.apache.org/licenses/LICENSE-2.0.html'
  },
  'version': '1.0.1'
})
var users = lindy.router('/users')
var Users = {
  findById (id) {
    return Promise.resolve(id && { _id: id })
  }
}

users.post('/foo', 'This is what this endpoint does')
  .params((validate) => {
    validate
      .string('type', 'The type of foo you want to get')
      .optional()
      .notEmpty()
      .trim()
      .lowerCase()
    validate
      .number('bar')
      .min(0)
      .max(100)
    validate
      .entity('userId', 'The id of the user for something')
      .model(Users)
      .as('user')
  })
  .run((params) => {
    return params
  })

users.get('/foo', 'This is what this endpoint does')
  .middleware('pagination', { limit: 100 })
  .params((validate) => {
    validate
      .string('type', 'The type of foo you want to get')
      .optional()
      .notEmpty()
      .trim()
      .upperCase()
    validate
      .string('foo', 'Whatever')
      .optional()
      .default('bar')
  })
  .run((params) => {
    return params
  })

users.get('/array', 'This is what this endpoint does')
  .params((validate) => {
    validate
      .string('type', 'The type of foo you want to get')
      .array()
  })
  .run((params) => {
    return params
  })

users.get('/html', 'This is what this endpoint does')
  .outputs('html', 'index')
  .run((params) => {
    return { message: 'Hello world' }
  })

users.get('/errorString', 'This endpoint rejects with a string')
  .run((params) => rejects.internalError('myErrorString'))

users.get('/errorMessage', 'This endpoint rejects with a string and a message')
  .run((params) => rejects.internalError('myErrorString', 'My message'))

users.get('/errorObject', 'This endpoint rejects with an error object')
  .run((params) => {
    throw new Error('myError')
  })

users.get('/errorPromise', 'This endpoint rejects with an error object')
  .run((params) => Promise.reject({ status: 'A regular rejected promise' }))

users.delete('/delete', 'A DELETE endpoint')
  .run((params) => params)

users.put('/put', 'A PUT endpoint')
  .run((params) => params)

users.patch('/patch', 'A PATCH endpoint')
  .run((params) => params)

users.get('/middlewares', 'An endpoint with multiple middlewares')
  .middlewares('pagination', 'promise')
  .run((params) => params)

users.get('/missingMiddleware', 'An endpoint with bad configuration')
  .middlewares('unknown')
  .run((params) => params)

users.get('/inline/:foo', 'An endpoint with an inlined value')
  .params((validate) => {
    validate
      .string('foo', 'Some inlined value')
      .in('path')
  })
  .run((params) => params)

users.get('/header', 'An endpoint with a value taken from the headers')
  .params((validate) => {
    validate
      .string('x-foo', 'Some custom header')
      .in('header')
      .as('foo')
  })
  .run((params) => params)

describe('Test', () => {
  it('tests a GET with success and middleware', (done) => {
    request(app)
      .get('/users/foo')
      .query({
        type: 'FooBar'
      })
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, {'type': 'FOOBAR', 'foo': 'bar', limit: 100, offset: 0})
        done()
      })
  })

  it('tests a POST with success', (done) => {
    request(app)
      .post('/users/foo')
      .type('form')
      .send({
        type: 'FooBar',
        bar: '100',
        userId: '123'
      })
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, {'type': 'foobar', 'bar': 100, 'user': {'_id': '123'}})
        done()
      })
  })

  it('tests mandatory param', (done) => {
    request(app)
      .post('/users/foo')
      .type('form')
      .send({
        bar: '100'
      })
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 400)
        assert.deepEqual(res.body, {
          error: 'ValidationError',
          message: 'Bad request. Check the errors',
          errors: [{
            field: 'userId',
            message: '\'userId\' is mandatory'
          }]
        })
        done()
      })
  })

  it('tests an invalid string', (done) => {
    request(app)
      .post('/users/foo')
      .send({
        type: 100,
        bar: '100',
        userId: '123'
      })
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 400)
        assert.deepEqual(res.body, {
          error: 'ValidationError',
          message: 'Bad request. Check the errors',
          errors: [{
            field: 'type',
            message: '\'type\' must be a string. Received \'100\''
          }]
        })
        done()
      })
  })

  it('tests number parsing error', (done) => {
    request(app)
      .post('/users/foo')
      .type('form')
      .send({
        type: 'FooBar',
        bar: 'not-a-number',
        userId: '123'
      })
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 400)
        assert.deepEqual(res.body, {
          error: 'ValidationError',
          message: 'Bad request. Check the errors',
          errors: [{
            field: 'bar',
            message: '\'bar\' must be a number. Received \'not-a-number\''
          }]
        })
        done()
      })
  })

  it('tests min value constraint', (done) => {
    request(app)
      .post('/users/foo')
      .type('form')
      .send({
        type: 'FooBar',
        bar: '-100',
        userId: '123'
      })
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 400)
        assert.deepEqual(res.body, {
          error: 'ValidationError',
          message: 'Bad request. Check the errors',
          errors: [{
            field: 'bar',
            message: '\'bar\' must be greater or equal to 0. Received \'-100\''
          }]
        })
        done()
      })
  })

  it('tests max value constraint', (done) => {
    request(app)
      .post('/users/foo')
      .type('form')
      .send({
        type: 'FooBar',
        bar: '200',
        userId: '123'
      })
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 400)
        assert.deepEqual(res.body, {
          error: 'ValidationError',
          message: 'Bad request. Check the errors',
          errors: [{
            field: 'bar',
            message: '\'bar\' must be lower or equal to 100. Received \'200\''
          }]
        })
        done()
      })
  })

  it('tests not empty constraint', (done) => {
    request(app)
      .post('/users/foo')
      .type('form')
      .send({
        type: '',
        bar: '100',
        userId: '123'
      })
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 400)
        assert.deepEqual(res.body, {
          error: 'ValidationError',
          message: 'Bad request. Check the errors',
          errors: [{
            field: 'type',
            message: '\'type\' must not be empty. Received \'\''
          }]
        })
        done()
      })
  })

  it('tests a get with two errors', (done) => {
    request(app)
      .post('/users/foo')
      .type('form')
      .send({
        type: 'FooBar',
        bar: 'not-a-number',
        userId: ''
      })
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 400)
        assert.deepEqual(res.body, {
          error: 'ValidationError',
          message: 'Bad request. Check the errors',
          errors: [
            {
              field: 'bar',
              message: '\'bar\' must be a number. Received \'not-a-number\''
            },
            {
              field: 'userId',
              message: 'User with id \'\' not found'
            }
          ]})
        done()
      })
  })

  it('test an error string', (done) => {
    request(app)
      .get('/users/errorString')
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 500)
        assert.deepEqual(res.body, { error: 'InternalError', message: 'myErrorString' })
        done()
      })
  })

  it('test an error message', (done) => {
    request(app)
      .get('/users/errorMessage')
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 500)
        assert.deepEqual(res.body, { error: 'myErrorString', message: 'My message' })
        done()
      })
  })

  it('test an error string', (done) => {
    request(app)
      .get('/users/errorObject')
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 500)
        assert.deepEqual(res.body, { error: 'InternalError', message: 'myError' })
        done()
      })
  })

  it('test a regular rejected promise', (done) => {
    request(app)
      .get('/users/errorPromise')
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 500)
        assert.deepEqual(res.body, { status: 'A regular rejected promise' })
        done()
      })
  })

  it('tests a DELETE endpoint', (done) => {
    request(app)
      .delete('/users/delete')
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, {})
        done()
      })
  })

  it('tests a PUT endpoint', (done) => {
    request(app)
      .put('/users/put')
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, {})
        done()
      })
  })

  it('tests a PATCH endpoint', (done) => {
    request(app)
      .patch('/users/patch')
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, {})
        done()
      })
  })

  it('tests multiple middlewares', (done) => {
    request(app)
      .get('/users/middlewares')
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, { 'future': true, 'limit': 50, 'offset': 0 })
        done()
      })
  })

  it('tests a missing middleware', (done) => {
    request(app)
      .get('/users/missingMiddleware')
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 500)
        assert.deepEqual(res.body, { error: 'InternalError', message: 'Middleware not found \'unknown\'' })
        done()
      })
  })

  it('tests an invalid in() parameter', () => {
    assert.throws(() => {
      users.get('/', 'An endpoint with bad configuration')
        .params((validate) => {
          validate
            .string('foo', 'Some parameter')
            .in('foo')
        })
        .run((params) => params)
    })
  })

  it('tests an inlined parameter', (done) => {
    request(app)
      .get('/users/inline/bar')
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, { foo: 'bar' })
        done()
      })
  })

  it('tests a header value', (done) => {
    request(app)
      .get('/users/header')
      .set('x-foo', 'bar')
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, { foo: 'bar' })
        done()
      })
  })

  it('tests an array value', (done) => {
    request(app)
      .get('/users/array')
      .query({
        type: ['foo', 'bar']
      })
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, { type: ['foo', 'bar'] })
        done()
      })
  })

  it('tests an array value but sending only a single value', (done) => {
    request(app)
      .get('/users/array')
      .query({
        type: 'foo'
      })
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, { type: ['foo'] })
        done()
      })
  })

  it('tests HTML output', (done) => {
    request(app)
      .get('/users/html')
      .end((err, res) => {
        assert.ifError(err)
        assert.equal(res.statusCode, 200)
        assert.equal(res.text, '<h1>Hello world</h1>')
        done()
      })
  })

  it('tests docs', () => {
    var docs = lindy.docs()
    assert.ok(docs)
    // require('fs').writeFileSync('api.json', JSON.stringify(docs, null, 2))
  })
})
