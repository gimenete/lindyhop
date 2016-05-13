/* global describe it */
var express = require('express')
var bodyParser = require('body-parser')
var request = require('supertest')
var assert = require('assert')

var app = express()
app.use(bodyParser.urlencoded({ extended: true }))

var lindyhop = require('../')
var rejects = lindyhop.rejects
var AbstractValidator = lindyhop.AbstractValidator

class ObjectValidator extends AbstractValidator {
  model (clazz) {
    this.clazz = clazz
    return this
  }

  validate (value) {
    return this.clazz.findById(value)
      .then((obj) => {
        if (!obj && !this.isOptional) {
          return rejects.notFound(`${this.field} not found`)
        }
        return obj
      })
  }
}

lindyhop.addValidator('object', ObjectValidator)

var lindy = lindyhop.hop(app)
var users = lindy.router('/users')
var Users = {
  findById (id) {
    return Promise.resolve({ _id: id })
  }
}

users.post('/foo', 'This is what this endpoint does')
  .params((validate) => {
    validate
      .string('type', 'The type of foo you want to get')
      .optional()
      .trim()
      .lowerCase()
    validate
      .number('bar')
      .min(0)
      .max(100)
    validate
      .object('userId', 'The id of the user for something')
      .model(Users)
      .as('user')
  })
  .run((params) => {
    return params
  })

describe('Test', () => {
  it('something', (done) => {
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
        console.log('....', res.text, res.statusCode)
        done()
      })
  })
})
