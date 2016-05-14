/* global describe it */
var express = require('express')
var bodyParser = require('body-parser')
var request = require('supertest')
var assert = require('assert')

var app = express()
app.use(bodyParser.urlencoded({ extended: true }))

var lindyhop = require('../')
var { AbstractValidator, rejects } = lindyhop

class EntityValidator extends AbstractValidator {
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
  params.limit = 100
})

var lindy = lindyhop.hop(app)
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
  .middleware('pagination')
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
          field: 'userId',
          message: '\'userId\' is mandatory'
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
          field: 'bar',
          message: '\'bar\' must be a number. Received \'not-a-number\''
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
          field: 'bar',
          message: '\'bar\' must be greater or equal to 0. Received \'-100\''
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
          field: 'bar',
          message: '\'bar\' must be lower or equal to 100. Received \'200\''
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
          field: 'type',
          message: '\'type\' must not be empty. Received \'\''
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
          errors: [
            {
              error: 'ValidationError',
              field: 'bar',
              message: '\'bar\' must be a number. Received \'not-a-number\''
            },
            {
              error: 'ValidationError',
              field: 'userId',
              message: 'User with id \'\' not found'
            }
          ]})
        done()
      })
  })
})
